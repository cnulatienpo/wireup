"""TouchDesigner callback DAT for ask_button.

Wires UI + state_collector + request_sender Web Client DAT.
"""

import json
import os
import random

WAIT_PLACEHOLDER_ID = 'rayray-waiting'
TYPING_INTERVAL_MS = 400
LONG_WAIT_MS = 60_000
SAFETY_WAIT_MS = 120_000

_WAIT_PHRASES_CACHE = None


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


def _wait_phrases_path():
    try:
        base = project.folder
    except Exception:
        base = os.getcwd()

    return os.path.join(base, 'wait phrases.json')


def _load_wait_phrases():
    global _WAIT_PHRASES_CACHE

    if _WAIT_PHRASES_CACHE is not None:
        return _WAIT_PHRASES_CACHE

    try:
        with open(_wait_phrases_path(), 'r', encoding='utf-8') as handle:
            payload = json.load(handle)
    except Exception:
        _WAIT_PHRASES_CACHE = []
        return _WAIT_PHRASES_CACHE

    phrases = []

    if isinstance(payload, dict):
        direct_phrases = payload.get('phrases')
        if isinstance(direct_phrases, list):
            phrases.extend([str(item).strip() for item in direct_phrases if str(item).strip()])

        languages = payload.get('languages')
        if isinstance(languages, dict):
            for value in languages.values():
                if isinstance(value, list):
                    phrases.extend([str(item).strip() for item in value if str(item).strip()])

    _WAIT_PHRASES_CACHE = phrases
    return _WAIT_PHRASES_CACHE


def getRandomWaitPhrase():
    phrases = _load_wait_phrases()
    if not phrases:
        return 'just a moment...'

    return random.choice(phrases)


def _set_store(key, value):
    try:
        parent().store(key, value)
    except Exception:
        pass


def _get_store(key, default=None):
    try:
        return parent().fetch(key, default)
    except Exception:
        return default


def _cancel_run(key):
    run_obj = _get_store(key)
    if run_obj is None:
        return

    try:
        run_obj.kill()
    except Exception:
        pass

    _set_store(key, None)


def clear_waiting_timers():
    _cancel_run('rayray_typing_run')
    _cancel_run('rayray_long_wait_run')
    _cancel_run('rayray_safety_wait_run')


def _schedule(expr, delay_ms, key):
    clear_key_only = _get_store(key)
    if clear_key_only is not None:
        _cancel_run(key)

    try:
        run_obj = run(expr, delayMilliSeconds=delay_ms)
    except Exception:
        run_obj = None

    _set_store(key, run_obj)


def _render_waiting_state(question, state, message):
    lines = [
        f"Selected Node: {state.get('selectedNode')}",
        f"Operator Type: {state.get('nodeType')}",
        f"Question Input: {question}",
        f'Ray Ray Response [{WAIT_PLACEHOLDER_ID}]: {message}',
    ]
    _set_response_view('\n'.join(lines))


def _update_waiting_message(message):
    context = _get_store('rayray_wait_context') or {}
    question = context.get('question', '')
    state = context.get('state', {})

    if context.get('request_status') != 'pending':
        return

    context['message'] = message
    _set_store('rayray_wait_context', context)
    _render_waiting_state(question, state, message)


def _start_waiting(question, state):
    clear_waiting_timers()

    context = {
        'request_status': 'pending',
        'question': question,
        'state': state,
        'typing_index': 0,
        'message': '...',
    }
    _set_store('rayray_wait_context', context)
    _render_waiting_state(question, state, context['message'])

    _schedule("parent().op('ask_button_callback').module._on_typing_tick()", TYPING_INTERVAL_MS, 'rayray_typing_run')
    _schedule("parent().op('ask_button_callback').module._on_long_wait_timeout()", LONG_WAIT_MS, 'rayray_long_wait_run')
    _schedule("parent().op('ask_button_callback').module._on_safety_timeout()", SAFETY_WAIT_MS, 'rayray_safety_wait_run')


def _on_typing_tick():
    context = _get_store('rayray_wait_context') or {}
    if context.get('request_status') != 'pending':
        clear_waiting_timers()
        return

    dots = (context.get('typing_index', 0) % 3) + 1
    context['typing_index'] = dots
    context['message'] = '.' * dots
    _set_store('rayray_wait_context', context)

    _render_waiting_state(context.get('question', ''), context.get('state', {}), context['message'])
    _schedule("parent().op('ask_button_callback').module._on_typing_tick()", TYPING_INTERVAL_MS, 'rayray_typing_run')


def _on_long_wait_timeout():
    context = _get_store('rayray_wait_context') or {}
    if context.get('request_status') != 'pending':
        return

    _cancel_run('rayray_typing_run')
    _update_waiting_message(getRandomWaitPhrase())


def _on_safety_timeout():
    context = _get_store('rayray_wait_context') or {}
    if context.get('request_status') != 'pending':
        return

    _update_waiting_message('Ray Ray is still working on this...')


def mark_response_received():
    context = _get_store('rayray_wait_context') or {}
    context['request_status'] = 'completed'
    _set_store('rayray_wait_context', context)
    clear_waiting_timers()


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


def onOffToOn(panelValue):
    """Button callback: fires when ask_button transitions from off->on."""
    question = _get_panel_text('question_field').strip()
    state = _collect_state()

    payload = {
        'mode': 'qa',
        'question': question,
        'state': state,
    }

    _start_waiting(question, state)
    _send_web_request(payload)
    return
