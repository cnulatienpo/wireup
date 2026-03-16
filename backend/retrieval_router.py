"""Query-aware retrieval scoring router."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List

QUERY_TYPE_WEIGHTS: Dict[str, Dict[str, float]] = {
    "workflow_recipe": {
        "recipe": 2.5,
        "use_case": 2.0,
        "operator": 1.2,
        "glossary": 0.6,
        "question": 0.5,
        "control_mapping": 1.2,
        "task_alias": 2.8,
    },
    "parameter_control": {
        "control_mapping": 3.0,
        "operator": 1.8,
        "recipe": 1.4,
        "use_case": 1.2,
        "glossary": 0.5,
        "task_alias": 2.5,
    },
    "operator_definition": {
        "glossary": 2.5,
        "operator": 2.0,
        "recipe": 0.8,
        "use_case": 0.6,
        "task_alias": 1.6,
    },
    "troubleshooting": {
        "error": 2.5,
        "failure_mode": 2.5,
        "recipe": 2.0,
        "operator": 1.2,
        "glossary": 0.5,
        "task_alias": 2.5,
    },
    "unknown": {},
}


print("Retrieval router initialized")
print("Query-aware weighting enabled")


def _weight_for(query_type: str, document_type: str) -> float:
    normalized_query_type = str(query_type or "unknown").strip().lower()
    normalized_document_type = str(document_type or "").strip().lower()
    return QUERY_TYPE_WEIGHTS.get(normalized_query_type, {}).get(normalized_document_type, 1.0)


def _keyword_overlap_score(query: str, title: str) -> float:
    query_tokens = {token for token in str(query or "").lower().split() if token}
    if not query_tokens:
        return 0.0

    title_tokens = {token for token in str(title or "").lower().split() if token}
    if not title_tokens:
        return 0.0

    return len(query_tokens.intersection(title_tokens)) / len(query_tokens)


def rank_documents(
    user_query: str,
    query_type: str,
    all_documents: Iterable[Dict[str, Any]],
    *,
    top_k: int = 6,
    keyword_fallback_threshold: float = 0.35,
) -> List[Dict[str, Any]]:
    """Apply query-aware weighting and fallback keyword ranking.

    Expects `all_documents` entries to already include `embedding_score` and `document_type`.
    """
    ranked_docs: List[Dict[str, Any]] = []

    for item in all_documents:
        embedding_score = float(item.get("embedding_score", 0.0))
        document_type = str(item.get("document_type", "")).strip().lower()
        weight = _weight_for(query_type, document_type)
        final_score = embedding_score * weight

        enriched = {
            **item,
            "weight": round(weight, 6),
            "final_score": round(final_score, 6),
        }
        ranked_docs.append(enriched)

    ranked_docs.sort(key=lambda doc: doc["final_score"], reverse=True)

    top_semantic_score = ranked_docs[0]["final_score"] if ranked_docs else 0.0
    if top_semantic_score < keyword_fallback_threshold:
        for item in ranked_docs:
            keyword_score = _keyword_overlap_score(
                user_query,
                str(item.get("title") or item.get("document_id") or item.get("doc_id") or ""),
            )
            item["keyword_score"] = round(keyword_score, 6)
            item["final_score"] = round(max(item["final_score"], keyword_score), 6)
        ranked_docs.sort(key=lambda doc: doc["final_score"], reverse=True)

    return ranked_docs[:top_k]


def print_debug_table(retrieved_docs: List[Dict[str, Any]]) -> None:
    print("RAG Retrieval")
    print(f"{'doc_type':<15} {'embedding':<10} {'weight':<8} {'final':<8}")
    for item in retrieved_docs:
        print(
            f"{str(item.get('document_type', '')):<15} "
            f"{float(item.get('embedding_score', 0.0)):<10.2f} "
            f"{float(item.get('weight', 1.0)):<8.2f} "
            f"{float(item.get('final_score', 0.0)):<8.2f}"
        )


def write_retrieval_debug(path: str | Path, query: str, query_type: str, retrieved_docs: List[Dict[str, Any]]) -> None:
    payload = {
        "query": query,
        "query_type": query_type,
        "retrieved_docs": [
            {
                "doc_id": item.get("document_id") or item.get("doc_id"),
                "document_type": item.get("document_type"),
                "embedding_score": item.get("embedding_score"),
                "weight": item.get("weight", 1.0),
                "final_score": item.get("final_score", item.get("embedding_score", 0.0)),
            }
            for item in retrieved_docs
        ],
    }
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
