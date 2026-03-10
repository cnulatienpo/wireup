import { loadAllJSON, store } from './jsonStore.js';
import { updateContextFromOperator, currentContext } from './contextEngine.js';
import { mapContextForPanel } from './contextMapper.js';
import { renderContextPanel } from './contextRenderer.js';

const CONTEXT_KEYS = ['tops', 'chops', 'sops'];
let backendHealthy = null;
const LLM_FALLBACK_MARKER = 'LLM not configured. Ray Ray running in rule-only mode.';

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

function localRuleAnswer(question, operatorName = null) {
  const fromQuestion = operatorName || detectOperatorFromQuestion(question);
  const fallbackHint = 'I can answer directly from local JSON if you include an operator name (example: Blur TOP, Null CHOP, Sphere SOP).';

  if (!fromQuestion) {
    return fallbackHint;
  }

  const context = updateContextFromOperator(fromQuestion);
  if (!context) {
    return `${fallbackHint} I could not find ${fromQuestion} in the loaded local operator files.`;
  }

  renderContextPanel(mapContextForPanel());

  const identity = context.identity || `${context.operator} is in the ${context.family?.toUpperCase() || 'operator'} family.`;
  const signalBullets = toBulletList(context.signalStory, 2);
  const warnings = Array.isArray(context.failureModes) ? context.failureModes.slice(0, 2) : [];

  const lines = [
    `Local mode: ${context.operator} (${context.family?.toUpperCase() || 'operator'}).`,
    identity,
  ];

  if (signalBullets.length) {
    lines.push(`Signal flow: ${signalBullets.join(' ')}`);
  }

  if (warnings.length) {
    lines.push(`Watch out: ${warnings.join(' | ')}`);
  }

  lines.push('Cloud tutor is optional for this answer. I am using repository JSON knowledge.');
  return lines.join(' ');
}

async function sendQuestion({ input, output }) {
  const question = input.value.trim();
  if (!question) return;

  appendMessage(output, 'You', question);

  const maybeOperator = detectOperatorFromQuestion(question);
  if (maybeOperator) {
    updateContextFromOperator(maybeOperator);
    renderContextPanel(mapContextForPanel());
  }

  input.value = '';

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
        appendMessage(output, 'Ray Ray', localRuleAnswer(question, maybeOperator));
      } else {
        appendMessage(output, 'Ray Ray', answer);
      }
      return;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  appendMessage(output, 'Ray Ray', localRuleAnswer(question, maybeOperator));
  if (lastError) {
    appendMessage(output, 'Ray Ray', `Cloud/API unreachable (${lastError}). Stayed in local JSON mode.`);
  }
}

async function checkBackendHealth(output) {
  try {
    const res = await fetch('/healthz', { method: 'GET' });
    backendHealthy = res.ok;

    if (!backendHealthy) {
      appendMessage(
        output,
        'Ray Ray',
        'Cloud/API backend is offline on this deploy (/healthz failed). Local JSON tutor mode is still available.',
      );
    }
  } catch (_error) {
    backendHealthy = false;
    appendMessage(
      output,
      'Ray Ray',
      'Cloud/API backend is unreachable on this deploy. Local JSON tutor mode is still available.',
    );
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

  await checkBackendHealth(output);
}

initWireupOutpost();
