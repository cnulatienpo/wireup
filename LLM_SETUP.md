# Ray Ray LLM Setup

Ray Ray now uses a pluggable LLM adapter so you can switch providers by editing `rayrayConfig.json`.

## 1) Local mode (Ollama)

1. Start Ollama locally.
2. Pull a model (example):
   ```bash
   ollama pull llama3
   ```
3. Set `rayrayConfig.json`:
   ```json
   {
     "provider": "ollama",
     "model": "llama3",
     "endpoint": "http://localhost:11434/api/generate",
     "temperature": 0.2
   }
   ```
4. Start the Ray Ray server.

## 2) Cloud API mode (OpenAI-compatible)

1. Set your API key:
   ```bash
   export OPENAI_API_KEY="your-key"
   ```
2. Update `rayrayConfig.json`:
   ```json
   {
     "provider": "openai",
     "model": "gpt-4o-mini",
     "endpoint": "https://api.openai.com/v1/chat/completions",
     "temperature": 0.2
   }
   ```

Notes:
- `endpoint` supports OpenAI-compatible servers, so you can point this to other compatible APIs.
- `model` should match whatever that endpoint provides.

## 3) Mock mode (no LLM required)

Use this when you want Ray Ray to run even without local or cloud model access.

`rayrayConfig.json`:

```json
{
  "provider": "mock",
  "model": "rayray-mock",
  "endpoint": "http://localhost:11434/api/generate",
  "temperature": 0.2
}
```

In mock mode, Ray Ray returns a basic explanation derived from the detected operator name.

## Adapter entry point

The routing logic lives in `llmAdapter.js` and exports:

- `generateAnswer(prompt)`

`rayrayServer.js` now calls this adapter for model responses.
