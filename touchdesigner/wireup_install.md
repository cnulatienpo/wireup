# wireup.tox installation

1. **Drag `wireup.tox` into your TouchDesigner project** to create the `wireup` component.
2. **Connect to the Ray Ray server** by confirming `request_sender` points to:
   - `POST http://localhost:3000/rayray`
3. **Wire callbacks and scripts** inside the component:
   - `state_collector` DAT source: `state_collector.py`
   - `ask_button` callback DAT source: `ask_button_callback.py`
   - `explain_patch_button` callback DAT source: `explain_patch_button_callback.py`
   - `response_handler` DAT source: `response_handler.py`
4. **Add an Explain Patch button** named `explain_patch_button` with label **Explain Patch**.
5. **Use the UI**:
   - Type a question into `question_field` and press `ask_button` for regular tutoring.
   - Press `explain_patch_button` to request a beginner-friendly signal flow narration.
6. **Receive explanation** in `response_view`, including selected node summary + Ray Ray answer.

## Notes

- If no node is selected, the component still sends your question and Ray Ray responds using question-only context.
- Explain Patch uses `mode: "explain_patch"` and returns a short narration plus flow warnings when detected.
