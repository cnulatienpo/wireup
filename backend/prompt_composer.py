"""Structured prompt composer for RAG context assembly."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Dict, List

from backend.parameter_instructions import extract_parameter_instructions, write_parameter_debug_log

print("Prompt composer initialized")
print("Structured context enabled")

SYSTEM_PROMPT = Path(__file__).with_name("system_prompt.txt").read_text(encoding="utf-8").strip()

DOC_TYPE_ORDER = ["task_alias", "operator", "glossary", "recipe", "use_case", "control_mapping", "operator_graph", "error"]
DOC_TYPE_HEADINGS = {
    "task_alias": "=== TASK ALIASES ===",
    "operator": "=== OPERATORS ===",
    "glossary": "=== GLOSSARY ===",
    "recipe": "=== RECIPES ===",
    "use_case": "=== USE CASES ===",
    "control_mapping": "=== CONTROL MAPPINGS ===",
    "operator_graph": "=== OPERATOR GRAPH ===",
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




def _build_operator_graph_sections(retrieved_graph_docs: List[Dict[str, Any]]) -> str:
    if not retrieved_graph_docs:
        return ""

    connection_lines: List[str] = ["=== OPERATOR CONNECTIONS ===", ""]
    parameter_lines: List[str] = ["=== PARAMETER CONTROL ===", ""]

    for doc in retrieved_graph_docs:
        metadata = doc.get("metadata", {}) if isinstance(doc.get("metadata", {}), dict) else {}
        operator = str(metadata.get("operator") or doc.get("operator_name") or "").strip()

        for connection in metadata.get("connections", []):
            if not isinstance(connection, dict):
                continue
            target = str(connection.get("target", "")).strip()
            relationship = str(connection.get("relationship", "")).strip().replace("_", " ")
            description = str(connection.get("description", "")).strip()
            if not operator or not target:
                continue
            connection_lines.append(f"{operator} → {target}")
            if relationship:
                connection_lines.append(f"Relationship: {relationship}")
            if description:
                connection_lines.append(f"Description: {description}")
            connection_lines.append("")

        for param in metadata.get("parameter_controls", []):
            if not isinstance(param, dict):
                continue
            parameter = str(param.get("parameter", "")).strip()
            signal_type = str(param.get("signal_type", "")).strip()
            drivers = [str(item).strip() for item in param.get("drivers", []) if str(item).strip()]
            if not operator or not parameter:
                continue
            parameter_lines.append(f"Operator: {operator}")
            parameter_lines.append(f"Parameter: {parameter}")
            if signal_type:
                parameter_lines.append(f"Controlled by: {signal_type}")
            if drivers:
                parameter_lines.append(f"Common drivers: {', '.join(drivers)}")
            description = str(param.get("description", "")).strip()
            if description:
                parameter_lines.append(f"Description: {description}")
            parameter_lines.append("")

    sections: List[str] = []
    if len(connection_lines) > 2:
        sections.append("\n".join(connection_lines).rstrip())
    if len(parameter_lines) > 2:
        sections.append("\n".join(parameter_lines).rstrip())

    return "\n\n".join(sections)


def _build_generated_workflow_section(workflow: Dict[str, Any] | None) -> str:
    if not workflow:
        return ""

    steps = workflow.get("steps", []) if isinstance(workflow, dict) else []
    if not isinstance(steps, list) or not steps:
        return ""

    lines = ["=== GENERATED WORKFLOW ===", ""]
    for step in steps:
        lines.append(str(step).strip())
        lines.append("")

    for param in workflow.get("parameters", []):
        if not isinstance(param, dict):
            continue
        operator = str(param.get("operator", "")).strip()
        parameter = str(param.get("parameter", "")).strip()
        description = str(param.get("what_it_controls", "")).strip()
        if not operator or not parameter:
            continue
        lines.append(f"{operator} — Parameter: {parameter}")
        if description:
            lines.append(description)
        lines.append("")

    return "\n".join(lines).rstrip()



def _build_user_actions_section(workflow: Dict[str, Any] | None) -> str:
    if not isinstance(workflow, dict):
        return ""

    ui_actions = workflow.get("ui_actions", {})
    if not isinstance(ui_actions, dict):
        return ""

    actions = ui_actions.get("actions", [])
    if not isinstance(actions, list) or not actions:
        return ""

    lines = ["=== USER ACTIONS ===", ""]
    for action in actions:
        if not isinstance(action, dict):
            continue
        instruction = str(action.get("instruction", "")).strip()
        if not instruction:
            continue
        lines.append(instruction)

    if len(lines) <= 2:
        return ""

    return "\n".join(lines).rstrip()

def _build_current_network_context(session: Dict[str, Any] | None) -> str:
    if not isinstance(session, dict):
        return ""

    operators = [str(item).strip() for item in session.get("operators_in_context", []) if str(item).strip()]
    parameters = [str(item).strip() for item in session.get("parameters_discussed", []) if str(item).strip()]

    if not operators and not parameters:
        return ""

    lines = ["=== CURRENT NETWORK CONTEXT ===", ""]
    lines.append("Operators already in network:")
    lines.append("")
    if operators:
        lines.extend(operators)
    else:
        lines.append("(none)")

    lines.extend(["", "Parameters already discussed:", ""])
    if parameters:
        lines.extend(parameters)
    else:
        lines.append("(none)")

    return "\n".join(lines).rstrip()


def compose_prompt(
    user_query: str,
    query_type: str,
    retrieved_docs: List[Dict[str, Any]],
    generated_workflow: Dict[str, Any] | None = None,
    session: Dict[str, Any] | None = None,
) -> str:
    grouped_context: Dict[str, List[Dict[str, Any]]] = {
        "task_alias": [],
        "operator": [],
        "glossary": [],
        "recipe": [],
        "use_case": [],
        "control_mapping": [],
        "operator_graph": [],
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
    operator_graph_section = _build_operator_graph_sections(grouped_context["operator_graph"])
    generated_workflow_section = _build_generated_workflow_section(generated_workflow)
    user_actions_section = _build_user_actions_section(generated_workflow)
    current_network_section = _build_current_network_context(session)

    optional_sections = [
        section
        for section in [
            current_network_section,
            parameter_controls_section,
            operator_graph_section,
            generated_workflow_section,
            user_actions_section,
        ]
        if section
    ]
    optional_context = "\n\n".join(optional_sections)

    if optional_context:
        final_prompt = (
            f"SYSTEM_PROMPT\n{SYSTEM_PROMPT}\n\n"
            f"=== QUERY TYPE ===\n{query_type}\n\n"
            f"{structured_context}\n\n"
            f"{optional_context}\n\n"
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
