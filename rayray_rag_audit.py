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


def load_chunks() -> List[Chunk]:
    chunks: List[Chunk] = []

    glossary_chunks = load_glossary()
    operator_recipe_chunks, failure_mode_chunks = load_operator_recipes_and_failures()
    generated_recipe_chunks = load_recipes()
    use_case_chunks = load_use_cases()
    question_chunks = load_questions()
    control_mapping_chunks = load_control_mappings()

    chunks += glossary_chunks
    chunks += operator_recipe_chunks
    chunks += generated_recipe_chunks
    chunks += use_case_chunks
    chunks += question_chunks
    chunks += control_mapping_chunks
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
    k: int = 10,
    inferred_goal: Dict[str, Any] | None = None,
    query_type: str = "unknown",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    emb_start = time.perf_counter()
    retrieval_query = query
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

    scored = []
    inferred_operators = {
        _normalize_token(str(op)) for op in (inferred_goal or {}).get("operators", []) if str(op).strip()
    }
    related_recipe = str((inferred_goal or {}).get("related_recipe", "")).strip()

    retrieval_type_boosts = {
        "workflow_recipe": {"recipe": 0.08, "use_case": 0.06, "operator": 0.03},
        "parameter_control": {"control_mapping": 0.1, "operator": 0.04},
        "operator_definition": {"operator": 0.07},
        "troubleshooting": {"failure_mode": 0.1, "recipe": 0.05, "operator": 0.03},
    }.get(query_type, {})

    for chunk in corpus:
        if chunk.embedding is None:
            raise ValueError(f"Chunk {chunk.document_id} is missing a precomputed embedding")
        score = cosine(query_vec, chunk.embedding)
        boost = 0.0

        if chunk.document_type in retrieval_type_boosts:
            boost += retrieval_type_boosts[chunk.document_type]

        if inferred_goal and related_recipe and chunk.document_id == related_recipe:
            boost += 0.2

        if inferred_goal and inferred_operators:
            chunk_operators = {
                _normalize_token(str(op))
                for op in (chunk.metadata.get("operators", []) if isinstance(chunk.metadata, dict) else [])
                if str(op).strip()
            }
            if chunk.operator_name:
                chunk_operators.add(_normalize_token(chunk.operator_name))

            if inferred_operators.intersection(chunk_operators):
                boost += 0.08

        scored.append((score + boost, score, boost, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)

    retrieval_results: List[Dict[str, Any]] = []
    for final_score, base_score, boost, chunk in scored[:k]:
        retrieval_results.append(
            {
                "document_id": chunk.document_id,
                "document_type": chunk.document_type,
                "source_file": chunk.source_file,
                "operator_name": chunk.operator_name,
                "similarity_score": round(float(final_score), 6),
                "base_similarity_score": round(float(base_score), 6),
                "similarity_boost": round(float(boost), 6),
                "text_preview_first_120_chars": chunk.text[:120],
                "chunk_text": chunk.text,
            }
        )

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
        "workflow_recipe": ["recipe", "use_case", "operator"],
        "parameter_control": ["control_mapping", "operator", "parameter"],
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


STRICT_PROMPT = (
    "You are Ray Ray, a TouchDesigner tutor.\n"
    "Answer using the retrieved context as the primary source.\n"
    "Do not invent operator parameters or behavior that is not present in the context.\n"
    "If context is missing, say you are uncertain.\n\n"
    "When explaining something, build your response using these layers when available:\n\n"
    "1. Workflow / Action\n"
    "Explain the practical solution first when the user asks a workflow question.\n\n"
    "2. Identity\n"
    "Name the relevant TouchDesigner operators.\n\n"
    "3. Signal Story\n"
    "Explain what happens to the signal as it moves through the operators.\n\n"
    "4. Minimal Recipe\n"
    "Provide a simple operator chain that solves the problem.\n\n"
    "5. Failure Modes\n"
    "Mention common mistakes if relevant.\n\n"
    "6. Reasoning Lens\n"
    "Include the ELI5 metaphor or mental model if available.\n\n"
    "Use layers opportunistically: if a layer is missing from retrieved context, skip it.\n"
    "For workflow questions, start with the solution, then expand using the layers.\n"
    "For definition questions, start with the Identity layer and expand downward.\n"
    "Do not fabricate layers that are not present in context."
)

WORKFLOW_PROMPT = (
    "You are Ray Ray, a TouchDesigner tutor.\n\n"
    "Use your knowledge of TouchDesigner to answer the user's workflow question.\n"
    "Retrieved context provides definitions, metaphors, and operator explanations that should support your answer.\n\n"
    "You may explain workflows using known TouchDesigner patterns.\n"
    "When relevant, reference the retrieved context to reinforce explanations.\n\n"
    "When explaining something, build your response using these layers when available:\n\n"
    "1. Workflow / Action\n"
    "Explain the practical solution first when the user asks a workflow question.\n\n"
    "2. Identity\n"
    "Name the relevant TouchDesigner operators.\n\n"
    "3. Signal Story\n"
    "Explain what happens to the signal as it moves through the operators.\n\n"
    "4. Minimal Recipe\n"
    "Provide a simple operator chain that solves the problem.\n\n"
    "5. Failure Modes\n"
    "Mention common mistakes if relevant.\n\n"
    "6. Reasoning Lens\n"
    "Include the ELI5 metaphor or mental model if available.\n\n"
    "Use layers opportunistically: if a layer is missing from retrieved context, skip it.\n"
    "For workflow questions, start with the solution, then expand using the layers.\n"
    "For definition questions, start with the Identity layer and expand downward.\n"
    "Do not fabricate layers that are not present in context."
)


def build_prompt(user_query: str, query_type_guess: str, selected: List[Dict[str, Any]]) -> Dict[str, str]:
    system_prompt = WORKFLOW_PROMPT if query_type_guess == "workflow_recipe" else STRICT_PROMPT

    layer_mappings = {
        "identity": {"operator", "operator_definition"},
        "signal_story": {"signal_flow", "operator_behavior"},
        "failure_modes": {"failure_mode", "troubleshooting"},
        "minimal_recipes": {"recipe", "workflow_recipe", "use_case", "question"},
        "reasoning_lens": {"eli5", "metaphor", "mental_model"},
    }
    section_titles = {
        "identity": "IDENTITY_LAYER",
        "signal_story": "SIGNAL_STORY_LAYER",
        "failure_modes": "FAILURE_MODES_LAYER",
        "minimal_recipes": "MINIMAL_RECIPES_LAYER",
        "reasoning_lens": "REASONING_LENS_LAYER",
    }

    sections: Dict[str, List[Dict[str, Any]]] = {
        "identity": [],
        "signal_story": [],
        "failure_modes": [],
        "minimal_recipes": [],
        "reasoning_lens": [],
    }

    for item in selected:
        doc_type = str(item.get("document_type", "")).strip().lower()
        doc_id = str(item.get("document_id", "")).strip().lower()
        assigned_layer = None

        for layer, mapped_types in layer_mappings.items():
            if doc_type in mapped_types:
                assigned_layer = layer
                break

        if not assigned_layer:
            if "glossary" in doc_id or "definition" in doc_id:
                assigned_layer = "identity"
            elif "signal" in doc_id or "behavior" in doc_id:
                assigned_layer = "signal_story"
            elif "error" in doc_id or "troubleshoot" in doc_id or "failure" in doc_id:
                assigned_layer = "failure_modes"
            elif "recipe" in doc_id or "workflow" in doc_id or "chain" in doc_id:
                assigned_layer = "minimal_recipes"
            elif "eli5" in doc_id or "metaphor" in doc_id or "mental_model" in doc_id:
                assigned_layer = "reasoning_lens"

        if assigned_layer:
            sections[assigned_layer].append(item)

    section_blocks: List[str] = []
    for layer_name in ["identity", "signal_story", "failure_modes", "minimal_recipes", "reasoning_lens"]:
        docs = sections[layer_name]
        if not docs:
            continue

        lines = []
        for item in docs:
            lines.append(
                f"- {item['document_id']} ({item['document_type']}, operator={item['operator_name']}, score={item['similarity_score']}): "
                f"{item['chunk_text']}"
            )
        section_blocks.append(f"{section_titles[layer_name]}:\n" + "\n".join(lines))

    retrieved_context = "\n\n".join(section_blocks)
    full_prompt = (
        f"SYSTEM_PROMPT:\n{system_prompt}\n\n"
        f"{retrieved_context}\n\n"
        f"USER_QUERY:\n{user_query}\n"
    )
    return {
        "system_prompt": system_prompt,
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


def run_audit(user_query: str, log_dir: Path | None = None) -> Dict[str, Any]:
    query_type = classify_query_type(user_query)
    query_log = {
        "timestamp": _now_iso(),
        "user_query": user_query,
        "query_type": query_type,
    }

    corpus = list(get_embedded_corpus())
    inferred_goal = infer_goal(user_query, corpus)
    retrieval_results, embedding_trace = retrieve_top_chunks(
        user_query,
        corpus,
        k=10,
        inferred_goal=inferred_goal,
        query_type=query_type,
    )
    selected, dropped = select_context(query_type, user_query, retrieval_results)

    responder = route_mode(user_query, query_type, selected)
    prompt_parts = build_prompt(user_query, query_type, selected)
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
    known_operator_names = [chunk.operator_name for chunk in corpus if chunk.operator_name]
    generated_recipe = recipe_extractor(
        query_type_guess=query_type,
        user_query=user_query,
        response_text=response_text,
        known_operator_names=known_operator_names,
    )
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
        "pipeline_routing_trace": {
            "response_mode": responder,
            "routing_stage": "pre_generation",
        },
        "response_trace": response_trace,
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
    report = run_audit(user_query)
    print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
