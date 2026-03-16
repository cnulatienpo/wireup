"""Conversation example loader and similarity selector for teaching examples."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
CONVERSATION_EXAMPLES_PATH = ROOT / "knowledge" / "conversations" / "touchdesigner_tutor_examples.json"
CONVERSATION_EXAMPLE_LOG_PATH = ROOT / "logs" / "conversation_examples.json"

ELIGIBLE_QUERY_TYPES = {"workflow_recipe", "concept_explanation"}


@lru_cache(maxsize=1)
def load_conversation_examples() -> List[Dict[str, Any]]:
    """Load tutor conversation examples from disk."""
    if not CONVERSATION_EXAMPLES_PATH.exists():
        return []

    try:
        payload = json.loads(CONVERSATION_EXAMPLES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if not isinstance(payload, list):
        return []

    examples: List[Dict[str, Any]] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue

        user_goal = str(entry.get("user_goal", "")).strip()
        assistant_response = str(entry.get("assistant_response", "")).strip()
        conversation_style = str(entry.get("conversation_style", "")).strip() or "general"
        concepts_used = [
            str(item).strip()
            for item in entry.get("concepts_used", [])
            if str(item).strip()
        ]

        if not user_goal or not assistant_response:
            continue

        examples.append(
            {
                "user_goal": user_goal,
                "assistant_response": assistant_response,
                "conversation_style": conversation_style,
                "concepts_used": concepts_used,
            }
        )

    return examples


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def select_similar_examples(
    user_query: str,
    query_type: str,
    *,
    max_examples: int = 3,
) -> List[Dict[str, Any]]:
    """Select up to max_examples teaching examples similar to user query."""
    if str(query_type).strip().lower() not in ELIGIBLE_QUERY_TYPES:
        return []

    examples = load_conversation_examples()
    if not examples:
        return []

    query_tokens = _tokenize(user_query)
    if not query_tokens:
        return examples[:max_examples]

    scored: List[tuple[float, Dict[str, Any]]] = []
    for example in examples:
        haystack = " ".join(
            [
                example.get("user_goal", ""),
                " ".join(example.get("concepts_used", [])),
                example.get("conversation_style", ""),
            ]
        )
        overlap = query_tokens.intersection(_tokenize(haystack))
        score = len(overlap) / max(len(query_tokens), 1)
        scored.append((score, example))

    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [example for _, example in scored[:max_examples]]

    return selected


def log_conversation_example_influence(
    *,
    user_query: str,
    query_type: str,
    selected_examples: List[Dict[str, Any]],
) -> None:
    """Append the selected teaching examples for a query to logs/conversation_examples.json."""
    CONVERSATION_EXAMPLE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing_log: List[Dict[str, Any]] = []
    if CONVERSATION_EXAMPLE_LOG_PATH.exists():
        try:
            payload = json.loads(CONVERSATION_EXAMPLE_LOG_PATH.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                existing_log = payload
        except json.JSONDecodeError:
            existing_log = []

    log_entry = {
        "user_query": user_query,
        "query_type": query_type,
        "selected_examples": [
            {
                "user_goal": item.get("user_goal", ""),
                "conversation_style": item.get("conversation_style", ""),
                "concepts_used": item.get("concepts_used", []),
            }
            for item in selected_examples
        ],
    }

    existing_log.append(log_entry)
    CONVERSATION_EXAMPLE_LOG_PATH.write_text(json.dumps(existing_log, indent=2), encoding="utf-8")
