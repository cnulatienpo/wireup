"""Multi-pass tutor response planner for Ray Ray."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Sequence
from urllib import request

print("Tutor brain initialized")
print("Multi-pass response system active")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TUTOR_BRAIN_LOG_PATH = PROJECT_ROOT / "logs" / "tutor_brain.json"

ORIENTATION_BY_STRATEGY = {
    "guided_build": "Alright, easiest way to do this is to build it one piece at a time.",
    "parameter_control": "Alright, let’s wire this up so you can control it cleanly.",
    "diagnostic": "Alright, let’s check the setup in the quickest order.",
    "clarify_then_build": "Quick question — are you trying to switch clips or blend them together?",
    "concept_walkthrough": "Alright, let’s make the idea concrete while you build it.",
}

CONVERSATIONAL_INSTRUCTION = (
    "You are guiding someone live. Talk like you are sitting next to them. "
    "Start with a short orientation sentence. Then guide them step-by-step. "
    "After each step, mention what they should see. Do not dump definitions. "
    "Be slightly conversational, not robotic."
)


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _extract_context_text(context: Any) -> str:
    if isinstance(context, str):
        return context
    if isinstance(context, dict):
        return " ".join(_extract_context_text(v) for v in context.values())
    if isinstance(context, Sequence) and not isinstance(context, (str, bytes, bytearray)):
        parts: List[str] = []
        for item in context:
            if isinstance(item, dict):
                parts.append(
                    _normalize_text(
                        item.get("chunk_text")
                        or item.get("text")
                        or item.get("title")
                        or item.get("operator_name")
                        or item.get("document_id")
                    )
                )
            else:
                parts.append(_normalize_text(item))
        return " ".join(part for part in parts if part)
    return _normalize_text(context)


def _infer_intent(user_query: str, context: Any, workflow: Dict[str, Any] | None) -> Dict[str, str]:
    query = _normalize_text(user_query)
    lowered = query.lower()
    context_text = _extract_context_text(context).lower()
    workflow_steps = workflow.get("steps", []) if isinstance(workflow, dict) else []

    difficulty = "beginner"
    if any(word in lowered for word in ["advanced", "modulate", "optimize", "expression", "python", "script"]):
        difficulty = "intermediate"

    intent_type = "build"
    if any(word in lowered for word in ["error", "broken", "not working", "nothing happens", "black screen", "why is"]):
        intent_type = "debug"
    elif any(word in lowered for word in ["connect", "control", "export", "parameter", "drive", "hook up"]):
        intent_type = "connect"
    elif any(word in lowered for word in ["what is", "how does", "why does", "concept", "difference between"]):
        intent_type = "concept"

    user_goal = query
    if "stitch" in lowered and "clip" in lowered:
        user_goal = "sequence video clips"
    elif "blend" in lowered and "clip" in lowered:
        user_goal = "blend video clips"
    elif intent_type == "connect" and workflow_steps:
        user_goal = _normalize_text(workflow.get("task", query))
    elif context_text:
        operator_match = re.search(r"([A-Za-z0-9]+\s+(?:TOP|CHOP|SOP|DAT|COMP))", context_text)
        if operator_match:
            user_goal = f"use {operator_match.group(1)} for {query.lower()}"

    return {
        "user_goal": user_goal,
        "difficulty": difficulty,
        "type": intent_type,
    }


def _is_low_confidence(user_query: str, intent: Dict[str, str], workflow: Dict[str, Any] | None, ui_actions: Dict[str, Any] | None) -> bool:
    query = _normalize_text(user_query).lower()
    action_count = len(ui_actions.get("actions", [])) if isinstance(ui_actions, dict) else 0
    workflow_steps = len(workflow.get("steps", [])) if isinstance(workflow, dict) else 0
    ambiguous_clip_request = "clip" in query and not any(word in query for word in ["switch", "blend", "cross", "sequence", "stitch"])
    too_short = len(query.split()) <= 2
    return intent["type"] == "build" and action_count == 0 and workflow_steps == 0 and (ambiguous_clip_request or too_short)


def _select_strategy(intent: Dict[str, str], low_confidence: bool) -> str:
    if low_confidence:
        return "clarify_then_build"
    if intent["type"] == "build":
        return "guided_build"
    if intent["type"] == "connect":
        return "parameter_control"
    if intent["type"] == "debug":
        return "diagnostic"
    if intent["type"] == "concept":
        return "concept_walkthrough"
    return "clarify_then_build"


def _build_plan() -> List[str]:
    return [
        "introduce approach briefly",
        "give step-by-step actions",
        "describe what user sees",
        "offer next step",
    ]


def _expected_result(action: Dict[str, Any]) -> str:
    action_type = _normalize_text(action.get("type", ""))
    operator = _normalize_text(action.get("operator", ""))
    parameter = _normalize_text(action.get("parameter", ""))

    if action_type == "create_node":
        return f"You should see the {operator} appear in the network." if operator else "You should see a new node appear in the network."
    if action_type == "connect_nodes":
        return "You should see a wire connecting those nodes."
    if action_type == "open_parameters":
        return "You should see the parameter panel open for that node."
    if action_type == "adjust_parameter":
        return f"You should see the output react as {parameter} changes." if parameter else "You should see the output update."
    if action_type == "drag_channel":
        return f"You should see {parameter} turn green once it is being driven." if parameter else "You should see the parameter turn green."
    return "You should see the network update after that step."


def _steps_from_actions(ui_actions: Dict[str, Any] | None) -> List[Dict[str, str]]:
    raw_actions = ui_actions.get("actions", []) if isinstance(ui_actions, dict) else []
    steps: List[Dict[str, str]] = []
    for action in raw_actions:
        if not isinstance(action, dict):
            continue
        instruction = _normalize_text(action.get("instruction", ""))
        if not instruction:
            continue
        steps.append({
            "action": instruction[0].upper() + instruction[1:],
            "expect": _expected_result(action),
        })
    return steps


def _steps_from_workflow(workflow: Dict[str, Any] | None) -> List[Dict[str, str]]:
    raw_steps = workflow.get("steps", []) if isinstance(workflow, dict) else []
    steps: List[Dict[str, str]] = []
    for item in raw_steps:
        text = re.sub(r"^Step\s*\d+\s*:\s*", "", _normalize_text(item), flags=re.IGNORECASE)
        if text:
            steps.append({
                "action": text[0].upper() + text[1:],
                "expect": "You should see the network move one step closer to the result you want.",
            })
    return steps


def _generate_action_steps(workflow: Dict[str, Any] | None, ui_actions: Dict[str, Any] | None) -> List[Dict[str, str]]:
    steps = _steps_from_actions(ui_actions)
    if len(steps) < 3:
        for item in _steps_from_workflow(workflow):
            if len(steps) >= 4:
                break
            if item not in steps:
                steps.append(item)
    return steps[:6]


def _remove_glossary_echo(answer: str, context: Any) -> str:
    context_text = _extract_context_text(context)
    glossary_lines = {
        _normalize_text(line).lower()
        for line in context_text.splitlines()
        if line.strip() and (":" in line or line.lower().startswith("description"))
    }
    filtered: List[str] = []
    for line in answer.splitlines():
        normalized = _normalize_text(line).lower()
        if normalized and normalized in glossary_lines:
            continue
        filtered.append(line)
    return "\n".join(filtered).strip()


def _build_prompt(intent: Dict[str, str], strategy: str, plan: List[str], steps: List[Dict[str, str]]) -> str:
    rendered_steps = []
    for index, step in enumerate(steps, start=1):
        rendered_steps.append(
            f"Step {index}\n{step['action']}\n{step['expect']}"
        )
    steps_block = "\n\n".join(rendered_steps)
    return (
        f"{CONVERSATIONAL_INSTRUCTION}\n\n"
        f"Intent: {json.dumps(intent)}\n"
        f"Strategy: {strategy}\n"
        f"Internal plan: {'; '.join(plan)}.\n\n"
        "Use these action steps and keep the answer grounded in them:\n"
        f"{steps_block}\n\n"
        "End with one short optional next step."
    )


def _call_deepseek(prompt: str) -> str:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    if not api_key:
        return ""

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 300,
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
    return body.get("choices", [{}])[0].get("message", {}).get("content", "").strip()


def _local_wrapper(strategy: str, steps: List[Dict[str, str]]) -> str:
    orientation = ORIENTATION_BY_STRATEGY.get(strategy, ORIENTATION_BY_STRATEGY["guided_build"])
    blocks = [orientation, ""]
    for index, step in enumerate(steps, start=1):
        blocks.append(f"Step {index}")
        blocks.append(step["action"])
        blocks.append(step["expect"])
        blocks.append("")
    blocks.append("If you want, we can build the next part together after this.")
    return "\n".join(blocks).strip()


def _enforce_output_rules(answer: str, strategy: str, steps: List[Dict[str, str]]) -> str:
    text = _normalize_text(answer)
    line_text = answer
    if strategy == "clarify_then_build":
        return ORIENTATION_BY_STRATEGY[strategy]

    if line_text.lower().count("step ") < 3:
        line_text = _local_wrapper(strategy, steps)
    if "you should see" not in line_text.lower():
        line_text = _local_wrapper(strategy, steps)
    return line_text.strip()


def _write_log(intent: Dict[str, str], strategy: str, plan: List[str], steps: List[Dict[str, str]]) -> None:
    TUTOR_BRAIN_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": ["Tutor brain initialized", "Multi-pass response system active"],
        "intent": intent,
        "strategy": strategy,
        "plan": plan,
        "steps_generated": steps,
    }
    TUTOR_BRAIN_LOG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def generate_response(
    user_query: str,
    context: Any,
    workflow: Dict[str, Any] | None,
    ui_actions: Dict[str, Any] | None,
) -> str:
    """Generate a multi-pass teaching response from intent, strategy, and UI actions."""
    intent = _infer_intent(user_query, context, workflow)
    low_confidence = _is_low_confidence(user_query, intent, workflow, ui_actions)
    strategy = _select_strategy(intent, low_confidence)
    plan = _build_plan()
    steps = _generate_action_steps(workflow, ui_actions)

    if low_confidence:
        _write_log(intent, strategy, plan, steps)
        return ORIENTATION_BY_STRATEGY[strategy]

    if len(steps) < 3:
        steps.extend([
            {
                "action": "Click through the current node chain and confirm each part is in the order you expect.",
                "expect": "You should see the flow make visual sense from input to output.",
            },
            {
                "action": "Open the key node parameters and adjust the setting that matches your goal.",
                "expect": "You should see the viewer react as you change that control.",
            },
            {
                "action": "Send the result to your output or next processing node.",
                "expect": "You should see a stable final result ready for the next step.",
            },
        ])
    steps = steps[: max(3, min(len(steps), 6))]

    prompt = _build_prompt(intent, strategy, plan, steps)
    answer = _call_deepseek(prompt) or _local_wrapper(strategy, steps)
    answer = _remove_glossary_echo(answer, context)
    answer = _enforce_output_rules(answer, strategy, steps)
    _write_log(intent, strategy, plan, steps)
    return answer
