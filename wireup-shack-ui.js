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

function toBulletList(text, maxItems = 2) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  return text
    .split('.')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildGlossaryMatches(tokens, question) {
  const glossary = store.glossary || {};
  const q = question.toLowerCase();
  const matched = [];

  for (const [term, definition] of Object.entries(glossary)) {
    if (!definition || typeof definition !== 'string') {
      continue;
    }

    const termHit = q.includes(term.toLowerCase()) || tokens.some((token) => term.toLowerCase().includes(token));
    if (!termHit) {
      continue;
    }

    matched.push({ term, definition });
    if (matched.length >= 4) {
      break;
    }
  }

  return matched;
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

function localRuleAnswer(question, operatorName = null) {
  const tokens = questionTokens(question);
  const fromQuestion = operatorName || detectOperatorFromQuestion(question);
  const candidates = fromQuestion
    ? [{ name: fromQuestion, score: 99 }]
    : buildOperatorCandidates(tokens, question);
  const top = candidates[0] || null;

  const glossaryMatches = buildGlossaryMatches(tokens, question);
  const lines = [];

  if (top?.name) {
    const context = updateContextFromOperator(top.name);
    if (context) {
      renderContextPanel(mapContextForPanel());
      const identity = context.identity || `${context.operator} is in the ${context.family?.toUpperCase() || 'operator'} family.`;
      const signalBullets = toBulletList(context.signalStory, 2);
      const warnings = Array.isArray(context.failureModes) ? context.failureModes.slice(0, 2) : [];

      lines.push(`Local mode: ${context.operator} (${context.family?.toUpperCase() || 'operator'}).`);
      lines.push(identity);

      if (signalBullets.length) {
        lines.push(`Signal flow: ${signalBullets.join(' ')}`);
      }

      if (warnings.length) {
        lines.push(`Watch out: ${warnings.join(' | ')}`);
      }
    }
  }

  if (glossaryMatches.length) {
    const glossaryLine = glossaryMatches
      .map((entry) => `${entry.term}: ${entry.definition}`)
      .join(' | ');
    lines.push(`Glossary context: ${glossaryLine}`);
  }

  if (!lines.length) {
    return {
      hasAnswer: false,
      text: 'I could not find a confident local JSON match for that question.',
      matchedOperator: null,
    };
  }

  lines.push('Using local repository JSON first.');
  return {
    hasAnswer: true,
    text: lines.join(' '),
    matchedOperator: top?.name || null,
  };
}

function shouldEscalateToCloud(localResult) {
  return !localResult?.hasAnswer;
}

async function sendQuestion({ input, output }) {
  try {
    const question = input.value.trim();
    if (!question) return;

    appendMessage(output, 'You', question);
    input.value = '';

    const maybeOperator = detectOperatorFromQuestion(question);
    const localResult = localRuleAnswer(question, maybeOperator);

    if (localResult.matchedOperator) {
      updateContextFromOperator(localResult.matchedOperator);
      renderContextPanel(mapContextForPanel());
    }

    // Local JSON knowledge is the default path. Only use cloud/API when needed.
    if (!shouldEscalateToCloud(localResult)) {
      appendMessage(output, 'Ray Ray', localResult.text);
      return;
    }

    const payload = JSON.stringify({
      question,
      context: currentContext,
    });

    const endpoints = ['/api/rayray', '/rayray'];
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

        const answer = data.answer || data.responseText || 'No response received.';
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
    if (lastError) {
      appendMessage(output, 'Ray Ray', `Cloud/API unreachable (${lastError}). Stayed in local JSON mode.`);
    }
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

  restartButton.addEventListener('click', () => {
    sessionStorage.clear();
    localStorage.clear();
    window.location.reload();
  });
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
    renderContextPanel(mapContextForPanel());
    appendMessage(output, 'Ray Ray', 'Ready. Ask a TouchDesigner question.');
  } catch (error) {
    appendMessage(output, 'Ray Ray', `Context load failed, but chat is still available: ${error.message}`);
  }
}

initWireupOutpost();
