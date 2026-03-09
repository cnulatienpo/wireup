import { loadAllJSON, store } from './jsonStore.js';
import { updateContextFromOperator, currentContext } from './contextEngine.js';
import { mapContextForPanel } from './contextMapper.js';
import { renderContextPanel } from './contextRenderer.js';

const CONTEXT_KEYS = ['tops', 'chops', 'sops'];

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
    const response = await fetch('/api/rayray', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        context: currentContext,
      }),
    });

    const data = await response.json();
    const answer = data.answer || data.responseText || 'No response received.';
    appendMessage(output, 'Ray Ray', answer);
  } catch (error) {
    appendMessage(output, 'Ray Ray', `Unable to connect: ${error.message}`);
  }
}

function hydrateSidePanels() {
  const leftPanel = document.getElementById('left-panel');
  const lowerLeftPanel = document.getElementById('lower-left-panel');

  if (leftPanel) {
    leftPanel.textContent = [
      'WIREUP OUTPOST',
      '',
      'Ask about a TOP/CHOP/SOP node to load context.',
      'Try:',
      '- movie file in',
      '- level top',
      '- edge detect',
      '',
      'Enter = send',
      'Shift+Enter = newline',
    ].join('\n');
  }

  if (lowerLeftPanel) {
    lowerLeftPanel.textContent = [
      'STATUS',
      '',
      'Ray Ray connected',
      'Context panel active',
      'Outpost layout online',
    ].join('\n');
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

  await loadAllJSON();
  renderContextPanel(mapContextForPanel());
  hydrateSidePanels();
  initRestartButton();

  sendButton.addEventListener('click', () => sendQuestion({ input, output }));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion({ input, output });
    }
  });
}

initWireupOutpost();
