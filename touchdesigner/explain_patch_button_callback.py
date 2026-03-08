"""TouchDesigner callback DAT for explain_patch_button.

Collects current graph snapshot and requests a beginner-friendly signal flow explanation.
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


def _collect_state():
    collector = parent().op('state_collector')
    if collector is None:
        return {
            'selectedNode': None,
            'nodeType': None,
            'network': None,
            'upstream': [],
            'downstream': [],
            'parameters': {},
            'isCooking': None,
        }

    try:
        mod_obj = collector.module
        return mod_obj.collect_state()
    except Exception:
        return {
            'selectedNode': None,
            'nodeType': None,
            'network': None,
            'upstream': [],
            'downstream': [],
            'parameters': {},
            'isCooking': None,
        }


def _send_web_request(payload):
    web = parent().op('request_sender')
    if web is None:
        _set_response_view('Error: request_sender Web Client DAT not found.')
        return

    body = json.dumps(payload)

    for par_name in ('requestbody', 'senddata', 'postdata', 'data'):
        try:
            getattr(web.par, par_name).val = body
            break
        except Exception:
            pass

    for pulse_name in ('sendpulse', 'send', 'requestpulse', 'pulse'):
        try:
            getattr(web.par, pulse_name).pulse()
            return
        except Exception:
            pass

    _set_response_view('Error: could not trigger request_sender send pulse.')


def onOffToOn(panelValue):
    state = _collect_state()
    payload = {
        'mode': 'explain_patch',
        'question': 'Explain this patch signal flow in simple terms.',
        'state': state,
    }

    _set_response_view('Ray Ray is explaining the patch signal flow...')
    _send_web_request(payload)
    return
