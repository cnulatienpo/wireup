# Wireup Engineer — TouchDesigner Network Probe
# Collects patch context and sends JSON to the Wireup Outpost runtime

import json
import urllib.request

WIREUP_ENDPOINT = "http://127.0.0.1:3000/rayray"


def get_selected_nodes():
    nodes = []
    for n in ops("*"):
        try:
            if n.selected:
                nodes.append(n)
        except:
            pass
    return nodes


def serialize_parameters(node):
    params = {}
    try:
        for p in node.pars():
            try:
                params[p.name] = p.eval()
            except:
                params[p.name] = str(p)
    except:
        pass
    return params


def serialize_node(node):

    data = {
        "node_name": node.name,
        "path": node.path,
        "operator_type": str(node.OPType),
        "family": node.family if hasattr(node, "family") else None,
        "parent_path": node.parent().path if node.parent() else None,
        "selected": node.selected if hasattr(node, "selected") else False,
        "input_count": len(node.inputs),
        "output_count": len(node.outputs),
        "parameters": serialize_parameters(node)
    }

    return data


def get_upstream(node):
    upstream = []
    try:
        for i in node.inputs:
            if i:
                upstream.append(i)
    except:
        pass
    return upstream


def get_downstream(node):
    downstream = []
    try:
        for o in node.outputs:
            if o:
                downstream.append(o)
    except:
        pass
    return downstream


def detect_cycles(nodes):

    visited = set()
    stack = set()
    cycles = []

    def visit(node):
        if node in stack:
            cycles.append(node.path)
            return

        if node in visited:
            return

        visited.add(node)
        stack.add(node)

        for out in get_downstream(node):
            visit(out)

        stack.remove(node)

    for n in nodes:
        visit(n)

    return cycles


def detect_parameter_anomalies(nodes):

    anomalies = []

    for node in nodes:
        try:
            for p in node.pars():
                try:
                    val = p.eval()

                    if isinstance(val, (int, float)):
                        if abs(val) > 100000:
                            anomalies.append({
                                "node": node.path,
                                "parameter": p.name,
                                "value": val,
                                "issue": "extreme_value"
                            })
                except:
                    pass
        except:
            pass

    return anomalies


def find_unconnected(nodes):

    issues = []

    for node in nodes:
        if len(node.inputs) == 0 and len(node.outputs) == 0:
            issues.append({
                "node": node.path,
                "issue": "unconnected_node"
            })

    return issues


def detect_large_neighborhood(nodes):

    if len(nodes) > 25:
        return {
            "issue": "large_neighborhood",
            "node_count": len(nodes)
        }

    return None


def build_patch_snapshot():

    selected_nodes = get_selected_nodes()

    if not selected_nodes:
        return {"error": "no_nodes_selected"}

    neighborhood = set()

    for n in selected_nodes:
        neighborhood.add(n)

        for up in get_upstream(n):
            neighborhood.add(up)

        for down in get_downstream(n):
            neighborhood.add(down)

    nodes = list(neighborhood)

    snapshot = {
        "selected_nodes": [serialize_node(n) for n in selected_nodes],
        "neighborhood_nodes": [serialize_node(n) for n in nodes],
        "connections": [],
        "major_operator_families": set(),
        "cycles": detect_cycles(nodes),
        "parameter_anomalies": detect_parameter_anomalies(nodes),
        "unconnected_nodes": find_unconnected(nodes),
        "large_neighborhood": detect_large_neighborhood(nodes)
    }

    for node in nodes:

        snapshot["major_operator_families"].add(
            node.family if hasattr(node, "family") else "unknown"
        )

        try:
            for o in node.outputs:
                if o:
                    snapshot["connections"].append({
                        "from": node.path,
                        "to": o.path
                    })
        except:
            pass

    snapshot["major_operator_families"] = list(snapshot["major_operator_families"])

    return snapshot


def send_snapshot():

    snapshot = build_patch_snapshot()

    payload = json.dumps(snapshot).encode("utf-8")

    req = urllib.request.Request(
        WIREUP_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        response = urllib.request.urlopen(req)
        result = response.read().decode()
        print("Wireup response:", result)
    except Exception as e:
        print("Wireup connection failed:", e)
