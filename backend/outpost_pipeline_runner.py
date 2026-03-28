#!/usr/bin/env python3
"""Outpost routing pipeline runner for the /query bridge.

Reads a JSON payload from stdin and writes a JSON response to stdout.
This keeps the Node server thin while using the existing Python RAG helpers.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.query_classifier import classify_query
from backend.retrieval_router import rank_documents, write_retrieval_debug
from backend.session_memory import update_session
from backend.tutor_brain import build_structured_response, generate_response
from backend.ui_action_generator import generate_ui_actions
from backend.workflow_generator import generate_workflow

LOG_DIR = ROOT / "logs"
RAG_PROMPT_PATH = LOG_DIR / "rag_prompt.txt"

RECIPES_PATH = ROOT / "knowledge" / "generated" / "recipes_generated.json"
USE_CASES_PATH = ROOT / "knowledge" / "generated" / "use_cases_generated.json"
QUESTIONS_PATH = ROOT / "knowledge" / "generated" / "questions_generated.json"
TASK_ALIASES_PATH = ROOT / "knowledge" / "task_aliases" / "task_aliases.json"
CONTROL_MAPPINGS_PATH = ROOT / "knowledge" / "control_mappings" / "control_mappings.json"
OPERATOR_GRAPH_PATH = ROOT / "knowledge" / "operator_graph" / "operator_graph.json"


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _tokenize(value: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", str(value or "").lower())


def _keyword_score(query: str, *values: Any) -> float:
    query_tokens = set(_tokenize(query))
    if not query_tokens:
        return 0.0

    haystack = " ".join(str(value or "") for value in values)
    haystack_tokens = set(_tokenize(haystack))
    if not haystack_tokens:
        return 0.0

    overlap = len(query_tokens.intersection(haystack_tokens))
    return overlap / max(len(query_tokens), 1)


def _build_documents() -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []

    for entry in _load_json(TASK_ALIASES_PATH, []):
        if not isinstance(entry, dict):
            continue
        aliases = entry.get("aliases", [])
        text = " ".join(str(alias) for alias in aliases)
        docs.append(
            {
                "document_id": f"task_alias::{entry.get('task', 'unknown')}",
                "document_type": "task_alias",
                "title": entry.get("task", ""),
                "text": text,
                "metadata": entry,
            }
        )

    for entry in _load_json(CONTROL_MAPPINGS_PATH, []):
        if not isinstance(entry, dict):
            continue
        docs.append(
            {
                "document_id": f"control_mapping::{entry.get('operator', 'unknown')}::{entry.get('parameter', '')}",
                "document_type": "control_mapping",
                "title": entry.get("operator", ""),
                "text": json.dumps(entry, ensure_ascii=False),
                "metadata": entry,
            }
        )

    for entry in _load_json(OPERATOR_GRAPH_PATH, []):
        if not isinstance(entry, dict):
            continue
        docs.append(
            {
                "document_id": f"operator_graph::{entry.get('operator', 'unknown')}",
                "document_type": "operator_graph",
                "title": entry.get("operator", ""),
                "text": json.dumps(entry, ensure_ascii=False),
                "metadata": entry,
            }
        )

    for entry in _load_json(RECIPES_PATH, []):
        if not isinstance(entry, dict):
            continue
        docs.append(
            {
                "document_id": entry.get("recipe_id", "recipe"),
                "document_type": "recipe",
                "title": entry.get("goal", "") or entry.get("recipe_id", ""),
                "text": json.dumps(entry, ensure_ascii=False),
                "metadata": entry,
            }
        )

    for entry in _load_json(USE_CASES_PATH, []):
        if not isinstance(entry, dict):
            continue
        docs.append(
            {
                "document_id": entry.get("use_case_id", "use_case"),
                "document_type": "use_case",
                "title": entry.get("goal", "") or entry.get("use_case_id", ""),
                "text": json.dumps(entry, ensure_ascii=False),
                "metadata": entry,
            }
        )

    for entry in _load_json(QUESTIONS_PATH, []):
        if not isinstance(entry, dict):
            continue
        docs.append(
            {
                "document_id": f"question::{entry.get('question', 'unknown')}",
                "document_type": "question",
                "title": entry.get("question", ""),
                "text": json.dumps(entry, ensure_ascii=False),
                "metadata": entry,
            }
        )

    return docs


def _resolve_task_name(user_query: str, ranked_docs: List[Dict[str, Any]]) -> str:
    lowered = str(user_query or "").lower()
    for entry in _load_json(TASK_ALIASES_PATH, []):
        if not isinstance(entry, dict):
            continue
        aliases = [str(alias).lower().strip() for alias in entry.get("aliases", [])]
        task_name = str(entry.get("task", "")).strip()
        if task_name and any(alias and alias in lowered for alias in aliases):
            return task_name

    for doc in ranked_docs:
        metadata = doc.get("metadata", {}) if isinstance(doc.get("metadata"), dict) else {}
        if doc.get("document_type") == "task_alias":
            task_name = str(metadata.get("task", "")).strip()
            if task_name:
                return task_name
        if doc.get("document_type") == "recipe":
            title = str(doc.get("title", "")).strip()
            if title:
                return title

    return str(user_query or "").strip()


def _write_rag_prompt(query: str, query_type: str, ranked_docs: List[Dict[str, Any]], workflow: Dict[str, Any]) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        f"Query: {query}",
        f"Query type: {query_type}",
        "",
        "Retrieved context:",
    ]
    for item in ranked_docs:
        lines.append(
            f"- [{item.get('document_type')}] {item.get('title') or item.get('document_id')} "
            f"(score={item.get('final_score', 0)})"
        )

    lines.extend(["", "Workflow steps:"])
    for step in workflow.get("steps", []):
        lines.append(f"- {step}")

    RAG_PROMPT_PATH.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def run_pipeline(payload: Dict[str, Any]) -> Dict[str, Any]:
    query = str(payload.get("query") or payload.get("question") or "").strip()
    session_id = str(payload.get("session_id") or payload.get("sessionId") or "").strip() or "default"

    if not query:
        return {"error": "Query is required."}

    docs = _build_documents()
    query_type = classify_query(query)
    scored_docs = []
    for doc in docs:
        scored_docs.append(
            {
                **doc,
                "embedding_score": round(
                    _keyword_score(query, doc.get("title", ""), doc.get("text", "")),
                    6,
                ),
            }
        )

    ranked_docs = rank_documents(query, query_type, scored_docs, top_k=6, keyword_fallback_threshold=0.15)
    write_retrieval_debug(LOG_DIR / "retrieval_debug.json", query, query_type, ranked_docs)

    task_name = _resolve_task_name(query, ranked_docs)
    operator_graph = _load_json(OPERATOR_GRAPH_PATH, [])
    recipes = _load_json(RECIPES_PATH, [])
    workflow = generate_workflow(task_name, operator_graph, recipes)
    workflow_with_actions = generate_ui_actions(workflow)
    ui_actions = workflow_with_actions.get("ui_actions", {})

    _write_rag_prompt(query, query_type, ranked_docs, workflow_with_actions)
    explanation = generate_response(query, ranked_docs, workflow_with_actions, ui_actions)
    structured_response = build_structured_response(explanation, workflow_with_actions, ui_actions)
    update_session(session_id, workflow_with_actions, query)

    return {
        "session_id": session_id,
        "response": structured_response['answer'],
        "answer": structured_response['answer'],
        "explanation": structured_response['explanation'],
        "ui_execution": structured_response['ui_execution'],
        "expected_visual_result": structured_response['expected_visual_result'],
        "workflow_used": True,
        "query_type": query_type,
        "workflow": workflow_with_actions,
    }


def main() -> int:
    payload = json.load(sys.stdin)
    result = run_pipeline(payload)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
