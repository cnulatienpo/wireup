"""Dynamic workflow generation from task aliases, graph patterns, and recipes."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Sequence

from backend.parameter_instructions import extract_parameter_instructions

print("Workflow generator initialized")
print("Dynamic workflow assembly enabled")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TASK_ALIASES_PATH = PROJECT_ROOT / "knowledge" / "task_aliases" / "task_aliases.json"
WORKFLOW_DEBUG_PATH = PROJECT_ROOT / "logs" / "workflow_debug.json"


def _tokenize(value: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", str(value or "").lower())


def _load_task_aliases() -> List[Dict[str, Any]]:
    if not TASK_ALIASES_PATH.exists():
        return []

    payload = json.loads(TASK_ALIASES_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []

    return [entry for entry in payload if isinstance(entry, dict)]


def _resolve_core_operators(task_name: str, recipes: Sequence[Dict[str, Any]]) -> List[str]:
    normalized_task = str(task_name or "").strip().lower()

    for entry in _load_task_aliases():
        task_value = str(entry.get("task", "")).strip().lower()
        if task_value == normalized_task:
            operators = [str(op).strip() for op in entry.get("operators", []) if str(op).strip()]
            if operators:
                return operators

    for recipe in recipes:
        if not isinstance(recipe, dict):
            continue

        candidate_names = {
            str(recipe.get("task", "")).strip().lower(),
            str(recipe.get("recipe_id", "")).strip().lower(),
            str(recipe.get("title", "")).strip().lower(),
        }
        if normalized_task not in candidate_names:
            continue

        operators = [str(op).strip() for op in recipe.get("operators", []) if str(op).strip()]
        if operators:
            return operators

    return []


def _build_edge_index(operator_graph: Sequence[Dict[str, Any]]) -> set[tuple[str, str]]:
    edges: set[tuple[str, str]] = set()
    for entry in operator_graph:
        if not isinstance(entry, dict):
            continue
        source = str(entry.get("operator", "")).strip()
        if not source:
            continue

        for item in entry.get("connections", []):
            if not isinstance(item, dict):
                continue
            target = str(item.get("target", "")).strip()
            if target:
                edges.add((source, target))

    return edges


def _normalize_operator_name(name: str) -> str:
    raw = str(name).strip()
    return re.sub(r"[_\-]+", " ", raw)


def _confirm_connections(operators: Sequence[str], operator_graph: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    edges = _build_edge_index(operator_graph)
    confirmed: List[Dict[str, Any]] = []

    for source, target in zip(operators, operators[1:]):
        source_name = _normalize_operator_name(source)
        target_name = _normalize_operator_name(target)
        confirmed.append(
            {
                "source": source_name,
                "target": target_name,
                "confirmed": (source_name, target_name) in edges,
            }
        )

    return confirmed


def _build_workflow_steps(operators: Sequence[str], connections: Sequence[Dict[str, Any]]) -> List[str]:
    steps: List[str] = []

    for index, operator in enumerate(operators, start=1):
        op_name = _normalize_operator_name(operator)
        if index == 1:
            steps.append(f"Step {index}: Create a {op_name} and load your source media or input data.")
            continue

        prev = _normalize_operator_name(operators[index - 2])
        relation = next((item for item in connections if item["source"] == prev and item["target"] == op_name), None)
        if relation and relation["confirmed"]:
            steps.append(f"Step {index}: Create a {op_name} and connect {prev} to it.")
        else:
            steps.append(f"Step {index}: Create a {op_name} and connect it after {prev} in the chain.")

    if operators:
        last = _normalize_operator_name(operators[-1])
        steps.append(f"Step {len(operators) + 1}: Use {last} as the stable output for downstream nodes.")

    return steps


def _extract_parameter_steps(operators: Sequence[str], task_name: str) -> List[Dict[str, Any]]:
    goal_keywords = _tokenize(task_name)
    parameter_steps: List[Dict[str, Any]] = []

    for operator in operators:
        op_name = _normalize_operator_name(operator)
        parameter_steps.extend(extract_parameter_instructions(op_name, goal_keywords))

    return parameter_steps


def _write_workflow_debug(task: str, operators: Sequence[str]) -> None:
    payload = {
        "task": task,
        "operators": list(operators),
    }
    WORKFLOW_DEBUG_PATH.parent.mkdir(parents=True, exist_ok=True)
    WORKFLOW_DEBUG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def generate_workflow(
    task_name: str,
    operator_graph: Sequence[Dict[str, Any]],
    recipes: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate a structured workflow plan for a task."""
    operators = _resolve_core_operators(task_name, recipes)
    connections = _confirm_connections(operators, operator_graph)
    steps = _build_workflow_steps(operators, connections)
    parameters = _extract_parameter_steps(operators, task_name)

    workflow = {
        "task": task_name,
        "operators": operators,
        "connections": connections,
        "steps": steps,
        "parameters": parameters,
    }

    _write_workflow_debug(task_name, operators)
    return workflow
