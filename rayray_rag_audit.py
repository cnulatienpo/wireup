#!/usr/bin/env python3
"""RAG audit/tracing runner for Ray Ray.

Usage:
    DEBUG_RAG=true python rayray_rag_audit.py "how do i stitch clips together"
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib import request
from uuid import uuid4

from sentence_transformers import SentenceTransformer
from backend.query_classifier import classify_query
from backend.prompt_composer import SYSTEM_PROMPT, compose_prompt
from backend.response_formatter import format_action_response
from backend.workflow_generator import generate_workflow
from backend.workflow_verifier import verify_workflow
from backend.ui_action_generator import generate_ui_actions
from backend.retrieval_router import print_debug_table, rank_documents
from backend.session_memory import get_session, is_follow_up_query, update_session
from backend.conversation_examples import (
    load_conversation_examples,
    log_conversation_example_influence,
    select_similar_examples,
)

ROOT = Path(__file__).resolve().parent
GENERATED_RECIPES_PATH = ROOT / "data" / "wireup_runtime" / "generated_recipes.json"


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export "):].strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key or key in os.environ:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        os.environ[key] = value


load_env_file(ROOT / ".env")

DEFAULT_LOG_DIR = ROOT / "logs"
DEBUG_RAG = os.getenv("DEBUG_RAG", "false").lower() == "true"


@dataclass
class Chunk:
    document_id: str
    document_type: str  # operator | recipe | use_case | question | failure_mode
    operator_name: str
    text: str
    source_file: str
    metadata: Dict[str, Any]
    embedding: List[float] | None = None


EMBEDDING_MODEL_NAME = os.getenv("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")
GENERATED_KNOWLEDGE_DIR = ROOT / "knowledge" / "generated"
RECIPES_GENERATED_PATH = GENERATED_KNOWLEDGE_DIR / "recipes_generated.json"
USE_CASES_GENERATED_PATH = GENERATED_KNOWLEDGE_DIR / "use_cases_generated.json"
QUESTIONS_GENERATED_PATH = GENERATED_KNOWLEDGE_DIR / "questions_generated.json"
CONTROL_MAPPINGS_PATH = ROOT / "knowledge" / "control_mappings" / "control_mappings.json"
TASK_ALIASES_PATH = ROOT / "knowledge" / "task_aliases" / "task_aliases.json"
OPERATOR_GRAPH_PATH = ROOT / "knowledge" / "operator_graph" / "operator_graph.json"
OPERATORS_DIR = ROOT / "knowledge" / "operators"
OPERATOR_LOOKUP_PATH = ROOT / "data" / "wireup_runtime" / "operator_lookup.json"
MASTER_INDEX_PATH = ROOT / "data" / "wireup_runtime" / "master_index.json"
GOAL_INFERENCE_MIN_CONFIDENCE = float(os.getenv("GOAL_INFERENCE_MIN_CONFIDENCE", "0.2"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def classify_query_type(user_query: str) -> str:
    return classify_query(user_query)


def _iter_json_stream(raw: str) -> Iterable[Dict[str, Any]]:
    decoder = json.JSONDecoder()
    idx = 0
    length = len(raw)
    while idx < length:
        while idx < length and raw[idx].isspace():
            idx += 1
        if idx >= length:
            break
        obj, next_idx = decoder.raw_decode(raw, idx)
        yield obj
        idx = next_idx


def load_glossary() -> List[Chunk]:
    chunks: List[Chunk] = []
    glossary_path = ROOT / "td simple glossery.json"
    if not glossary_path.exists():
        return chunks

    raw = glossary_path.read_text(encoding="utf-8")
    for block_idx, obj in enumerate(_iter_json_stream(raw), start=1):
        for entry in obj.get("glossary", []):
            term = str(entry.get("term", "unknown")).strip() or "unknown"
            text = " ".join(
                [
                    str(entry.get("plain_meaning", "")),
                    str(entry.get("what_it_is_not", "")),
                    str(entry.get("mental_model", "")),
                    str(entry.get("example", "")),
                ]
            ).strip()
            chunks.append(
                Chunk(
                    document_id=f"glossary_{block_idx}_{re.sub(r'[^a-z0-9]+', '_', term.lower()).strip('_')}",
                    document_type="operator",
                    operator_name=term,
                    text=text,
                    source_file=str(glossary_path.relative_to(ROOT)),
                    metadata={
                        "document_type": "operator",
                        "term": term,
                    },
                )
            )

    return chunks


def load_operator_recipes_and_failures() -> Tuple[List[Chunk], List[Chunk]]:
    recipe_chunks: List[Chunk] = []
    failure_chunks: List[Chunk] = []

    master_index_path = ROOT / "data" / "wireup_runtime" / "master_index.json"
    if not master_index_path.exists():
        return recipe_chunks, failure_chunks

    master = json.loads(master_index_path.read_text(encoding="utf-8"))
    for operator_key, operator in master.get("operators", {}).items():
        name = str(operator.get("name", operator_key))
        for idx, recipe in enumerate(operator.get("recipes", []) or [], start=1):
            if isinstance(recipe, dict):
                text = " ".join(str(v) for v in recipe.values())
            else:
                text = str(recipe)
            if text.strip():
                recipe_chunks.append(
                    Chunk(
                        document_id=f"recipe_{operator_key}_{idx}",
                        document_type="recipe",
                        operator_name=name,
                        text=text,
                        source_file=str(master_index_path.relative_to(ROOT)),
                        metadata={
                            "document_type": "recipe",
                            "operator": name,
                        },
                    )
                )

        for idx, issue in enumerate(operator.get("failure_modes", []) or [], start=1):
            if isinstance(issue, dict):
                text = " ".join(str(v) for v in issue.values())
            else:
                text = str(issue)
            if text.strip():
                failure_chunks.append(
                    Chunk(
                        document_id=f"failure_mode_{operator_key}_{idx}",
                        document_type="failure_mode",
                        operator_name=name,
                        text=text,
                        source_file=str(master_index_path.relative_to(ROOT)),
                        metadata={
                            "document_type": "failure_mode",
                            "operator": name,
                        },
                    )
                )

    return recipe_chunks, failure_chunks


def load_operator_definitions() -> Dict[str, Dict[str, Any]]:
    definitions: Dict[str, Dict[str, Any]] = {}

    if OPERATORS_DIR.exists():
        for operator_file in OPERATORS_DIR.glob("*.json"):
            try:
                payload = json.loads(operator_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue

            if not isinstance(payload, dict):
                continue

            name = str(payload.get("operator_name") or payload.get("name") or "").strip()
            if name:
                definitions[name] = payload

    if OPERATOR_LOOKUP_PATH.exists():
        lookup_payload = json.loads(OPERATOR_LOOKUP_PATH.read_text(encoding="utf-8"))
        if isinstance(lookup_payload, dict):
            for normalized_name in lookup_payload.values():
                name = str(normalized_name).strip()
                if name and name not in definitions:
                    definitions[name] = {"operator_name": name}

    if MASTER_INDEX_PATH.exists():
        master_payload = json.loads(MASTER_INDEX_PATH.read_text(encoding="utf-8"))
        operators = master_payload.get("operators", {}) if isinstance(master_payload, dict) else {}
        if isinstance(operators, dict):
            for operator_payload in operators.values():
                if not isinstance(operator_payload, dict):
                    continue
                name = str(operator_payload.get("name") or "").strip()
                if name and name not in definitions:
                    definitions[name] = {"operator_name": name}

    return definitions


def load_recipes() -> List[Chunk]:
    chunks: List[Chunk] = []
    if not RECIPES_GENERATED_PATH.exists():
        return chunks

    payload = json.loads(RECIPES_GENERATED_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return chunks

    for entry in payload:
        if not isinstance(entry, dict):
            continue
        recipe_id = str(entry.get("recipe_id", "")).strip()
        goal = str(entry.get("goal", "")).strip()
        operators = [str(op).strip() for op in entry.get("operators", []) if str(op).strip()]
        workflow_steps = [str(step).strip() for step in entry.get("workflow_steps", []) if str(step).strip()]
        text = f"Goal: {goal}. Operators: {', '.join(operators)}. Steps: {'; '.join(workflow_steps)}.".strip()
        if recipe_id and text:
            chunks.append(
                Chunk(
                    document_id=recipe_id,
                    document_type="recipe",
                    operator_name=" -> ".join(operators) or "Generated Recipe",
                    text=text,
                    source_file=str(RECIPES_GENERATED_PATH.relative_to(ROOT)),
                    metadata={
                        "document_type": "recipe",
                        "recipe_id": recipe_id,
                        "operators": operators,
                    },
                )
            )

    return chunks


def load_use_cases() -> List[Chunk]:
    chunks: List[Chunk] = []
    if not USE_CASES_GENERATED_PATH.exists():
        return chunks

    payload = json.loads(USE_CASES_GENERATED_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return chunks

    for entry in payload:
        if not isinstance(entry, dict):
            continue
        use_case_id = str(entry.get("use_case_id", "")).strip()
        goal = str(entry.get("goal", "")).strip()
        operators = [str(op).strip() for op in entry.get("operators", []) if str(op).strip()]
        related_recipe = str(entry.get("related_recipe", "")).strip()
        text = f"Use case: {goal}. Operators: {', '.join(operators)}. Related recipe: {related_recipe}.".strip()
        if use_case_id and text:
            chunks.append(
                Chunk(
                    document_id=use_case_id,
                    document_type="use_case",
                    operator_name=" -> ".join(operators) or "Use Case",
                    text=text,
                    source_file=str(USE_CASES_GENERATED_PATH.relative_to(ROOT)),
                    metadata={
                        "document_type": "use_case",
                        "goal": goal,
                        "related_recipe": related_recipe,
                        "operators": operators,
                    },
                )
            )

    return chunks


def load_questions() -> List[Chunk]:
    chunks: List[Chunk] = []
    if not QUESTIONS_GENERATED_PATH.exists():
        return chunks

    payload = json.loads(QUESTIONS_GENERATED_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return chunks

    for idx, entry in enumerate(payload, start=1):
        if not isinstance(entry, dict):
            continue
        question = str(entry.get("question", "")).strip()
        use_case = str(entry.get("use_case", "")).strip()
        if question:
            chunks.append(
                Chunk(
                    document_id=f"question_{idx}_{_slugify(question)}",
                    document_type="question",
                    operator_name="Question Variant",
                    text=question,
                    source_file=str(QUESTIONS_GENERATED_PATH.relative_to(ROOT)),
                    metadata={
                        "document_type": "question",
                        "use_case": use_case,
                    },
                )
            )

    return chunks


def load_control_mappings() -> List[Chunk]:
    chunks: List[Chunk] = []
    if not CONTROL_MAPPINGS_PATH.exists():
        return chunks

    payload = json.loads(CONTROL_MAPPINGS_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return chunks

    for idx, entry in enumerate(payload, start=1):
        if not isinstance(entry, dict):
            continue

        operator = str(entry.get("operator", "")).strip()
        parameter = str(entry.get("parameter", "")).strip()
        signal_type = str(entry.get("signal_type", "")).strip()
        accepts_external_control = bool(entry.get("accepts_external_control", False))
        driver_nodes = [str(node).strip() for node in entry.get("driver_nodes", []) if str(node).strip()]
        connection_methods = [
            str(method).strip() for method in entry.get("connection_methods", []) if str(method).strip()
        ]
        typical_goal = str(entry.get("typical_goal", "")).strip()

        if not operator or not parameter:
            continue

        text = (
            f"Operator: {operator}. Parameter: {parameter}. "
            f"Accepts external control: {accepts_external_control}. "
            f"Signal type: {signal_type}. "
            f"Driver nodes: {', '.join(driver_nodes)}. "
            f"Connection methods: {', '.join(connection_methods)}. "
            f"Typical goal: {typical_goal}."
        ).strip()

        chunks.append(
            Chunk(
                document_id=f"control_mapping_{idx}_{_slugify(f'{operator}_{parameter}')}",
                document_type="control_mapping",
                operator_name=operator,
                text=text,
                source_file=str(CONTROL_MAPPINGS_PATH.relative_to(ROOT)),
                metadata={
                    "document_type": "control_mapping",
                    "operator": operator,
                    "parameter": parameter,
                    "signal_type": signal_type,
                    "driver_nodes": driver_nodes,
                    "connection_methods": connection_methods,
                    "typical_goal": typical_goal,
                },
            )
        )

    return chunks


def load_task_aliases() -> List[Dict[str, Any]]:
    if not TASK_ALIASES_PATH.exists():
        return []

    payload = json.loads(TASK_ALIASES_PATH.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list):
        return []

    aliases: List[Dict[str, Any]] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        task = str(entry.get("task", "")).strip()
        phrases = [str(alias).strip() for alias in entry.get("aliases", []) if str(alias).strip()]
        operators = [str(op).strip() for op in entry.get("operators", []) if str(op).strip()]
        recipes = [str(recipe).strip() for recipe in entry.get("related_recipes", []) if str(recipe).strip()]
        if task and phrases:
            aliases.append(
                {
                    "task": task,
                    "aliases": phrases,
                    "operators": operators,
                    "recipes": recipes,
                }
            )

    return aliases


def load_task_alias_documents() -> List[Chunk]:
    chunks: List[Chunk] = []
    for idx, entry in enumerate(load_task_aliases(), start=1):
        text = (
            f"Task: {entry['task']}. "
            f"Aliases: {', '.join(entry['aliases'])}. "
            f"Operators: {', '.join(entry['operators'])}. "
            f"Recipes: {', '.join(entry['recipes'])}."
        )
        chunks.append(
            Chunk(
                document_id=f"task_alias_{idx}_{_slugify(entry['task'])}",
                document_type="task_alias",
                operator_name=entry["task"],
                text=text,
                source_file=str(TASK_ALIASES_PATH.relative_to(ROOT)),
                metadata={
                    "document_type": "task_alias",
                    "task": entry["task"],
                    "aliases": entry["aliases"],
                    "operators": entry["operators"],
                    "recipes": entry["recipes"],
                },
            )
        )
    return chunks


def load_operator_graph() -> List[Chunk]:
    chunks: List[Chunk] = []
    if not OPERATOR_GRAPH_PATH.exists():
        return chunks

    payload = json.loads(OPERATOR_GRAPH_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return chunks

    for idx, entry in enumerate(payload, start=1):
        if not isinstance(entry, dict):
            continue

        operator = str(entry.get("operator", "")).strip()
        if not operator:
            continue

        connections = entry.get("connections", [])
        parameter_controls = entry.get("parameter_controls", [])
        if not isinstance(connections, list):
            connections = []
        if not isinstance(parameter_controls, list):
            parameter_controls = []

        connection_text = []
        for item in connections:
            if not isinstance(item, dict):
                continue
            target = str(item.get("target", "")).strip()
            relationship = str(item.get("relationship", "")).strip()
            description = str(item.get("description", "")).strip()
            connection_text.append(
                f"{operator} -> {target} ({relationship}): {description}".strip()
            )

        parameter_text = []
        for item in parameter_controls:
            if not isinstance(item, dict):
                continue
            parameter = str(item.get("parameter", "")).strip()
            signal_type = str(item.get("signal_type", "")).strip()
            drivers = ", ".join(str(v).strip() for v in item.get("drivers", []) if str(v).strip())
            description = str(item.get("description", "")).strip()
            parameter_text.append(
                f"Parameter {parameter} ({signal_type}) driven by {drivers}. {description}".strip()
            )

        text = " ".join(connection_text + parameter_text).strip() or operator

        chunks.append(
            Chunk(
                document_id=f"operator_graph_{idx}_{_slugify(operator)}",
                document_type="operator_graph",
                operator_name=operator,
                text=text,
                source_file=str(OPERATOR_GRAPH_PATH.relative_to(ROOT)),
                metadata={
                    "document_type": "operator_graph",
                    "operator": operator,
                    "connections": connections,
                    "parameter_controls": parameter_controls,
                },
            )
        )

    return chunks


def _normalize_phrase(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def match_task_alias(user_query: str, task_aliases: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    normalized_query = _normalize_phrase(user_query)
    for entry in task_aliases:
        for alias in entry.get("aliases", []):
            normalized_alias = _normalize_phrase(alias)
            if normalized_alias and normalized_alias in normalized_query:
                return entry
    return None


def expand_query_with_task_alias(query: str, match: Dict[str, Any] | None) -> str:
    if not match:
        return query

    keywords = [
        match.get("task", ""),
        *[str(op).lower() for op in match.get("operators", [])],
        *[str(recipe).lower() for recipe in match.get("recipes", [])],
    ]
    suffix = " ".join(item for item in keywords if item)
    return f"{query} {suffix}".strip()


def load_chunks() -> List[Chunk]:
    chunks: List[Chunk] = []

    glossary_chunks = load_glossary()
    operator_recipe_chunks, failure_mode_chunks = load_operator_recipes_and_failures()
    generated_recipe_chunks = load_recipes()
    use_case_chunks = load_use_cases()
    question_chunks = load_questions()
    control_mapping_chunks = load_control_mappings()
    task_alias_chunks = load_task_alias_documents()
    operator_graph_chunks = load_operator_graph()

    chunks += glossary_chunks
    chunks += operator_recipe_chunks
    chunks += generated_recipe_chunks
    chunks += use_case_chunks
    chunks += question_chunks
    chunks += control_mapping_chunks
    chunks += task_alias_chunks
    chunks += operator_graph_chunks
    chunks += failure_mode_chunks

    for recipe in load_generated_recipes():
        text = str(recipe.get("text", "")).strip()
        operator_name = " -> ".join(recipe.get("operators", [])) or "Generated Recipe"
        document_id = str(recipe.get("document_id", "")).strip()
        if text and document_id:
            chunks.append(
                Chunk(
                    document_id=document_id,
                    document_type="recipe",
                    operator_name=operator_name,
                    text=text,
                    source_file=str(GENERATED_RECIPES_PATH.relative_to(ROOT)),
                    metadata={
                        "document_type": "recipe",
                        "document_id": document_id,
                        "operators": recipe.get("operators", []),
                    },
                )
            )

    print("Ray Ray system ready")
    print("\nDocuments loaded:")
    print(f"{len(glossary_chunks)} operators")
    print(f"{len(operator_recipe_chunks) + len(generated_recipe_chunks)} recipes")
    print(f"{len(use_case_chunks)} use cases")
    print(f"{len(question_chunks)} questions")
    print(f"{len(control_mapping_chunks)} control mappings")
    graph_edges = sum(len(chunk.metadata.get("connections", [])) for chunk in operator_graph_chunks)
    print("Operator graph loaded")
    print(f"Graph nodes: {len(operator_graph_chunks)}")
    print(f"Graph edges: {graph_edges}")
    print("Task alias system initialized")
    print(f"Loaded {len(task_alias_chunks)} workflow intents")
    print("\nQuery classifier enabled")

    return chunks


def load_generated_recipes() -> List[Dict[str, Any]]:
    if not GENERATED_RECIPES_PATH.exists():
        return []

    try:
        payload = json.loads(GENERATED_RECIPES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if not isinstance(payload, list):
        return []

    return [entry for entry in payload if isinstance(entry, dict)]


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug[:80] if slug else f"workflow_{uuid4().hex[:8]}"


def _sentence_steps(response_text: str) -> List[str]:
    steps: List[str] = []
    parts = re.split(r"(?<=[.!?])\s+", response_text.strip())
    for sentence in parts:
        cleaned = sentence.strip().strip("-•")
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if any(word in lowered for word in ["connect", "then", "next", "load", "add", "use", "route", "switch"]):
            steps.append(cleaned)
    return steps


def _extract_ordered_steps(response_text: str) -> List[str]:
    explicit_steps: List[str] = []
    for line in response_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"^(\d+[\).:-]|[-*•])\s+", stripped):
            explicit_steps.append(re.sub(r"^(\d+[\).:-]|[-*•])\s+", "", stripped).strip())

    if explicit_steps:
        return explicit_steps
    return _sentence_steps(response_text)


def _extract_operator_names(response_text: str, known_operator_names: List[str]) -> List[str]:
    found: List[str] = []
    lowered = response_text.lower()

    for name in known_operator_names:
        if name.lower() in lowered:
            found.append(name)

    suffix_pattern = re.compile(r"\b([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)*\s+(?:TOP|CHOP|SOP|DAT|COMP|MAT))\b")
    for match in suffix_pattern.findall(response_text):
        cleaned = " ".join(match.split())
        if cleaned not in found:
            found.append(cleaned)

    return found


def _operator_chain_from_steps(operators: List[str], ordered_steps: List[str]) -> str:
    if operators:
        return " -> ".join(operators)
    if ordered_steps:
        return " -> ".join(ordered_steps[:3])
    return ""


def recipe_extractor(
    *,
    query_type_guess: str,
    user_query: str,
    response_text: str,
    known_operator_names: List[str],
) -> Dict[str, Any] | None:
    if query_type_guess != "workflow_recipe":
        return None

    operators = _extract_operator_names(response_text, known_operator_names)
    ordered_steps = _extract_ordered_steps(response_text)
    operator_chain = _operator_chain_from_steps(operators, ordered_steps)

    has_clear_pattern = len(operators) >= 2 or len(ordered_steps) >= 2
    if not has_clear_pattern:
        return None

    text = " ".join(ordered_steps[:4]).strip() if ordered_steps else response_text.strip()
    text = text[:500]

    slug_seed = f"{user_query} {' '.join(operators[:3])}".strip()
    document_id = f"recipe_auto_{_slugify(slug_seed)}"

    existing = load_generated_recipes()
    chain_signature = "|".join(op.lower() for op in operators)
    for entry in existing:
        existing_ops = entry.get("operators", [])
        existing_signature = "|".join(str(op).lower() for op in existing_ops)
        if existing_signature and existing_signature == chain_signature:
            return None
        if str(entry.get("document_id", "")).strip() == document_id:
            return None

    recipe_doc = {
        "document_id": document_id,
        "document_type": "recipe",
        "title": "workflow generated from user question",
        "operators": operators[:6],
        "operator_chain": operator_chain,
        "text": text,
        "source": "generated",
        "created_from_query": user_query,
        "created_at": _now_iso(),
    }

    updated = [*existing, recipe_doc]
    GENERATED_RECIPES_PATH.parent.mkdir(parents=True, exist_ok=True)
    GENERATED_RECIPES_PATH.write_text(json.dumps(updated, indent=2), encoding="utf-8")
    get_embedded_corpus.cache_clear()

    return recipe_doc


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    return SentenceTransformer(EMBEDDING_MODEL_NAME)


def embedding_fn(text: str) -> List[float]:
    vector = get_embedding_model().encode(
        text,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return vector.tolist()


def embed_chunks(chunks: List[Chunk]) -> List[Chunk]:
    if not chunks:
        return chunks

    model = get_embedding_model()
    vectors = model.encode(
        [chunk.text for chunk in chunks],
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    for chunk, vector in zip(chunks, vectors):
        chunk.embedding = vector.tolist()

    return chunks


@lru_cache(maxsize=1)
def get_embedded_corpus() -> Tuple[Chunk, ...]:
    return tuple(embed_chunks(load_chunks()))


def cosine(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def infer_goal(query: str, corpus: List[Chunk]) -> Dict[str, Any] | None:
    question_chunks = [chunk for chunk in corpus if chunk.document_type == "question"]
    if not question_chunks:
        return None

    query_vec = embedding_fn(query)
    top_question: Chunk | None = None
    top_similarity = -1.0

    for chunk in question_chunks:
        if chunk.embedding is None:
            raise ValueError(f"Chunk {chunk.document_id} is missing a precomputed embedding")
        similarity = cosine(query_vec, chunk.embedding)
        if similarity > top_similarity:
            top_similarity = similarity
            top_question = chunk

    if top_question is None or top_similarity < GOAL_INFERENCE_MIN_CONFIDENCE:
        return None

    use_case_id = str(top_question.metadata.get("use_case", "")).strip()
    if not use_case_id:
        return None

    use_case_chunk = next(
        (
            chunk
            for chunk in corpus
            if chunk.document_type == "use_case" and chunk.document_id == use_case_id
        ),
        None,
    )
    if use_case_chunk is None:
        return None

    return {
        "use_case_id": use_case_chunk.document_id,
        "goal": str(use_case_chunk.metadata.get("goal", "")).strip(),
        "related_recipe": str(use_case_chunk.metadata.get("related_recipe", "")).strip(),
        "operators": [
            str(op).strip() for op in use_case_chunk.metadata.get("operators", []) if str(op).strip()
        ],
        "confidence": round(float(top_similarity), 6),
        "matched_question": top_question.text,
    }


def retrieve_top_chunks(
    query: str,
    corpus: List[Chunk],
    k: int = 6,
    inferred_goal: Dict[str, Any] | None = None,
    query_type: str = "unknown",
    matched_task_alias: Dict[str, Any] | None = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    emb_start = time.perf_counter()
    retrieval_query = expand_query_with_task_alias(query, matched_task_alias)
    if inferred_goal:
        operators_str = ", ".join(inferred_goal.get("operators", []))
        retrieval_query = (
            f"{query}\n"
            f"Inferred goal: {inferred_goal.get('goal', '')}\n"
            f"Preferred operators: {operators_str}\n"
            f"Related recipe: {inferred_goal.get('related_recipe', '')}"
        )

    query_vec = embedding_fn(retrieval_query)
    emb_ms = (time.perf_counter() - emb_start) * 1000

    all_documents: List[Dict[str, Any]] = []
    for chunk in corpus:
        if chunk.embedding is None:
            raise ValueError(f"Chunk {chunk.document_id} is missing a precomputed embedding")

        embedding_score = cosine(query_vec, chunk.embedding)
        all_documents.append(
            {
                "document_id": chunk.document_id,
                "document_type": chunk.document_type,
                "source_file": chunk.source_file,
                "operator_name": chunk.operator_name,
                "embedding_score": round(float(embedding_score), 6),
                "text_preview_first_120_chars": chunk.text[:120],
                "chunk_text": chunk.text,
                "title": chunk.document_id,
                "metadata": chunk.metadata,
            }
        )

    retrieval_results = rank_documents(
        user_query=query,
        query_type=query_type,
        all_documents=all_documents,
        top_k=k,
    )

    for item in retrieval_results:
        item["similarity_score"] = item["final_score"]
        item["base_similarity_score"] = item["embedding_score"]
        item["similarity_boost"] = round(item["final_score"] - item["embedding_score"], 6)

    if DEBUG_RAG:
        print_debug_table(retrieval_results)

    embedding_trace = {
        "embedding_model_used": EMBEDDING_MODEL_NAME,
        "embedding_vector_length": len(query_vec),
        "embedding_generation_time_ms": round(emb_ms, 3),
        "retrieval_query": retrieval_query,
    }
    return retrieval_results, embedding_trace


def _is_control_mapping_query(user_query: str) -> bool:
    lowered = user_query.lower()
    control_keywords = [
        "connect",
        "drive",
        "control",
        "export",
        "where do i put",
        "how do i connect",
        "hook up",
    ]
    return any(keyword in lowered for keyword in control_keywords)


def select_context(
    query_type: str,
    user_query: str,
    retrieval_results: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    preferred_order = {
        "workflow_recipe": ["task_alias", "recipe", "use_case", "operator"],
        "parameter_control": ["task_alias", "operator_graph", "control_mapping", "operator", "parameter"],
        "operator_definition": ["glossary", "operator"],
        "troubleshooting": ["errors", "recipe", "operator"],
    }.get(query_type)

    doc_type_aliases = {
        "glossary": {"operator"},
        "errors": {"failure_mode"},
        "parameter": {"control_mapping"},
    }

    if _is_control_mapping_query(user_query) and query_type == "unknown":
        preferred_order = ["control_mapping", "operator", "parameter"]

    selected: List[Dict[str, Any]] = []
    dropped: List[Dict[str, Any]] = []

    for item in retrieval_results:
        doc_type = item["document_type"]
        score = item["similarity_score"]
        if preferred_order and score >= 0.01:
            priority = None
            for idx, preferred in enumerate(preferred_order):
                accepted_types = doc_type_aliases.get(preferred, {preferred})
                if doc_type in accepted_types:
                    priority = idx
                    break

            if priority is None:
                decision_reason = f"type/score did not satisfy query_type={query_type}"
                dropped.append(
                    {
                        **item,
                        "doc_id": item["document_id"],
                        "doc_type": doc_type,
                        "decision_reason": decision_reason,
                        "reason_dropped": decision_reason,
                    }
                )
                continue
            decision_reason = f"matches query_type={query_type} and similarity={score}"
            selected.append(
                {
                    **item,
                    "doc_id": item["document_id"],
                    "doc_type": doc_type,
                    "decision_reason": decision_reason,
                    "reason_selected": decision_reason,
                    "priority_rank": priority,
                }
            )
        elif not preferred_order and score >= 0.05 and len(selected) < 4:
            decision_reason = f"high score fallback similarity={score}"
            selected.append(
                {
                    **item,
                    "doc_id": item["document_id"],
                    "doc_type": doc_type,
                    "decision_reason": decision_reason,
                    "reason_selected": decision_reason,
                }
            )
        else:
            decision_reason = f"type/score did not satisfy query_type={query_type}"
            dropped.append(
                {
                    **item,
                    "doc_id": item["document_id"],
                    "doc_type": doc_type,
                    "decision_reason": decision_reason,
                    "reason_dropped": decision_reason,
                }
            )

    if preferred_order and selected:
        selected = sorted(
            selected,
            key=lambda item: (item.get("priority_rank", 999), -item["similarity_score"]),
        )[:4]
        selected_ids = {item["document_id"] for item in selected}
        dropped_ids = {item["document_id"] for item in dropped}
        for item in retrieval_results:
            if item["document_id"] in selected_ids or item["document_id"] in dropped_ids:
                continue
            decision_reason = f"not in top prioritized set for query_type={query_type}"
            dropped.append(
                {
                    **item,
                    "doc_id": item["document_id"],
                    "doc_type": item["document_type"],
                    "decision_reason": decision_reason,
                    "reason_dropped": decision_reason,
                }
            )

    if not selected:
        fallback_selected: List[Dict[str, Any]] = []
        fallback_dropped: List[Dict[str, Any]] = []
        for index, item in enumerate(retrieval_results):
            if index < 4 and item["similarity_score"] > 0:
                decision_reason = (
                    f"fallback top semantic match for query_type={query_type} "
                    f"similarity={item['similarity_score']}"
                )
                fallback_selected.append(
                    {
                        **item,
                        "doc_id": item["document_id"],
                        "doc_type": item["document_type"],
                        "decision_reason": decision_reason,
                        "reason_selected": decision_reason,
                    }
                )
            else:
                fallback_dropped.append(item)

        if fallback_selected:
            fallback_selected_ids = {item["document_id"] for item in fallback_selected}
            selected = fallback_selected
            dropped = [item for item in dropped if item["document_id"] not in fallback_selected_ids]

    return selected, dropped


def route_mode(user_query: str, query_type: str, selected_context: List[Dict[str, Any]]) -> str:
    query_tokens = set(re.findall(r"[a-z0-9]+", user_query.lower()))
    if {"error", "crash", "broken", "fail", "failed", "warning"}.intersection(query_tokens):
        return "error_responder"

    if selected_context:
        selected_types = [item["doc_type"] for item in selected_context]
        if selected_types.count("recipe") >= 2:
            return "recipe_responder"
        if selected_types.count("failure_mode") >= 1 and query_type == "troubleshooting":
            return "error_responder"
        if selected_types.count("operator") >= 2 and query_type == "operator_definition":
            return "glossary_responder"

    return {
        "operator_definition": "glossary_responder",
        "workflow_recipe": "recipe_responder",
        "troubleshooting": "error_responder",
    }.get(query_type, "fallback_responder")


def build_prompt(
    user_query: str,
    query_type_guess: str,
    selected: List[Dict[str, Any]],
    generated_workflow: Dict[str, Any] | None = None,
    session: Dict[str, Any] | None = None,
    teaching_examples: List[Dict[str, Any]] | None = None,
) -> Dict[str, str]:
    full_prompt = compose_prompt(
        user_query,
        query_type_guess,
        selected,
        generated_workflow=generated_workflow,
        session=session,
        teaching_examples=teaching_examples,
    )

    context_start = full_prompt.find("=== TASK ALIASES ===")
    if context_start == -1:
        context_start = full_prompt.find("=== OPERATORS ===")
    if context_start == -1:
        context_start = full_prompt.find("=== GLOSSARY ===")
    if context_start == -1:
        context_start = full_prompt.find("=== RECIPES ===")
    retrieved_context = full_prompt[context_start:].strip() if context_start != -1 else ""

    return {
        "system_prompt": SYSTEM_PROMPT,
        "retrieved_context": retrieved_context,
        "full_prompt": full_prompt,
    }


def _post_chat_completion(messages: List[Dict[str, str]]) -> Tuple[str, str]:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    if not api_key:
        return (
            "[audit fallback] DEEPSEEK_API_KEY missing. Skipping live generation and returning fallback response.",
            model,
        )

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 250,
    }
    req = request.Request(
        "https://api.deepseek.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=45) as resp:  # nosec - explicit trusted endpoint
        body = json.loads(resp.read().decode("utf-8"))
    text = body.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    return text or "I could not generate an answer right now.", model


def save_debug_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def run_audit(user_query: str, log_dir: Path | None = None, session_id: str = "default") -> Dict[str, Any]:
    query_type = classify_query_type(user_query)
    query_log = {
        "timestamp": _now_iso(),
        "user_query": user_query,
        "query_type": query_type,
        "session_id": session_id,
    }

    session = get_session(session_id)

    corpus = list(get_embedded_corpus())
    matched_task_alias = match_task_alias(user_query, load_task_aliases())
    inferred_goal = infer_goal(user_query, corpus)
    retrieval_results, embedding_trace = retrieve_top_chunks(
        user_query,
        corpus,
        k=10,
        inferred_goal=inferred_goal,
        query_type=query_type,
        matched_task_alias=matched_task_alias,
    )
    selected, dropped = select_context(query_type, user_query, retrieval_results)
    teaching_examples = select_similar_examples(user_query, query_type, max_examples=3)

    responder = route_mode(user_query, query_type, selected)

    generated_workflow = None
    if query_type == "workflow_recipe":
        workflow_task_name = (matched_task_alias or {}).get("task") or user_query
        generated_workflow = generate_workflow(
            workflow_task_name,
            operator_graph=[chunk.metadata for chunk in corpus if chunk.document_type == "operator_graph"],
            recipes=load_generated_recipes(),
        )
        generated_workflow = {
            **generated_workflow,
            "operator_graph": [chunk.metadata for chunk in corpus if chunk.document_type == "operator_graph"],
        }
        generated_workflow = verify_workflow(
            generated_workflow,
            operator_definitions=load_operator_definitions(),
        )
        generated_workflow = generate_ui_actions(generated_workflow)

    reused_previous_workflow = False
    if not generated_workflow and is_follow_up_query(user_query):
        prior_workflow = session.get("last_workflow", {}) if isinstance(session, dict) else {}
        if isinstance(prior_workflow, dict) and prior_workflow:
            generated_workflow = prior_workflow
            reused_previous_workflow = True

    prompt_parts = build_prompt(
        user_query,
        query_type,
        selected,
        generated_workflow=generated_workflow,
        session=session,
        teaching_examples=teaching_examples,
    )
    full_prompt = prompt_parts["full_prompt"]
    prompt_assembly_trace = {
        "system_prompt": prompt_parts["system_prompt"],
        "retrieved_context": prompt_parts["retrieved_context"],
        "full_prompt": full_prompt,
    }

    response_start = time.perf_counter()
    response_text, model_used = _post_chat_completion([
        {"role": "user", "content": full_prompt}
    ])

    if query_type == "workflow_recipe":
        response_text = format_action_response(
            (generated_workflow or {}).get("ui_actions", {}),
            generated_workflow,
            user_query,
        )
    log_conversation_example_influence(
        user_query=user_query,
        query_type=query_type,
        selected_examples=teaching_examples,
    )
    known_operator_names = [chunk.operator_name for chunk in corpus if chunk.operator_name]
    generated_recipe = recipe_extractor(
        query_type_guess=query_type,
        user_query=user_query,
        response_text=response_text,
        known_operator_names=known_operator_names,
    )

    if generated_workflow:
        session = update_session(session_id, generated_workflow, user_query)
    else:
        session = update_session(session_id, None, user_query)

    response_ms = (time.perf_counter() - response_start) * 1000
    response_trace = {
        "model_used": model_used,
        "response_tokens": len(response_text.split()),
        "generation_time_ms": round(response_ms, 3),
    }

    report = {
        "query_log": query_log,
        "embedding_trace": embedding_trace,
        "inferred_goal": (
            {
                "use_case_id": inferred_goal.get("use_case_id"),
                "goal": inferred_goal.get("goal"),
                "related_recipe": inferred_goal.get("related_recipe"),
                "operators": inferred_goal.get("operators", []),
                "confidence": inferred_goal.get("confidence"),
            }
            if inferred_goal
            else None
        ),
        "retrieval_results": retrieval_results,
        "chunk_filtering_trace": {
            "selected_context": selected,
            "dropped_context": dropped,
        },
        "prompt_assembly_trace": prompt_assembly_trace,
        "conversation_examples_trace": {
            "selected_examples": teaching_examples,
            "examples_selected_count": len(teaching_examples),
        },
        "session_memory_trace": {
            "is_follow_up": is_follow_up_query(user_query),
            "reused_previous_workflow": reused_previous_workflow,
            "session_state": session,
        },
        "pipeline_routing_trace": {
            "response_mode": responder,
            "routing_stage": "pre_generation",
        },
        "response_trace": response_trace,
        "generated_workflow": generated_workflow,
        "recipe_extractor_trace": {
            "attempted": query_type == "workflow_recipe",
            "generated_recipe_document_id": generated_recipe.get("document_id") if generated_recipe else None,
        },
    }

    effective_log_dir = Path(log_dir) if log_dir else DEFAULT_LOG_DIR
    if DEBUG_RAG:
        effective_log_dir.mkdir(parents=True, exist_ok=True)
        save_debug_file(effective_log_dir / "rag_prompt.txt", full_prompt)
        save_debug_file(effective_log_dir / "rag_response.txt", response_text)
        save_debug_file(
            effective_log_dir / "retrieval_debug.json",
            json.dumps(
                {
                    "query": user_query,
                    "matched_task_alias": matched_task_alias.get("task") if matched_task_alias else None,
                    "query_type": query_type,
                    "inferred_goal": (
                        {
                            "use_case_id": inferred_goal.get("use_case_id"),
                            "confidence": inferred_goal.get("confidence"),
                        }
                        if inferred_goal
                        else None
                    ),
                    "retrieved_docs": retrieval_results,
                    "selected_docs": selected,
                    "dropped_docs": dropped,
                    "matched_graph_nodes": sorted(
                        {
                            name
                            for item in retrieval_results
                            if item.get("document_type") == "operator_graph"
                            for name in [
                                str(item.get("operator_name", "")).strip(),
                                *[
                                    str(conn.get("target", "")).strip()
                                    for conn in item.get("metadata", {}).get("connections", [])
                                    if isinstance(conn, dict)
                                ],
                            ]
                            if name
                        }
                    ),
                    "response_mode": responder,
                },
                indent=2,
            ),
        )
        save_debug_file(effective_log_dir / "rag_audit_report.json", json.dumps(report, indent=2))

    return {
        **report,
        "response_preview": response_text,
        "debug_enabled": DEBUG_RAG,
        "log_dir": str(effective_log_dir),
    }


def print_report(report: Dict[str, Any]) -> None:
    print(f"QUERY TYPE: {report['query_log']['query_type']}")
    print("\nRETRIEVAL RESULTS")
    for idx, item in enumerate(report["retrieval_results"], start=1):
        print(f"{idx} {item['document_id']} score {item['similarity_score']}")

    print("\nSELECTED CONTEXT")
    selected = report["chunk_filtering_trace"]["selected_context"]
    if selected:
        for item in selected:
            print(item["doc_id"])
    else:
        print("(none)")

    print("\nDROPPED CONTEXT")
    dropped = report["chunk_filtering_trace"]["dropped_context"]
    if dropped:
        for item in dropped:
            print(f"{item['doc_id']} ({item['decision_reason']})")
    else:
        print("(none)")

    print("\nROUTED TO")
    print(report["pipeline_routing_trace"]["response_mode"])

    print("\nEMBEDDING TRACE")
    print(json.dumps(report["embedding_trace"], indent=2))

    print("\nRESPONSE TRACE")
    print(json.dumps(report["response_trace"], indent=2))

    print("\nRESPONSE PREVIEW")
    print(report["response_preview"])

    if report["debug_enabled"]:
        print(f"\nDebug artifacts saved under: {report['log_dir']}")
    else:
        print("\nDEBUG_RAG is disabled; no log files written. Set DEBUG_RAG=true to persist traces.")


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print('Usage: python rayray_rag_audit.py "your query"')
        return 1

    user_query = " ".join(argv[1:]).strip()
    loaded_examples = load_conversation_examples()
    print("Conversation example library loaded")
    print(f"Teaching examples available: {len(loaded_examples)}")
    report = run_audit(user_query)
    print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
