# Ray Ray LLM Setup

Ray Ray supports both DeepSeek and OpenAI through a shared adapter configured by `llmConfig.json`.

## 0) Create a local `.env` file (recommended)

Copy the template and fill in your key:

```bash
cp .env.example .env
```

`llmAdapter.js` now auto-loads `.env` using `dotenv`, so keys persist across terminal sessions.

## 1) Add a DeepSeek API key

You can set it in `.env`:

```env
DEEPSEEK_API_KEY="your-deepseek-api-key"
```

Or set it in your shell before starting the server:

```bash
export DEEPSEEK_API_KEY="your-deepseek-api-key"
```

Ray Ray reads this key automatically when `provider` is set to `deepseek`.

## 2) Switch providers in `llmConfig.json`

Use `llmConfig.json` in the repository root to choose the provider and model.

### DeepSeek example

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "max_tokens": 150,
  "temperature": 0.2
}
```

### OpenAI example

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "max_tokens": 150,
  "temperature": 0.2
}
```

If `provider` is `openai`, set:

In `.env`:

```env
OPENAI_API_KEY="your-openai-api-key"
```

Or in shell:

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

## 3) Start the server

```bash
npm run shack
```

## 4) Run Ray Ray without an LLM

If the selected provider API key is missing, Ray Ray does not crash. It returns:

`LLM not configured. Ray Ray running in rule-only mode.`

This lets the server keep running while you work without cloud API access.
