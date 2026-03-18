#!/usr/bin/env python3
import json
import re
from urllib import request


payload = {
    "query": "how do i stitch clips together",
    "session_id": "outpost",
}

req = request.Request(
    "http://localhost:3000/query",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with request.urlopen(req, timeout=30) as res:  # nosec - local dry-run endpoint
    body = json.loads(res.read().decode("utf-8"))

print(json.dumps(body, indent=2))

response = str(body.get("response", ""))
assert "do this in touchdesigner" in response.lower(), "Expected a 'Do This In TouchDesigner' section."
assert "you should see" in response.lower(), "Expected guidance to include 'you should see'."
assert isinstance(body.get("ui_execution"), list) and len(body.get("ui_execution")) >= 3, "Expected at least 3 ui_execution steps."
assert body.get("explanation"), "Expected an explanation field."
assert body.get("expected_visual_result"), "Expected an expected_visual_result field."
