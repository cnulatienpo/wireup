# Wireup Outpost TouchDesigner bridge

This repo now exposes a dedicated TouchDesigner-friendly outpost endpoint at:

- `POST http://127.0.0.1:3000/outpost/query`
- `POST http://127.0.0.1:3000/query`

Those endpoints accept the payload shape TouchDesigner examples typically use:

```json
{
  "query": "how do i stitch clips together",
  "session_id": "outpost"
}
```

The server automatically namespaces bridge traffic as `wireup-outpost:<session_id>` so the TouchDesigner bridge stays isolated from any other Ray Ray clients.

## TouchDesigner setup

1. Open TouchDesigner.
2. Add a **Base COMP**.
3. Set it to **External .tox** and point it at `tox/wireup.tox`.
4. Rename the COMP to `wireup_outpost_bridge`.
5. Inside the COMP, add a **Web Client DAT** named `webclient1`.
6. Inside the COMP, add a **Text DAT** named `response_in`.
7. Inside the COMP, add a **Text DAT** named `touchdesigner_outpost_bridge` and paste in `tox/touchdesigner_outpost_bridge.py`.
8. Add a **Callbacks DAT** named `webclient_callbacks` and paste in `tox/webclient_callbacks.py`.
9. Assign `webclient_callbacks` to the Web Client DAT callbacks parameter.

## Test from the Textport

```python
op('touchdesigner_outpost_bridge').module.send_query('how do i stitch clips together')
```

The answer should appear in `response_in`.

## Isolation rules

- Use the outpost bridge endpoint only.
- Keep the TouchDesigner session id unique to outpost work.
- Do not share this Web Client DAT with any shack bridge.
