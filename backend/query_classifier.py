"""Lightweight rule-based query classifier for Ray Ray retrieval routing."""

from __future__ import annotations

OPERATOR_DEFINITION_PHRASES = (
    "what is",
    "what does",
    "definition of",
    "explain operator",
)

WORKFLOW_RECIPE_PHRASES = (
    "how do i",
    "how to",
    "steps to",
    "stitch",
    "combine",
    "build",
    "connect nodes",
    "make",
)

PARAMETER_CONTROL_PHRASES = (
    "connect",
    "drive",
    "control",
    "export",
    "where do i put",
    "hook up",
    "parameter",
)

TROUBLESHOOTING_PHRASES = (
    "not working",
    "why",
    "error",
    "broken",
    "black screen",
    "nothing happens",
)

CONCEPT_EXPLANATION_PHRASES = (
    "concept",
    "why does",
    "how does",
)


def _contains_any(query: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in query for phrase in phrases)


def classify_query(user_query: str) -> str:
    """Classify the user's query intent for retrieval routing."""
    q = str(user_query or "").lower().strip()

    if _contains_any(q, OPERATOR_DEFINITION_PHRASES):
        return "operator_definition"

    if _contains_any(q, WORKFLOW_RECIPE_PHRASES):
        return "workflow_recipe"

    if _contains_any(q, PARAMETER_CONTROL_PHRASES):
        return "parameter_control"

    if _contains_any(q, TROUBLESHOOTING_PHRASES):
        return "troubleshooting"

    if _contains_any(q, CONCEPT_EXPLANATION_PHRASES):
        return "concept_explanation"

    return "unknown"
