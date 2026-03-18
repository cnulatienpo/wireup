import { loadAllJSON, store } from './jsonStore.js';
import { updateContextFromOperator, currentContext } from './contextEngine.js';
import { mapContextForPanel } from './contextMapper.js';
import { renderContextPanel } from './contextRenderer.js';


const CONTEXT_KEYS = ['tops', 'chops', 'sops'];
const LLM_FALLBACK_MARKER = 'LLM not configured. Ray Ray running in rule-only mode.';
const TOKEN_BLACKLIST = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'is', 'are', 'what', 'how', 'why']);

function appendMessage(panel, speaker, text) {
  const line = document.createElement('div');
  line.className = 'rayray-line';
  line.textContent = `${speaker}: ${text}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function detectOperatorFromQuestion(question) {
  const normalizedQuestion = question.toLowerCase();

  for (const key of CONTEXT_KEYS) {
    for (const operatorName of Object.keys(store[key] || {})) {
      if (normalizedQuestion.includes(operatorName.toLowerCase())) {
        return operatorName;
      }
    }
  }

  return null;
}

function questionTokens(question) {
  return String(question)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TOKEN_BLACKLIST.has(token));
}

function buildOperatorCandidates(tokens, question) {
  const q = question.toLowerCase();
  const candidates = [];

  for (const family of CONTEXT_KEYS) {
    for (const [name, data] of Object.entries(store[family] || {})) {
      const haystack = [
        name,
        data.layer_1_identity,
        data.layer_2_signal_story,
        ...(Array.isArray(data.layer_3_failure_modes) ? data.layer_3_failure_modes : []),
        ...(Array.isArray(data.layer_4_minimal_recipes) ? data.layer_4_minimal_recipes : []),
        ...(Array.isArray(data.layer_5_reasoning_lens) ? data.layer_5_reasoning_lens : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      let score = q.includes(name.toLowerCase()) ? 6 : 0;
      for (const token of tokens) {
        if (haystack.includes(token)) {
          score += 1;
        }
      }

      if (score > 0) {
        candidates.push({ family, name, score });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
}

function getExplainMode() {
  const eli5Toggle = document.getElementById('explain-eli5-toggle');
  return eli5Toggle?.checked ? 'dual' : 'td';
}

async function localRuleAnswer(question, operatorName = null) {
  const tokens = questionTokens(question);
  const fromQuestion = operatorName || detectOperatorFromQuestion(question);
  const candidates = fromQuestion
    ? [{ name: fromQuestion, score: 99 }]
    : buildOperatorCandidates(tokens, question);
  const top = candidates[0] || null;

  if (top?.name) {
    const context = await updateContextFromOperator(top.name);
    if (context) {
      renderContextPanel(await mapContextForPanel());

      const name = context.operator;
      const family = context.family ? context.family.toUpperCase() : null;
      const identity = context.identity ? context.identity.replace(/\.$/, '') : '';
      const signalStory = context.signalStory ? context.signalStory.split('.')[0].trim() : '';

      let text = family ? `The ${name} (${family})` : `The ${name}`;
      if (identity) {
        text += ` ${identity.charAt(0).toLowerCase() + identity.slice(1)}`;
      }
      if (signalStory) {
        text += ` — like ${signalStory.charAt(0).toLowerCase() + signalStory.slice(1)}.`;
      } else {
        text += '.';
      }

      if (getExplainMode() === 'dual') {
        let eli5 = `Think of the ${name} as`;
        if (signalStory) {
          eli5 += ` ${signalStory.charAt(0).toLowerCase() + signalStory.slice(1)}.`;
        } else if (identity) {
          eli5 += ` a tool that ${identity.charAt(0).toLowerCase() + identity.slice(1)}.`;
        } else {
          eli5 += ` a useful operator in TouchDesigner.`;
        }
        text += ` ${eli5}`;
      }

      return {
        hasAnswer: true,
        text,
        matchedOperator: top.name,
      };
    }
  }

  // No operator match — suggest closest names
  const allOperators = CONTEXT_KEYS.flatMap((family) => Object.keys(store[family] || {}));
  const suggested = allOperators
    .map((name) => {
      const lower = name.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (lower.includes(token)) score += 1;
      }
      return { name, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.name);

  if (suggested.length) {
    return {
      hasAnswer: true,
      text: `Not sure which operator you mean — closest matches are ${suggested.join(', ')}. Try asking about one of those.`,
      matchedOperator: null,
    };
  }

  return {
    hasAnswer: true,
    text: `Not sure what you're looking for. Try naming an operator directly, like Blur TOP, Math CHOP, or Null SOP.`,
    matchedOperator: null,
  };
}

