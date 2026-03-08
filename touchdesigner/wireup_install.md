# wireup.tox installation

1. **Drag `wireup.tox` into your TouchDesigner project** to create the `wireup` component.
2. **Connect to the Ray Ray server** by confirming `request_sender` points to:
   - `POST http://localhost:3000/rayray`
3. **Type a question** into `question_field` and press `ask_button`.
4. **Receive explanation** in `response_view`, including selected node summary + Ray Ray answer.

## Notes

- If no node is selected, the component still sends your question and Ray Ray responds using question-only context.
- Use `state_collector`, `ask_button_callback`, and `response_handler` scripts as the DAT sources inside the component before exporting `wireup.tox`.
