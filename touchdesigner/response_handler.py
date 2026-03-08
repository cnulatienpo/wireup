"""TouchDesigner Script DAT: response_handler

Parses Web Client DAT responses and renders answer in response_view.
"""

import json


def _set_response_view(text):
    view = parent().op('response_view')
    if view is None:
        return

    for par_name in ('text', 'Text'):
        try:
            getattr(view.par, par_name).val = text
            return
        except Exception:
            pass

    try:
        view.text = text
    except Exception:
        pass


def _safe_json_loads(raw_text):
    try:
        return json.loads(raw_text)
    except Exception:
        return None


def _build_output(question, state, answer):
    return '\n'.join([
        f"Selected Node: {state.get('selectedNode')}",
        f"Operator Type: {state.get('nodeType')}",
        f"Question Input: {question}",
        f"Ray Ray Response: {answer}",
    ])


def handle_web_response(raw_text):
    """Call this from request_sender Web Client DAT callbacks."""
    payload = _safe_json_loads(raw_text) or {}

    answer = payload.get('answer') or payload.get('response') or str(payload)
    question = payload.get('question', '')
    state = payload.get('state') or {
        'selectedNode': None,
        'nodeType': None,
    }

    _set_response_view(_build_output(question, state, answer))


def onReceive(dat, rowIndex, message, bytes, peer):
    """Optional DAT callback signature for network/web callbacks."""
    try:
        raw = message if isinstance(message, str) else message.decode('utf-8', errors='replace')
    except Exception:
        raw = str(message)

    handle_web_response(raw)
    return
