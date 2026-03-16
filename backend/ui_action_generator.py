"""Generate TouchDesigner UI interaction steps from a verified workflow."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

print("UI action generator initialized")
print("TouchDesigner interaction instructions enabled")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
UI_ACTION_LOG_PATH = PROJECT_ROOT / "logs" / "ui_actions.json"


def _normalize_operator(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def _build_create_node_action(operator: str) -> Dict[str, str]:
    base_name = operator.replace(" TOP", "").replace(" CHOP", "").replace(" SOP", "")
    return {
        "type": "create_node",
        "operator": operator,
        "instruction": f"Press TAB, type {base_name}, and drop the {operator} in the network.",
    }


def _build_connection_actions(workflow: Dict[str, Any]) -> List[Dict[str, str]]:
    actions: List[Dict[str, str]] = []
    connections = workflow.get("connections", [])
    if not isinstance(connections, list):
        return actions

    for connection in connections:
        if not isinstance(connection, dict):
            continue
        source = _normalize_operator(connection.get("source", ""))
        target = _normalize_operator(connection.get("target", ""))
        if not source or not target:
            continue
        actions.append(
            {
                "type": "connect_nodes",
                "instruction": f"Drag the output of the {source} into the first input of the {target}.",
            }
        )

    return actions


def _build_parameter_actions(workflow: Dict[str, Any]) -> List[Dict[str, str]]:
    actions: List[Dict[str, str]] = []
    parameters = workflow.get("parameters", [])
    if not isinstance(parameters, list):
        return actions

    opened_operators: set[str] = set()
    for parameter in parameters:
        if not isinstance(parameter, dict):
            continue
        operator = _normalize_operator(parameter.get("operator", ""))
        parameter_name = str(parameter.get("parameter", "")).strip()
        description = str(parameter.get("what_it_controls", "")).strip()
        signal_type = str(parameter.get("signal_type", "")).strip().upper()

        if not operator or not parameter_name:
            continue

        if operator not in opened_operators:
            opened_operators.add(operator)
            actions.append(
                {
                    "type": "open_parameters",
                    "operator": operator,
                    "instruction": f"Click the {operator} and open the parameter panel.",
                }
            )

        adjust_instruction = f"Find the {parameter_name} parameter and adjust it"
        if description:
            adjust_instruction += f" to {description.lower()}"
        adjust_instruction += "."

        actions.append(
            {
                "type": "adjust_parameter",
                "operator": operator,
                "parameter": parameter_name,
                "instruction": adjust_instruction,
            }
        )

        if signal_type == "CHOP":
            actions.append(
                {
                    "type": "drag_channel",
                    "operator": operator,
                    "parameter": parameter_name,
                    "instruction": f"Drag the CHOP channel onto the {parameter_name} parameter to control it.",
                }
            )

    return actions


def _write_ui_actions_log(payload: Dict[str, Any]) -> None:
    UI_ACTION_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    UI_ACTION_LOG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def generate_ui_actions(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """Attach UI interaction actions to a workflow and log them."""
    if not isinstance(workflow, dict):
        _write_ui_actions_log({"actions": []})
        return {"ui_actions": {"actions": []}}

    operators = workflow.get("operators", [])
    actions: List[Dict[str, str]] = []

    if isinstance(operators, list):
        for operator in operators:
            operator_name = _normalize_operator(operator)
            if operator_name:
                actions.append(_build_create_node_action(operator_name))

    actions.extend(_build_connection_actions(workflow))
    actions.extend(_build_parameter_actions(workflow))

    ui_actions = {"actions": actions}
    updated_workflow = {**workflow, "ui_actions": ui_actions}
    _write_ui_actions_log(ui_actions)
    return updated_workflow

