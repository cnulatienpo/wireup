"""Format workflow actions into TouchDesigner teaching loops."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

print("Action loop formatter enabled")
print("Step-by-step tutor mode active")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ACTION_RESPONSE_LOG_PATH = PROJECT_ROOT / "logs" / "action_response.json"


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _humanize_action_instruction(instruction: str) -> str:
    cleaned = _normalize_text(instruction)
    if not cleaned:
        return ""
    return cleaned[0].upper() + cleaned[1:] if cleaned else cleaned


def _infer_action_type(action: Dict[str, Any]) -> str:
    explicit_type = _normalize_text(action.get("type", ""))
    if explicit_type:
        return explicit_type

    instruction = _normalize_text(action.get("instruction", "")).lower()
    if "drag the output" in instruction or "connect" in instruction:
        return "connect_nodes"
    if instruction.startswith("press tab") or "drop the" in instruction:
        return "create_node"
    if "parameter panel" in instruction or "open the parameter" in instruction:
        return "open_parameters"
    if "drag the chop channel" in instruction:
        return "drag_channel"
    if "parameter" in instruction and "adjust" in instruction:
        return "adjust_parameter"
    return "generic"


def generate_expected_result(action: Dict[str, Any]) -> str:
    action_type = _infer_action_type(action)
    operator = _normalize_text(action.get("operator", ""))
    parameter = _normalize_text(action.get("parameter", ""))

    if action_type == "connect_nodes":
        return "You should see a wire connecting the nodes."
    if action_type == "create_node":
        return f"You should see the {operator} appear in the network." if operator else "You should see the node appear in the network."
    if action_type == "open_parameters":
        return "You should see the parameter panel open."
    if action_type == "adjust_parameter":
        if parameter:
            return f"You should see the output change as the {parameter} value updates."
        return "You should see the image or output change."
    if action_type == "drag_channel":
        if parameter:
            return f"You should see the {parameter} parameter turn green."
        return "You should see the parameter turn green."

    instruction = _normalize_text(action.get("instruction", ""))
    if instruction:
        return "You should see TouchDesigner respond to that change in the network or viewer."
    return "You should see the network update."


def _workflow_hooks(workflow: Dict[str, Any] | None) -> List[str]:
    if not isinstance(workflow, dict):
        return []

    hooks: List[str] = []
    for step in workflow.get("steps", []):
        text = _normalize_text(step)
        if not text:
            continue
        text = re.sub(r"^Step\s*\d+\s*:\s*", "", text, flags=re.IGNORECASE)
        hooks.append(text)
    return hooks


def _infer_next_hook(index: int, actions: List[Dict[str, Any]], workflow: Dict[str, Any] | None) -> str:
    next_action = actions[index + 1] if index + 1 < len(actions) else None
    if isinstance(next_action, dict):
        next_instruction = _normalize_text(next_action.get("instruction", ""))
        if next_instruction:
            return f"Next, {next_instruction[0].lower() + next_instruction[1:]}"

    hooks = _workflow_hooks(workflow)
    if index < len(hooks):
        return f"Next, {hooks[index][0].lower() + hooks[index][1:]}"

    return ""


def _supplement_from_workflow(existing_steps: List[Dict[str, str]], workflow: Dict[str, Any] | None) -> List[Dict[str, str]]:
    if len(existing_steps) >= 3 or not isinstance(workflow, dict):
        return existing_steps

    hooks = _workflow_hooks(workflow)
    for hook in hooks:
        if len(existing_steps) >= 3:
            break
        existing_steps.append(
            {
                "action": hook,
                "expect": "You should see the network continue to build toward your goal.",
                "next": "",
            }
        )
    return existing_steps


def _fallback_question(user_query: str) -> str:
    lowered = _normalize_text(user_query).lower()
    if any(word in lowered for word in ["switch", "swap", "clip"]):
        return "Are you trying to switch clips instantly or blend them together?"
    if any(word in lowered for word in ["control", "animate", "modulate"]):
        return "Which parameter are you trying to control in TouchDesigner?"
    return "What are you trying to build first in TouchDesigner: the source, the effect, or the final output?"


def _write_action_response_log(payload: Dict[str, Any]) -> None:
    ACTION_RESPONSE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    log_payload = {
        "status": ["Action loop formatter enabled", "Step-by-step tutor mode active"],
        **payload,
    }
    ACTION_RESPONSE_LOG_PATH.write_text(json.dumps(log_payload, indent=2), encoding="utf-8")


def format_action_response(
    ui_actions: Dict[str, Any] | None,
    workflow: Dict[str, Any] | None,
    user_query: str,
) -> str:
    """Format UI actions into DO -> SEE -> NEXT teaching loops."""
    actions = []
    if isinstance(ui_actions, dict):
        raw_actions = ui_actions.get("actions", [])
        if isinstance(raw_actions, list):
            actions = [item for item in raw_actions if isinstance(item, dict)]

    steps: List[Dict[str, str]] = []
    for index, action in enumerate(actions):
        instruction = _humanize_action_instruction(action.get("instruction", ""))
        if not instruction:
            continue
        steps.append(
            {
                "action": instruction,
                "expect": generate_expected_result(action),
                "next": _infer_next_hook(index, actions, workflow),
            }
        )

    steps = _supplement_from_workflow(steps, workflow)

    if not steps:
        fallback = _fallback_question(user_query)
        payload = {"steps": [], "fallback": fallback, "user_query": user_query}
        _write_action_response_log(payload)
        return fallback

    payload = {"steps": steps, "user_query": user_query}
    _write_action_response_log(payload)

    blocks: List[str] = []
    for index, step in enumerate(steps, start=1):
        blocks.append(f"Step {index}")
        blocks.append(f"DO: {step['action']}")
        blocks.append(f"SEE: {step['expect']}")
        if step.get("next"):
            blocks.append(f"NEXT: {step['next']}")
        blocks.append("")

    return "\n".join(blocks).strip()
