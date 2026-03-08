const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'rayrayConfig.json');
const DEFAULT_CONFIG = {
  provider: 'mock',
  model: 'rayray-mock',
  endpoint: 'http://localhost:11434/api/generate',
  temperature: 0.2,
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    throw new Error(`Unable to load rayrayConfig.json: ${error.message}`);
  }
}

function extractOperatorName(prompt = '') {
  const operatorLineMatch = String(prompt).match(/Operator:\s*(.+)/i);
  if (operatorLineMatch?.[1]) {
    return operatorLineMatch[1].trim();
  }

  const firstSentence = String(prompt).split(/[\n.?!]/)[0] || 'operator';
  return firstSentence.trim() || 'operator';
}

async function callOllama(prompt, config) {
  const endpoint = config.endpoint || DEFAULT_CONFIG.endpoint;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      options: {
        temperature: config.temperature,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.response?.trim() || 'I could not generate an answer right now.';
}

async function callOpenAI(prompt, config) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const endpoint = config.endpoint || 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || 'I could not generate an answer right now.';
}

function callMock(prompt) {
  const operatorName = extractOperatorName(prompt);
  return `${operatorName} is being explained in mock mode. This answer is generated without a live LLM provider, so it focuses on giving a lightweight orientation based on the operator name only.`;
}

async function generateAnswer(prompt) {
  const config = loadConfig();

  if (config.provider === 'ollama') {
    return callOllama(prompt, config);
  }

  if (config.provider === 'openai') {
    return callOpenAI(prompt, config);
  }

  if (config.provider === 'mock') {
    return callMock(prompt);
  }

  throw new Error(`Unsupported provider \"${config.provider}\" in rayrayConfig.json`);
}

module.exports = {
  generateAnswer,
};
