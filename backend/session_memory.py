"""Lightweight in-process session memory for conversation context tracking."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict

print("Session memory enabled")
print("Conversation context tracking active")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SESSION_MEMORY_LOG_PATH = PROJECT_ROOT / "logs" / "session_memory.json"
RECENT_QUERY_LIMIT = 10

FOLLOW_UP_PHRASES = (
    "that node",
    "this parameter",
    "the switch",
    "the previous network",
)


class SessionMemory:
    """Container for per-session workflow context."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(self, session_id: str) -> Dict[str, Any]:
        session = {
            "session_id": session_id,
            "active_task": "",
            "operators_in_context": [],
            "parameters_discussed": [],
            "last_workflow": {},
            "recent_queries": [],
        }
        self._sessions[session_id] = session
        self._write_log()
        return deepcopy(session)

    def get_session(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self._sessions:
            return self.create_session(session_id)
        return deepcopy(self._sessions[session_id])

    def update_session(self, session_id: str, workflow: Dict[str, Any] | None, query: str) -> Dict[str, Any]:
        if session_id not in self._sessions:
            self.create_session(session_id)

        session = self._sessions[session_id]
        normalized_query = str(query or "").strip()
        if normalized_query:
            session["recent_queries"].append(normalized_query)
            session["recent_queries"] = session["recent_queries"][-RECENT_QUERY_LIMIT:]

        if isinstance(workflow, dict) and workflow:
            session["active_task"] = str(workflow.get("task") or session.get("active_task") or "")
            session["operators_in_context"] = [
                str(op).strip() for op in workflow.get("operators", []) if str(op).strip()
            ]
            session["parameters_discussed"] = _format_parameters(workflow.get("parameters", []))
            session["last_workflow"] = deepcopy(workflow)

        self._write_log()
        return deepcopy(session)

    def clear_session(self, session_id: str) -> Dict[str, Any]:
        session = self.create_session(session_id)
        self._write_log()
        return session

    def _write_log(self) -> None:
        SESSION_MEMORY_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = list(self._sessions.values())
        SESSION_MEMORY_LOG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


SESSION_MEMORY = SessionMemory()


def _format_parameters(parameters: Any) -> list[str]:
    if not isinstance(parameters, list):
        return []

    formatted: list[str] = []
    for item in parameters:
        if not isinstance(item, dict):
            continue
        operator = str(item.get("operator", "")).strip()
        parameter = str(item.get("parameter", "")).strip()
        if operator and parameter:
            formatted.append(f"{operator} → {parameter}")
    return formatted


def is_follow_up_query(query: str) -> bool:
    lowered = str(query or "").lower()
    if any(phrase in lowered for phrase in FOLLOW_UP_PHRASES):
        return True

    pronoun_pattern = r"\b(that|this|previous|it|they|those)\b"
    return bool(re.search(pronoun_pattern, lowered))


def create_session(session_id: str) -> Dict[str, Any]:
    return SESSION_MEMORY.create_session(session_id)


def get_session(session_id: str) -> Dict[str, Any]:
    return SESSION_MEMORY.get_session(session_id)


def update_session(session_id: str, workflow: Dict[str, Any] | None, query: str) -> Dict[str, Any]:
    return SESSION_MEMORY.update_session(session_id, workflow, query)


def clear_session(session_id: str) -> Dict[str, Any]:
    return SESSION_MEMORY.clear_session(session_id)
