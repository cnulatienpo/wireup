"""TouchDesigner Web Client DAT callbacks for the Wireup Outpost bridge."""

import json


def _extract_answer(response_text):
    try:
        payload = json.loads(response_text)
    except Exception:
        return response_text

    if isinstance(payload, dict):
        if payload.get('answer'):
            return payload.get('answer')
        if payload.get('response'):
            return payload.get('response')
        explanation = payload.get('explanation')
        ui_execution = payload.get('ui_execution') or []
        expected = payload.get('expected_visual_result')
        if explanation or ui_execution or expected:
            lines = [str(explanation or '').strip(), '', 'Do This In TouchDesigner']
            for index, item in enumerate(ui_execution, start=1):
                if isinstance(item, dict) and item.get('step'):
                    lines.append(f"{index}. {item['step']}")
                    if item.get('why'):
                        lines.append(f"   Why: {item['why']}")
            if expected:
                lines.extend(['', f'Expected visual result: {expected}'])
            return '\n'.join(line for line in lines if line).strip()
        return response_text

    return response_text


def onResponse(dat, response, info):
    target = op('response_in')
    if target is not None:
        target.text = _extract_answer(response)
    return
