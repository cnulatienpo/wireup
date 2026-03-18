"""TouchDesigner helpers for the Wireup Outpost bridge.

Drop this code into a Text DAT inside the imported .tox, then call:
    op('touchdesigner_outpost_bridge').module.send_query('your question')
"""

import json

OUTPOST_QUERY_URL = 'http://127.0.0.1:3000/outpost/query'
OUTPOST_SESSION_ID = 'outpost'


def _callbacks_dat_name():
    return 'webclient_callbacks'


def _response_dat_name():
    return 'response_in'


def _webclient():
    client = op('webclient1')
    if client is None:
        raise RuntimeError('Expected a Web Client DAT named webclient1 inside wireup_outpost_bridge.')
    return client


def send_query(query, session_id=OUTPOST_SESSION_ID, url=OUTPOST_QUERY_URL):
    if not isinstance(query, str) or not query.strip():
        raise ValueError('query must be a non-empty string')

    payload = {
        'query': query,
        'session_id': session_id,
    }

    return _webclient().request(
        url=url,
        method='POST',
        data=json.dumps(payload),
        headers={'Content-Type': 'application/json'},
    )


def install_notes():
    return {
        'component_name': 'wireup_outpost_bridge',
        'endpoint': OUTPOST_QUERY_URL,
        'callbacks_dat': _callbacks_dat_name(),
        'response_dat': _response_dat_name(),
        'session_namespace': 'wireup-outpost:*',
    }
