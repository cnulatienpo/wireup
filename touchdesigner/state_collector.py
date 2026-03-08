"""TouchDesigner Script DAT: state_collector

Collects a lightweight snapshot of the currently selected operator for Ray Ray.
"""


def _safe_eval_par(par):
    """Best-effort conversion of parameter values to JSON-safe Python values."""
    try:
        value = par.eval()
    except Exception:
        try:
            value = par.val
        except Exception:
            return None

    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    # TouchDesigner types can include vectors / tuples; coerce when possible.
    try:
        return list(value)
    except Exception:
        return str(value)


def _collect_parameters(node, limit=24):
    """Collect a basic subset of custom/page parameters."""
    params = {}
    if node is None:
        return params

    try:
        pars = list(node.pars())
    except Exception:
        return params

    count = 0
    for par in pars:
        # Skip read-only/time-varying metadata-ish entries when possible.
        name = getattr(par, 'name', None)
        if not name:
            continue

        params[name] = _safe_eval_par(par)
        count += 1
        if count >= limit:
            break

    return params


def _collect_messages(node):
    """Collect warnings / errors if available on the operator."""
    result = {
        'warnings': [],
        'errors': [],
    }

    if node is None:
        return result

    # TouchDesigner may expose errors/warnings via attributes/properties that vary by OP type/version.
    for attr_name, key in (('warnings', 'warnings'), ('warning', 'warnings'), ('errors', 'errors'), ('error', 'errors')):
        try:
            attr = getattr(node, attr_name)
            if attr:
                if isinstance(attr, (list, tuple)):
                    result[key].extend([str(x) for x in attr if x])
                else:
                    result[key].append(str(attr))
        except Exception:
            pass

    return result


def _current_selected_node():
    """Return the first currently selected OP, if any."""
    try:
        selected = list(ui.panes.current.owner.selectedChildren)
        if selected:
            return selected[0]
    except Exception:
        pass

    try:
        selected = list(ui.selectedOPs)
        if selected:
            return selected[0]
    except Exception:
        pass

    return None


def collect_state():
    """Primary API for ask_button_callback.

    Returns:
        dict: JSON-serializable state payload.
    """
    node = _current_selected_node()

    if node is None:
        return {
            'selectedNode': None,
            'nodeType': None,
            'network': None,
            'inputs': [],
            'parameters': {},
            'warnings': [],
            'errors': [],
        }

    input_names = []
    try:
        for input_op in node.inputs:
            if input_op is not None:
                input_names.append(input_op.name)
    except Exception:
        pass

    messages = _collect_messages(node)

    return {
        'selectedNode': getattr(node, 'name', None),
        'nodeType': getattr(node, 'OPType', None) or str(getattr(node, 'type', '')),
        'network': getattr(getattr(node, 'parent', lambda: None)(), 'path', None),
        'inputs': input_names,
        'parameters': _collect_parameters(node),
        'warnings': messages['warnings'],
        'errors': messages['errors'],
    }


# Optional Script DAT entry point (useful when run directly in TD).
def onCook(scriptOp):
    state = collect_state()
    scriptOp.clear()
    scriptOp.appendRow(['key', 'value'])
    for key, value in state.items():
        scriptOp.appendRow([key, str(value)])
    return
