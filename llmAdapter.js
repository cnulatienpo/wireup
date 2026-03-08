const fs = require('fs');
const path = require('path');

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

function getProviderSettings(provider) {
  if (provider === 'deepseek') {
    return {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: process.env.DEEPSEEK_API_KEY,
    };
  }

  if (provider === 'openai') {
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  return null;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [{ role: 'user', content: String(messages || '') }];
  }

  if (!messages.length) {
    return [{ role: 'user', content: '' }];
  }

  return messages;
}

async function requestChatCompletion(messages, config, providerSettings) {
  const response = await fetch(providerSettings.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerSettings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function generateRayRayResponse(messages) {
  const config = loadConfig();
  const provider = String(config.provider || '').toLowerCase();
  const providerSettings = getProviderSettings(provider);

  if (!providerSettings || !providerSettings.apiKey) {
    return FALLBACK_MESSAGE;
  }

  const normalizedMessages = normalizeMessages(messages);
  const text = await requestChatCompletion(normalizedMessages, config, providerSettings);

  return text || 'I could not generate an answer right now.';
}

async function generateAnswer(prompt) {
  return generateRayRayResponse([{ role: 'user', content: prompt }]);
}

module.exports = {
  generateRayRayResponse,
  generateAnswer,
};
