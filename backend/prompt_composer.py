"""Structured prompt composer for RAG context assembly."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

print("Prompt composer initialized")
print("Structured context enabled")

SYSTEM_PROMPT = (
    "You are Ray Ray, a TouchDesigner tutor.\n\n"
    "Follow these rules:\n\n"
    "Use retrieved context as the source of truth.\n\n"
    "If context contains a recipe, explain it step-by-step.\n\n"
    "If context contains control mappings, explain exactly where signals connect.\n\n"
    "If context contains operator definitions, explain what the tool does.\n\n"
    "Never invent parameters or operators not present in context.\n\n"
    "If information is missing, say so."
)

DOC_TYPE_ORDER = ["operator", "glossary", "recipe", "use_case", "control_mapping", "error"]
DOC_TYPE_HEADINGS = {
    "operator": "=== OPERATORS ===",
    "glossary": "=== GLOSSARY ===",
    "recipe": "=== RECIPES ===",
    "use_case": "=== USE CASES ===",
    "control_mapping": "=== CONTROL MAPPINGS ===",
    "error": "=== ERRORS ===",
}
DOC_TYPE_ALIASES = {
    "failure_mode": "error",
    "errors": "error",
}


def _normalize_doc_type(doc: Dict[str, Any]) -> str:
    raw_doc_type = str(doc.get("document_type", "")).strip().lower()
    if raw_doc_type in DOC_TYPE_ALIASES:
        return DOC_TYPE_ALIASES[raw_doc_type]

    doc_id = str(doc.get("document_id", "")).strip().lower()
    if "glossary" in doc_id and raw_doc_type == "operator":
        return "glossary"

    return raw_doc_type


def _format_doc(doc: Dict[str, Any], section: str) -> str:
    title = str(doc.get("operator_name") or doc.get("title") or doc.get("document_id") or "Untitled").strip()
    text = str(doc.get("chunk_text") or doc.get("text") or "").strip()

    if section == "control_mapping":
        return f"Operator: {title}\n{text}" if text else f"Operator: {title}"
    if section == "recipe":
        return f"{title}\n{text}" if text else title
    return f"{title}\nDescription: {text}" if text else title


def compose_prompt(user_query: str, query_type: str, retrieved_docs: List[Dict[str, Any]]) -> str:
    grouped_context: Dict[str, List[Dict[str, Any]]] = {
        "operator": [],
        "glossary": [],
        "recipe": [],
        "use_case": [],
        "control_mapping": [],
        "error": [],
    }

    for doc in retrieved_docs:
        normalized_type = _normalize_doc_type(doc)
        if normalized_type in grouped_context:
            grouped_context[normalized_type].append(doc)

    structured_sections: List[str] = []
    for doc_type in DOC_TYPE_ORDER:
        docs = grouped_context[doc_type]
        if not docs:
            continue

        section_lines = [DOC_TYPE_HEADINGS[doc_type]]
        for doc in docs:
            section_lines.append(_format_doc(doc, doc_type))
            section_lines.append("")
        structured_sections.append("\n".join(section_lines).rstrip())

    structured_context = "\n\n".join(structured_sections) or "=== STRUCTURED CONTEXT ===\n(no retrieved context)"

    final_prompt = (
        f"SYSTEM_PROMPT\n{SYSTEM_PROMPT}\n\n"
        f"=== QUERY TYPE ===\n{query_type}\n\n"
        f"{structured_context}\n\n"
        f"USER QUESTION\n{user_query}\n"
    )

    prompt_log_path = Path(__file__).resolve().parents[1] / "logs" / "rag_prompt.txt"
    prompt_log_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_log_path.write_text(final_prompt, encoding="utf-8")

    return final_prompt
