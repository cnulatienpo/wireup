"""Conversation example loading, selection, formatting, and logging helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
CONVERSATION_EXAMPLES_PATH = ROOT / "knowledge" / "conversations" / "touchdesigner_tutor_examples.json"
CONVERSATION_EXAMPLES_LOG_PATH = ROOT / "logs" / "conversation_examples_used.json"
MAX_EXAMPLES = 3
MAX_EXAMPLE_WORDS = 220


def load_conversation_examples() -> List[Dict[str, Any]]:
    """Load conversation examples from the knowledge directory."""
    if not CONVERSATION_EXAMPLES_PATH.exists():
        return []

    with CONVERSATION_EXAMPLES_PATH.open(encoding="utf-8") as file:
        payload = json.load(file)

    return payload if isinstance(payload, list) else []


def select_conversation_examples(user_query: str, examples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Select up to three examples using simple goal-word overlap."""
    query = str(user_query or "").lower()
    query_words = query.split()
    selected: List[Dict[str, Any]] = []

    for example in examples:
        goal = str(example.get("user_goal", "")).lower()

        if any(word in goal for word in query_words):
            selected.append(example)

        if len(selected) >= MAX_EXAMPLES:
            break

    if not selected:
        selected = examples[:2]

    return _trim_examples_to_budget(selected[:MAX_EXAMPLES])


def format_conversation_examples(examples: List[Dict[str, Any]]) -> str:
    """Render selected examples into a prompt block."""
    formatted: List[str] = []

    for example in examples:
        user_goal = str(example.get("user_goal", "")).strip()
        assistant_response = str(example.get("assistant_response", "")).strip()
        if not user_goal or not assistant_response:
            continue

        formatted.append(f"User: {user_goal}\nRay Ray: {assistant_response}")

    return "\n\n".join(formatted)


def log_conversation_examples_used(user_query: str, examples: List[Dict[str, Any]]) -> None:
    """Write the selected example summary for the current query."""
    CONVERSATION_EXAMPLES_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "query": user_query,
        "examples_used": [str(example.get("user_goal", "")).strip() for example in examples if example.get("user_goal")],
    }

    CONVERSATION_EXAMPLES_LOG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _trim_examples_to_budget(examples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop the lowest-priority example if the rendered examples get too large."""
    trimmed = list(examples[:MAX_EXAMPLES])
    while trimmed and _approximate_word_count(format_conversation_examples(trimmed)) > MAX_EXAMPLE_WORDS:
        trimmed.pop()
    return trimmed


def _approximate_word_count(text: str) -> int:
    return len(text.split())