function shouldEscalateToCloud(localResult) {
  if (!localResult?.hasAnswer) {
    return true;
  }

  // Keep local JSON as the default mode unless explicitly forced.
  return Boolean(window?.RAYRAY_FORCE_CLOUD);
}

function isOutpostSession() {
  return Boolean(document.getElementById('outpost-root'));
}

function getOutpostSessionConfig() {
  const root = document.getElementById('outpost-root');
  if (!root) {
    return null;
  }

  const sessionId = root.dataset.sessionId || '';
  const endpoint = root.dataset.queryEndpoint || '/query';

  return {
    sessionId,
    endpoint,
  };
}

async function sendQuestion({ input, output }) {
  try {
    const question = input.value.trim();
    if (!question) return;

    input.value = '';

    const maybeOperator = detectOperatorFromQuestion(question);
    const localResult = await localRuleAnswer(question, maybeOperator);

    if (localResult.matchedOperator) {
      await updateContextFromOperator(localResult.matchedOperator);
      renderContextPanel(await mapContextForPanel());
    }

    // Local JSON knowledge is the default path. Only use cloud/API when needed.
    if (!shouldEscalateToCloud(localResult)) {
      appendMessage(output, 'Ray Ray', localResult.text);
      return;
    }

    const outpostConfig = getOutpostSessionConfig();
    const payload = JSON.stringify(
      outpostConfig
        ? {
            query: question,
            session_id: outpostConfig.sessionId,
          }
        : {
            question,
            context: currentContext,
            explainMode: getExplainMode(),
          }
    );

    const endpoints = outpostConfig ? [outpostConfig.endpoint, '/outpost/query', '/api/outpost/query'] : ['/api/rayray', '/rayray'];
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
        });

        const raw = await response.text();
        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        if (!response.ok) {
          if (response.status === 404) {
            lastError = `Endpoint ${endpoint} returned 404.`;
            continue;
          }

          const bodyPreview = raw ? ` ${raw.slice(0, 180)}` : '';
          lastError = `Server error ${response.status}.${bodyPreview}`.trim();
          continue;
        }

        let data = null;
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch (_err) {
            data = contentType.includes('application/json') ? null : { answer: raw };
          }
        }

        if (!data) {
          lastError = 'Server returned an empty response.';
          continue;
        }

        const answer = data.response || data.answer || data.responseText || 'No response received.';
        if (answer.includes(LLM_FALLBACK_MARKER)) {
          appendMessage(output, 'Ray Ray', localResult.text);
        } else {
          appendMessage(output, 'Ray Ray', answer);
        }
        return;
      } catch (error) {
        lastError = error?.message || String(error);
      }
    }

    appendMessage(output, 'Ray Ray', localResult.text);
  } catch (error) {
    console.error('Ray Ray sendQuestion failed:', error);
    appendMessage(output, 'Ray Ray', `Local processing error: ${error?.message || String(error)}`);
  }
}

function initRestartButton() {
  const restartButton = document.getElementById('restart-button');
  if (!restartButton) {
    return;
  }

  restartButton.disabled = true;
  restartButton.title = 'Restart temporarily disabled';
}

async function initWireupOutpost() {
  const output = document.getElementById('rayray-output');
  const input = document.getElementById('rayray-input');
  const sendButton = document.getElementById('rayray-send');

  if (!output || !input || !sendButton) {
    return;
  }

  sendButton.addEventListener('click', () => sendQuestion({ input, output }));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion({ input, output });
    }
  });

  initRestartButton();

  try {
    await loadAllJSON();
    renderContextPanel(await mapContextForPanel());
  } catch (error) {
    appendMessage(output, 'Ray Ray', `Context load failed, but chat is still available: ${error.message}`);
  }
}

initWireupOutpost();
