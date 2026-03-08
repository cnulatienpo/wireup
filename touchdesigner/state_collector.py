"""TouchDesigner Script DAT: state_collector

Collects a lightweight graph snapshot around the currently selected operator for Ray Ray.
"""

MAX_GRAPH_NODES = 10
GRAPH_DEPTH = 2


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
    """Collect a basic subset of parameters."""
    params = {}
    if node is None:
        return params

    try:
        pars = list(node.pars())
    except Exception:
        return params

    count = 0
    for par in pars:
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


def _op_type(op):
    try:
        op_type = getattr(op, 'OPType', None)
        if op_type:
            return str(op_type)
    except Exception:
        pass

    try:
        return str(getattr(op, 'type', ''))
    except Exception:
        return ''


def _op_family(op):
    """Return coarse TouchDesigner family when possible (TOP/CHOP/SOP/DAT/MAT/POP)."""
    families = {'TOP', 'CHOP', 'SOP', 'DAT', 'MAT', 'POP'}

    for attr in ('family', 'familyName'):
        try:
            value = getattr(op, attr)
            if value is None:
                continue
            text = str(value).upper()
            if text in families:
                return text
        except Exception:
            pass

    op_type = _op_type(op).upper()
    for fam in families:
        if op_type.endswith(' %s' % fam) or (' %s ' % fam) in op_type:
            return fam

    return None


def _node_info(op):
    return {
        'name': getattr(op, 'name', None),
        'type': _op_type(op),
        'path': getattr(op, 'path', None),
        'family': _op_family(op),
    }


def _walk_neighbors(start_node, direction='upstream', max_depth=GRAPH_DEPTH, max_nodes=MAX_GRAPH_NODES):
    """Breadth-first walk to gather a small upstream/downstream neighborhood."""
    if start_node is None:
        return []

    visited = set()
    queue = [(start_node, 0)]
    results = []

    while queue and len(results) < max_nodes:
        current, depth = queue.pop(0)
        if current is None or depth >= max_depth:
            continue

        try:
            neighbors = current.inputs if direction == 'upstream' else current.outputs
        except Exception:
            neighbors = []

        for neighbor in neighbors:
            if neighbor is None:
                continue

            key = getattr(neighbor, 'path', None) or id(neighbor)
            if key in visited:
                continue
            visited.add(key)

            entry = _node_info(neighbor)
            entry['depth'] = depth + 1
            results.append(entry)

            if len(results) >= max_nodes:
                break

            queue.append((neighbor, depth + 1))

    return results




def _is_node_cooking(node):
    if node is None:
        return None

    for attr in ('isCooking', 'cooking', 'cook'):
        try:
            value = getattr(node, attr)
            if callable(value):
                value = value()
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return bool(value)
        except Exception:
            pass

    return None


def _current_selected_node():
    """Return currently selected OP from active network pane if possible."""
    try:
        pane = ui.panes.current
        if pane is not None and getattr(pane, 'owner', None) is not None:
            child = pane.owner.currentChild
            if child is not None:
                return child
    except Exception:
        pass

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
    """Primary API for ask_button_callback."""
    node = _current_selected_node()

    if node is None:
        return {
            'selectedNode': None,
            'nodeType': None,
            'network': None,
            'nodeFamily': None,
            'parameters': {},
            'upstream': [],
            'downstream': [],
            'graphLimits': {
                'maxDepth': GRAPH_DEPTH,
                'maxNodes': MAX_GRAPH_NODES,
            },
            'isCooking': None,
            'warnings': [],
            'errors': [],
        }

    messages = _collect_messages(node)
    upstream_budget = max(0, MAX_GRAPH_NODES // 2)
    upstream = _walk_neighbors(node, direction='upstream', max_depth=GRAPH_DEPTH, max_nodes=upstream_budget)
    downstream_budget = max(0, MAX_GRAPH_NODES - len(upstream))
    downstream = _walk_neighbors(node, direction='downstream', max_depth=GRAPH_DEPTH, max_nodes=downstream_budget)

    return {
        'selectedNode': getattr(node, 'name', None),
        'nodeType': _op_type(node),
        'network': getattr(getattr(node, 'parent', lambda: None)(), 'path', None),
        'nodePath': getattr(node, 'path', None),
        'nodeFamily': _op_family(node),
        'parameters': _collect_parameters(node),
        'upstream': upstream,
        'downstream': downstream,
        'graphLimits': {
            'maxDepth': GRAPH_DEPTH,
            'maxNodes': MAX_GRAPH_NODES,
            'capturedNodes': len(upstream) + len(downstream),
        },
        'isCooking': _is_node_cooking(node),
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
