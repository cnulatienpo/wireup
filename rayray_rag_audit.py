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

from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parent


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
    document_type: str  # glossary | recipe | error
    operator_name: str
    text: str
    embedding: List[float] | None = None


EMBEDDING_MODEL_NAME = os.getenv("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def classify_query_type(user_query: str) -> str:
    q = user_query.lower()
    troubleshooting_keywords = [
        "error",
        "broken",
        "crash",
        "fix",
        "why isn't",
        "not working",
        "issue",
        "problem",
        "warning",
        "failed",
    ]
    recipe_keywords = [
        "how do i",
        "how to",
        "steps",
        "build",
        "make",
        "create",
        "stitch",
        "workflow",
        "connect",
        "setup",
    ]
    workflow_keywords = [
        "how do i",
        "how to",
        "steps",
        "build",
        "make",
        "create",
        "stitch",
        "workflow",
        "connect",
        "setup",
    ]
    definition_keywords = [
        "what is",
        "define",
        "meaning of",
        "meaning",
        "difference",
        "explain",
    ]
    generic_td_words = {"top", "chop", "sop", "dat"}

    if any(k in q for k in troubleshooting_keywords):
        return "troubleshooting"
    # Check workflow intent before definition intent to avoid misrouting build/how-to prompts.
    if any(k in q for k in workflow_keywords):
        return "workflow_recipe"
    has_definition_phrase = any(k in q for k in definition_keywords)
    if has_definition_phrase:
        return "operator_definition"
    # Generic TouchDesigner nouns alone should not force operator_definition.
    if any(word in re.findall(r"[a-z0-9]+", q) for word in generic_td_words):
        return "unknown"
    return "unknown"


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


def load_chunks() -> List[Chunk]:
    chunks: List[Chunk] = []

    glossary_path = ROOT / "td simple glossery.json"
    if glossary_path.exists():
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
                        document_type="glossary",
                        operator_name=term,
                        text=text,
                    )
                )

    master_index_path = ROOT / "data" / "wireup_runtime" / "master_index.json"
    if master_index_path.exists():
        master = json.loads(master_index_path.read_text(encoding="utf-8"))
        for operator_key, operator in master.get("operators", {}).items():
            name = str(operator.get("name", operator_key))
            for idx, recipe in enumerate(operator.get("recipes", []) or [], start=1):
                if isinstance(recipe, dict):
                    text = " ".join(str(v) for v in recipe.values())
                else:
                    text = str(recipe)
                if text.strip():
                    chunks.append(
                        Chunk(
                            document_id=f"recipe_{operator_key}_{idx}",
                            document_type="recipe",
                            operator_name=name,
                            text=text,
                        )
                    )

            for idx, issue in enumerate(operator.get("failure_modes", []) or [], start=1):
                if isinstance(issue, dict):
                    text = " ".join(str(v) for v in issue.values())
                else:
                    text = str(issue)
                if text.strip():
                    chunks.append(
                        Chunk(
                            document_id=f"error_{operator_key}_{idx}",
                            document_type="error",
                            operator_name=name,
                            text=text,
                        )
                    )

    return chunks


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


def retrieve_top_chunks(query: str, corpus: List[Chunk], k: int = 10) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    emb_start = time.perf_counter()
    query_vec = embedding_fn(query)
    emb_ms = (time.perf_counter() - emb_start) * 1000

    scored = []
    for chunk in corpus:
        if chunk.embedding is None:
            raise ValueError(f"Chunk {chunk.document_id} is missing a precomputed embedding")
        score = cosine(query_vec, chunk.embedding)
        scored.append((score, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)

    retrieval_results: List[Dict[str, Any]] = []
    for score, chunk in scored[:k]:
        retrieval_results.append(
            {
                "document_id": chunk.document_id,
                "document_type": chunk.document_type,
                "operator_name": chunk.operator_name,
                "similarity_score": round(float(score), 6),
                "text_preview_first_120_chars": chunk.text[:120],
                "chunk_text": chunk.text,
            }
        )

    embedding_trace = {
        "embedding_model_used": EMBEDDING_MODEL_NAME,
        "embedding_vector_length": len(query_vec),
        "embedding_generation_time_ms": round(emb_ms, 3),
    }
    return retrieval_results, embedding_trace


def select_context(query_type: str, retrieval_results: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    preferred = {
        "workflow_recipe": "recipe",
        "operator_definition": "glossary",
        "troubleshooting": "error",
        "unknown": None,
    }.get(query_type)

    selected: List[Dict[str, Any]] = []
    dropped: List[Dict[str, Any]] = []

    for item in retrieval_results:
        doc_type = item["document_type"]
        score = item["similarity_score"]
        if preferred and doc_type == preferred and score >= 0.01 and len(selected) < 4:
            decision_reason = f"matches query_type={query_type} and similarity={score}"
            selected.append(
                {
                    **item,
                    "doc_id": item["document_id"],
                    "doc_type": doc_type,
                    "decision_reason": decision_reason,
                    "reason_selected": decision_reason,
                }
            )
        elif not preferred and score >= 0.05 and len(selected) < 4:
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
        if selected_types.count("error") >= 1 and query_type == "troubleshooting":
            return "error_responder"
        if selected_types.count("glossary") >= 2 and query_type == "operator_definition":
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
    "If context is missing, say you are uncertain."
)

WORKFLOW_PROMPT = (
    "You are Ray Ray, a TouchDesigner tutor.\n\n"
    "Use your knowledge of TouchDesigner to answer the user's workflow question.\n"
    "Retrieved context provides definitions, metaphors, and operator explanations that should support your answer.\n\n"
    "You may explain workflows using known TouchDesigner patterns.\n"
    "When relevant, reference the retrieved context to reinforce explanations."
)


def build_prompt(user_query: str, query_type_guess: str, selected: List[Dict[str, Any]]) -> Dict[str, str]:
    system_prompt = WORKFLOW_PROMPT if query_type_guess == "workflow_recipe" else STRICT_PROMPT

    context_lines = []
    for item in selected:
        context_lines.append(
            f"- {item['document_id']} ({item['document_type']}, operator={item['operator_name']}, score={item['similarity_score']}): "
            f"{item['chunk_text']}"
        )
    retrieved_context = "\n".join(context_lines)
    full_prompt = (
        f"SYSTEM_PROMPT:\n{system_prompt}\n\n"
        f"RETRIEVED_CONTEXT:\n{retrieved_context}\n\n"
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
        "query_type_guess": query_type,
    }

    corpus = list(get_embedded_corpus())
    retrieval_results, embedding_trace = retrieve_top_chunks(user_query, corpus, k=10)
    selected, dropped = select_context(query_type, retrieval_results)

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
    response_ms = (time.perf_counter() - response_start) * 1000
    response_trace = {
        "model_used": model_used,
        "response_tokens": len(response_text.split()),
        "generation_time_ms": round(response_ms, 3),
    }

    report = {
        "query_log": query_log,
        "embedding_trace": embedding_trace,
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
                    "query_type_guess": query_type,
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
    print(f"QUERY TYPE: {report['query_log']['query_type_guess']}")
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
