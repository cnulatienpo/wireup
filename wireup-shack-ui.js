import { loadAllJSON, store } from './jsonStore.js';
import { updateContextFromOperator, currentContext } from './contextEngine.js';
import { mapContextForPanel } from './contextMapper.js';
import { renderContextPanel } from './contextRenderer.js';

const CONTEXT_KEYS = ['tops', 'chops', 'sops'];
let backendHealthy = null;

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

  try {
    const payload = JSON.stringify({
      question,
      context: currentContext,
    });

    const endpoints = ['/api/rayray', '/rayray'];
    let lastError = null;

    for (const endpoint of endpoints) {
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
        // If this route is missing, try the next endpoint before reporting.
        if (response.status === 404) {
          lastError = `Endpoint ${endpoint} returned 404.`;
          continue;
        }

        const bodyPreview = raw ? ` ${raw.slice(0, 180)}` : '';
        appendMessage(output, 'Ray Ray', `Server error ${response.status}.${bodyPreview}`.trim());
        return;
      }

      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (_err) {
          // Accept plain-text responses to avoid hard failure on bad content-type.
          data = contentType.includes('application/json') ? null : { answer: raw };
        }
      }

      if (!data) {
        appendMessage(
          output,
          'Ray Ray',
          'Server returned an empty response. This usually means the site is running as static hosting instead of the Node API service.',
        );
        return;
      }

      const answer = data.answer || data.responseText || 'No response received.';
      appendMessage(output, 'Ray Ray', answer);
      return;
    }

    appendMessage(
      output,
      'Ray Ray',
      `Chat backend not reachable. ${lastError || 'No working endpoint found.'}`,
    );
  } catch (error) {
    appendMessage(output, 'Ray Ray', `Unable to connect: ${error.message}`);
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
        'Backend API is offline on this deploy (/healthz failed). Chat needs Render Web Service mode with start command: npm run shack.',
      );
    }
  } catch (_error) {
    backendHealthy = false;
    appendMessage(
      output,
      'Ray Ray',
      'Backend API is unreachable on this deploy. Chat needs Render Web Service mode with start command: npm run shack.',
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
