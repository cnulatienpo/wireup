const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG_PATH = path.join(__dirname, 'llmConfig.json');
const DEFAULT_CONFIG = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  max_tokens: 150,
  temperature: 0.2,
};
const FALLBACK_MESSAGE = 'LLM not configured. Ray Ray running in rule-only mode.';

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'user', content: String(messages || '') }];
  }

  return messages;
}

async function postChatCompletion({ endpoint, apiKey, model, messages, temperature, maxTokens }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function callDeepSeek(messages, config) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return FALLBACK_MESSAGE;
  }

  const text = await postChatCompletion({
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKey,
    model: config.model,
    messages,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
  });

  return text || 'I could not generate an answer right now.';
}

async function callOpenAI(messages, config) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return FALLBACK_MESSAGE;
  }

  const text = await postChatCompletion({
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey,
    model: config.model,
    messages,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
  });

  return text || 'I could not generate an answer right now.';
}

async function generateRayRayResponse(messages) {
  const config = loadConfig();
  const normalizedMessages = normalizeMessages(messages);
  const provider = String(config.provider || 'deepseek').toLowerCase();

  if (provider === 'deepseek') {
    return callDeepSeek(normalizedMessages, config);
  }

  if (provider === 'openai') {
    return callOpenAI(normalizedMessages, config);
  }

  return FALLBACK_MESSAGE;
}

module.exports = {
  generateRayRayResponse,
};
