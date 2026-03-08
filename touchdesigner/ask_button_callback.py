"""TouchDesigner callback DAT for ask_button.

Wires UI + state_collector + request_sender Web Client DAT.
"""

import json


def _get_panel_text(comp_name):
    comp = parent().op(comp_name)
    if comp is None:
        return ''

    # Try common panel field value attributes for Text Field COMPs.
    for attr in ('field', 'text', 'value'):
        try:
            val = getattr(comp.panel, attr)
            if val is not None:
                return str(val)
        except Exception:
            pass

    # Fallback to component text/par if available.
    for par_name in ('text', 'Text'):
        try:
            par = getattr(comp.par, par_name)
            return str(par.eval())
        except Exception:
            pass

    return ''


def _set_response_view(text):
    view = parent().op('response_view')
    if view is None:
        return

    # Works for Text TOP / Text COMP style parameter naming.
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


def _send_web_request(payload):
    web = parent().op('request_sender')
    if web is None:
        _set_response_view('Error: request_sender Web Client DAT not found.')
        return

    body = json.dumps(payload)

    # Best-effort configuration in case defaults were not saved in the .tox yet.
    try:
        web.par.requestmethod = 'POST'
    except Exception:
        pass

    try:
        web.par.url = 'http://localhost:3000/rayray'
    except Exception:
        pass

    # Web Client DAT parameter names can vary by version; try common options.
    wrote_body = False
    for par_name in ('requestbody', 'senddata', 'postdata', 'data'):
        try:
            getattr(web.par, par_name).val = body
            wrote_body = True
            break
        except Exception:
            pass

    # Content-Type header (if exposed).
    for par_name in ('headermode', 'header', 'headers'):
        try:
            par = getattr(web.par, par_name)
            _ = par  # only verifying access
        except Exception:
            continue

    # Trigger send / pulse.
    for pulse_name in ('sendpulse', 'send', 'requestpulse', 'pulse'):
        try:
            getattr(web.par, pulse_name).pulse()
            return
        except Exception:
            pass

    if not wrote_body:
        _set_response_view('Error: could not write request JSON to request_sender parameters.')
    else:
        _set_response_view('Error: could not trigger request_sender send pulse.')


def _collect_state():
    collector = parent().op('state_collector')
    if collector is None:
        return {
            'selectedNode': None,
            'nodeType': None,
            'network': None,
            'inputs': [],
            'parameters': {},
            'warnings': ['state_collector DAT not found'],
            'errors': [],
        }

    mod_obj = None
    try:
        mod_obj = collector.module
    except Exception:
        pass

    if mod_obj and hasattr(mod_obj, 'collect_state'):
        try:
            return mod_obj.collect_state()
        except Exception as exc:
            return {
                'selectedNode': None,
                'nodeType': None,
                'network': None,
                'inputs': [],
                'parameters': {},
                'warnings': [],
                'errors': [f'state_collector.collect_state failed: {exc}'],
            }

    return {
        'selectedNode': None,
        'nodeType': None,
        'network': None,
        'inputs': [],
        'parameters': {},
        'warnings': ['state_collector has no collect_state()'],
        'errors': [],
    }


def _render_waiting_state(question, state):
    lines = [
        f"Selected Node: {state.get('selectedNode')}",
        f"Operator Type: {state.get('nodeType')}",
        f"Question Input: {question}",
        'Ray Ray Response: (waiting for response...)',
    ]
    _set_response_view('\n'.join(lines))


def onOffToOn(panelValue):
    """Button callback: fires when ask_button transitions from off->on."""
    question = _get_panel_text('question_field').strip()
    state = _collect_state()

    payload = {
        'mode': 'qa',
        'question': question,
        'state': state,
    }

    _render_waiting_state(question, state)
    _send_web_request(payload)
    return
