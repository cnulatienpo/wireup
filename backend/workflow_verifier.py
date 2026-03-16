"""Workflow truth-layer verification against operator JSON definitions."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

print("Workflow verifier enabled")
print("Operator truth validation active")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_VERIFIER_LOG_PATH = PROJECT_ROOT / "logs" / "workflow_verifier.json"

NUMERIC_PARAMETER_HINTS = {
    "int",
    "integer",
    "float",
    "number",
    "numeric",
    "double",
    "slider",
    "menu",
    "pulse",
}

TOGGLE_PARAMETER_HINTS = {"bool", "boolean", "toggle", "switch", "checkbox"}

INVALID_CHOP_HINTS = {
    "file",
    "path",
    "string",
    "text",
    "folder",
    "filename",
    "directory",
}


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _normalize_operator_name(value: str) -> str:
    return re.sub(r"[_\-]+", " ", str(value or "").strip())


def _extract_operator_name(payload: Dict[str, Any], fallback: str = "") -> str:
    for key in ("operator_name", "name", "operator", "label"):
        value = str(payload.get(key, "")).strip()
        if value:
            return value
    return fallback


def _iter_menu_entries(definition: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for menu_key in ("operator_specific_menus", "assumed_standard_menus"):
        menus = definition.get(menu_key)
        if not isinstance(menus, list):
            continue

        for menu in menus:
            if not isinstance(menu, dict):
                continue

            items = menu.get("items")
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        yield item
            else:
                yield menu


def _parameter_type_hints(menu_item: Dict[str, Any]) -> str:
    parts = [
        str(menu_item.get("type", "")),
        str(menu_item.get("parameter_type", "")),
        str(menu_item.get("value_type", "")),
        str(menu_item.get("style", "")),
        str(menu_item.get("what_it_controls", "")),
        str(menu_item.get("description", "")),
    ]
    return " ".join(part for part in parts if part).lower()


def _is_chop_compatible_parameter(menu_item: Dict[str, Any]) -> bool:
    hints = _parameter_type_hints(menu_item)
    if any(token in hints for token in INVALID_CHOP_HINTS):
        return False
    return any(token in hints for token in NUMERIC_PARAMETER_HINTS | TOGGLE_PARAMETER_HINTS)


def _build_edge_index(operator_graph: Sequence[Dict[str, Any]]) -> set[tuple[str, str]]:
    edges: set[tuple[str, str]] = set()
    for entry in operator_graph:
        if not isinstance(entry, dict):
            continue

        source = _normalize_operator_name(str(entry.get("operator", "")))
        if not source:
            continue

        for connection in entry.get("connections", []):
            if not isinstance(connection, dict):
                continue
            target = _normalize_operator_name(str(connection.get("target", "")))
            if target:
                edges.add((source, target))

    return edges


def _write_verifier_log(payload: Dict[str, Any]) -> None:
    WORKFLOW_VERIFIER_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    WORKFLOW_VERIFIER_LOG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def verify_workflow(workflow: Dict[str, Any], operator_definitions: Sequence[Dict[str, Any]] | Dict[str, Any]) -> Dict[str, Any]:
    """Verify workflow operators, parameters, and connections against operator definitions."""
    if not isinstance(workflow, dict):
        _write_verifier_log({
            "removed_parameters": [],
            "invalid_operators": [],
            "verified_operators": [],
            "uncertain_connections": [],
            "warnings": ["Workflow payload was not a dictionary."],
        })
        return {"operators": [], "steps": [], "parameters": [], "connections": []}

    definitions_by_slug: Dict[str, Dict[str, Any]] = {}

    if isinstance(operator_definitions, dict):
        iterator = operator_definitions.items()
    else:
        iterator = (("", item) for item in operator_definitions)

    for key, value in iterator:
        if not isinstance(value, dict):
            continue
        name = _extract_operator_name(value, str(key).strip())
        if not name:
            continue
        definitions_by_slug[_slug(name)] = value

    raw_operators = workflow.get("operators", [])
    operator_list = [str(item).strip() for item in raw_operators if str(item).strip()]

    verified_operators: List[str] = []
    invalid_operators: List[str] = []
    warnings: List[str] = []

    for operator in operator_list:
        normalized = _normalize_operator_name(operator)
        if _slug(normalized) in definitions_by_slug:
            verified_operators.append(normalized)
        else:
            invalid_operators.append(normalized)
            warnings.append(f"Removed unknown operator: {normalized}")
            print(f"[workflow_verifier] warning: removed unknown operator '{normalized}'")

    available_definitions = {
        operator: definitions_by_slug.get(_slug(operator), {})
        for operator in verified_operators
    }

    seen_parameter_keys: set[tuple[str, str, str]] = set()
    removed_parameters: List[str] = []
    verified_parameters: List[Dict[str, Any]] = []

    for param in workflow.get("parameters", []):
        if not isinstance(param, dict):
            continue

        operator = _normalize_operator_name(str(param.get("operator", "")).strip())
        parameter = str(param.get("parameter", "")).strip()
        signal_type = str(param.get("signal_type", "")).strip().upper()

        if not operator or not parameter:
            continue

        if operator not in available_definitions:
            removed_parameters.append(parameter)
            warnings.append(f"Removed parameter '{parameter}' for invalid operator '{operator}'.")
            print(f"[workflow_verifier] warning: removed parameter '{parameter}' on invalid operator '{operator}'")
            continue

        parameter_slug = _slug(parameter)
        operator_definition = available_definitions[operator]
        matching_item = next(
            (
                menu_item
                for menu_item in _iter_menu_entries(operator_definition)
                if _slug(menu_item.get("parameter") or menu_item.get("name") or "") == parameter_slug
            ),
            None,
        )

        if matching_item is None:
            removed_parameters.append(parameter)
            warnings.append(f"Removed unknown parameter '{parameter}' from '{operator}'.")
            print(f"[workflow_verifier] warning: removed unknown parameter '{parameter}' from '{operator}'")
            continue

        if signal_type == "CHOP" and not _is_chop_compatible_parameter(matching_item):
            removed_parameters.append(parameter)
            warnings.append(
                f"Removed CHOP-incompatible parameter '{parameter}' from '{operator}'."
            )
            print(
                f"[workflow_verifier] warning: removed CHOP-incompatible parameter '{parameter}' from '{operator}'"
            )
            continue

        dedupe_key = (operator, parameter_slug, signal_type)
        if dedupe_key in seen_parameter_keys:
            continue

        seen_parameter_keys.add(dedupe_key)
        verified_parameters.append(param)

    graph_edges = _build_edge_index(workflow.get("operator_graph", []))
    if not graph_edges:
        graph_edges = _build_edge_index(workflow.get("operator_graph_entries", []))
    if not graph_edges:
        graph_edges = _build_edge_index(workflow.get("graph", []))

    existing_connections = workflow.get("connections", [])
    verified_connections: List[Dict[str, Any]] = []
    uncertain_connections: List[Dict[str, str]] = []

    if isinstance(existing_connections, list) and existing_connections:
        for connection in existing_connections:
            if not isinstance(connection, dict):
                continue
            source = _normalize_operator_name(str(connection.get("source", "")).strip())
            target = _normalize_operator_name(str(connection.get("target", "")).strip())
            if not source or not target:
                continue
            if source not in verified_operators or target not in verified_operators:
                continue
            confirmed = (source, target) in graph_edges if graph_edges else bool(connection.get("confirmed", False))
            verified_connection = dict(connection)
            verified_connection["source"] = source
            verified_connection["target"] = target
            verified_connection["confirmed"] = confirmed
            if not confirmed:
                verified_connection["uncertain"] = True
                uncertain_connections.append({"source": source, "target": target})
            verified_connections.append(verified_connection)
    else:
        for source, target in zip(verified_operators, verified_operators[1:]):
            confirmed = (source, target) in graph_edges if graph_edges else False
            item = {"source": source, "target": target, "confirmed": confirmed}
            if not confirmed:
                item["uncertain"] = True
                uncertain_connections.append({"source": source, "target": target})
            verified_connections.append(item)

    steps = workflow.get("steps", [])
    verified_workflow = {
        **workflow,
        "operators": verified_operators,
        "parameters": verified_parameters,
        "connections": verified_connections,
        "steps": steps if isinstance(steps, list) else [],
    }

    _write_verifier_log(
        {
            "removed_parameters": removed_parameters,
            "invalid_operators": invalid_operators,
            "verified_operators": verified_operators,
            "uncertain_connections": uncertain_connections,
            "warnings": warnings,
        }
    )

    return verified_workflow
