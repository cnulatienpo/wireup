"""TouchDesigner Web Client DAT callbacks for the Wireup Outpost bridge."""

import json


def _extract_answer(response_text):
    try:
        payload = json.loads(response_text)
    except Exception:
        return response_text

    if isinstance(payload, dict):
        return payload.get('answer') or payload.get('response') or response_text

    return response_text


def onResponse(dat, response, info):
    target = op('response_in')
    if target is not None:
        target.text = _extract_answer(response)
    return
