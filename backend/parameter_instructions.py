"""Parameter instruction extraction from operator JSON knowledge."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Sequence

print("Parameter instruction system initialized")
print("Operator parameter extraction enabled")

DEFAULT_FILTER_KEYWORDS = {
    "index",
    "file",
    "play",
    "rate",
    "switch",
    "blend",
    "opacity",
    "translate",
    "scale",
    "rotate",
    "operation",
    "mode",
}


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OPERATORS_DIR = PROJECT_ROOT / "knowledge" / "operators"
PARAMETER_DEBUG_PATH = PROJECT_ROOT / "logs" / "parameter_debug.json"


def _tokenize(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", str(value or "").lower()) if token}


def _operator_filename_candidates(operator_name: str) -> List[str]:
    normalized = str(operator_name or "").strip()
    if not normalized:
        return []

    slug = re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")
    no_space = re.sub(r"\s+", "", normalized.lower())

    candidates = [f"{normalized}.json", f"{slug}.json", f"{no_space}.json"]
    return list(dict.fromkeys(candidates))


def _load_operator_payload(operator_name: str) -> Dict[str, Any]:
    for candidate in _operator_filename_candidates(operator_name):
        path = OPERATORS_DIR / candidate
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return {}


def _iter_menu_items(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    menus = payload.get("operator_specific_menus") or []
    menu_items: List[Dict[str, Any]] = []

    for menu in menus:
        items = menu.get("items") if isinstance(menu, dict) else None
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                menu_items.append(item)

    return menu_items


def _normalize_common_values(item: Dict[str, Any]) -> List[str]:
    for key in ("common_values", "values", "options"):
        value = item.get(key)
        if isinstance(value, list):
            return [str(entry).strip() for entry in value if str(entry).strip()]
    return []


def extract_parameter_instructions(operator_name: str, goal_keywords: Sequence[str]) -> List[Dict[str, Any]]:
    payload = _load_operator_payload(operator_name)
    if not payload:
        return []

    query_tokens = _tokenize(" ".join(goal_keywords))
    query_tokens.update(DEFAULT_FILTER_KEYWORDS)

    instructions: List[Dict[str, Any]] = []
    for item in _iter_menu_items(payload):
        parameter = str(item.get("parameter") or item.get("name") or "").strip()
        description = str(
            item.get("what_it_controls")
            or item.get("description")
            or item.get("help")
            or ""
        ).strip()

        if not parameter and not description:
            continue

        candidate_tokens = _tokenize(f"{parameter} {description}")
        if not candidate_tokens.intersection(query_tokens):
            continue

        common_values = _normalize_common_values(item)
        how_to_use = str(item.get("how_to_use") or "").strip()
        if not how_to_use and common_values:
            how_to_use = f"Set to {common_values[0]} for a common starting point."

        instructions.append(
            {
                "operator": str(payload.get("operator_name") or operator_name).strip(),
                "parameter": parameter or "Unknown Parameter",
                "what_it_controls": description or "No description provided.",
                "common_values": common_values,
                "how_to_use": how_to_use,
            }
        )

    return instructions


def write_parameter_debug_log(entries: List[Dict[str, Any]]) -> None:
    PARAMETER_DEBUG_PATH.parent.mkdir(parents=True, exist_ok=True)
    PARAMETER_DEBUG_PATH.write_text(json.dumps(entries, indent=2), encoding="utf-8")
