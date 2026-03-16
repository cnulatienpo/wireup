"""Structured prompt composer for RAG context assembly."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Dict, List

from backend.parameter_instructions import extract_parameter_instructions, write_parameter_debug_log

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

DOC_TYPE_ORDER = ["task_alias", "operator", "glossary", "recipe", "use_case", "control_mapping", "error"]
DOC_TYPE_HEADINGS = {
    "task_alias": "=== TASK ALIASES ===",
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

    if section == "task_alias":
        return f"Task: {title}\n{text}" if text else f"Task: {title}"
    if section == "control_mapping":
        return f"Operator: {title}\n{text}" if text else f"Operator: {title}"
    if section == "recipe":
        return f"{title}\n{text}" if text else title
    return f"{title}\nDescription: {text}" if text else title


def _extract_goal_keywords(user_query: str, recipe_docs: List[Dict[str, Any]]) -> List[str]:
    text_parts = [str(user_query or "")]
    for doc in recipe_docs:
        text_parts.append(str(doc.get("chunk_text") or doc.get("text") or ""))
    return re.findall(r"[a-z0-9]+", " ".join(text_parts).lower())


def _build_parameter_controls_section(
    retrieved_operator_docs: List[Dict[str, Any]],
    goal_keywords: List[str],
) -> str:
    parameter_steps: List[Dict[str, Any]] = []
    for operator_doc in retrieved_operator_docs:
        operator_name = str(
            operator_doc.get("operator_name")
            or operator_doc.get("title")
            or operator_doc.get("document_id")
            or ""
        ).strip()
        if not operator_name:
            continue
        parameter_steps.extend(extract_parameter_instructions(operator_name, goal_keywords))

    debug_entries: List[Dict[str, Any]] = []
    instructions_by_operator: Dict[str, List[Dict[str, Any]]] = {}
    for step in parameter_steps:
        instructions_by_operator.setdefault(step["operator"], []).append(step)

    for operator, instructions in instructions_by_operator.items():
        debug_entries.append({"operator": operator, "parameters_returned": len(instructions)})

    write_parameter_debug_log(debug_entries)

    if not instructions_by_operator:
        return ""

    lines = ["=== PARAMETER CONTROLS ===", ""]
    for operator, instructions in instructions_by_operator.items():
        lines.append(f"Operator: {operator}")
        lines.append("")
        for item in instructions:
            lines.append(item["parameter"])
            lines.append(item["what_it_controls"])
            if item.get("how_to_use"):
                lines.append(item["how_to_use"])
            lines.append("")

    return "\n".join(lines).rstrip()


def compose_prompt(user_query: str, query_type: str, retrieved_docs: List[Dict[str, Any]]) -> str:
    grouped_context: Dict[str, List[Dict[str, Any]]] = {
        "task_alias": [],
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

    goal_keywords = _extract_goal_keywords(user_query, grouped_context["recipe"])
    parameter_controls_section = _build_parameter_controls_section(grouped_context["operator"], goal_keywords)

    if parameter_controls_section:
        final_prompt = (
            f"SYSTEM_PROMPT\n{SYSTEM_PROMPT}\n\n"
            f"=== QUERY TYPE ===\n{query_type}\n\n"
            f"{structured_context}\n\n"
            f"{parameter_controls_section}\n\n"
            f"USER QUESTION\n{user_query}\n"
        )
    else:
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
