function getElementOrThrow(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

export function renderNarration(state) {
  const title = getElementOrThrow('narration-level-title');
  const lineText = getElementOrThrow('narration-line-text');
  const lineCount = getElementOrThrow('narration-line-count');
  const continueButton = getElementOrThrow('continue-button');
  const nextButton = getElementOrThrow('next-button');

  title.textContent = state.levelMeta.title || '—';

  const currentLine = state.narration.lines[state.narration.index];
  lineText.textContent = currentLine || '—';

  if (state.narration.mode === 'intro' || state.narration.mode === 'goals') {
    lineCount.textContent = `Line ${state.narration.index + 1} / ${state.narration.lines.length}`;
  } else {
    lineCount.textContent = '—';
  }

  continueButton.disabled = state.narration.mode === 'none';
  nextButton.disabled = state.narration.mode !== 'none';
}

export function renderBreakRoom(state, actions) {
  const container = getElementOrThrow('break-room-content');
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'worker-list';

  state.breakRoomTypes.forEach((worker) => {
    const card = document.createElement('article');
    card.className = 'worker-card';

    const heading = document.createElement('h3');
    heading.textContent = worker.displayName;

    const subtitle = document.createElement('p');
    subtitle.className = 'worker-subtitle';
    subtitle.textContent = worker.tdFamilyLabel;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Send to Line';
    button.disabled = state.narration.mode !== 'none';
    button.addEventListener('click', () => {
      actions.onSendToLine(worker.id);
    });

    card.append(heading, subtitle, button);
    list.appendChild(card);
  });

  container.appendChild(list);
}

export function renderFactoryFloor(state) {
  const container = getElementOrThrow('factory-floor-content');
  container.innerHTML = '';

  const line = document.createElement('div');
  line.className = 'assembly-line';

  if (state.lineNodes.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder empty-line-message';
    placeholder.textContent = 'Assembly line is empty.';
    line.appendChild(placeholder);
  } else {
    const chain = document.createElement('div');
    chain.className = 'line-chain';

    state.lineNodes.forEach((node, index) => {
      const box = document.createElement('div');
      box.className = 'line-node-box';
      box.textContent = node.label;
      chain.appendChild(box);

      if (index < state.connections.length) {
        const arrow = document.createElement('span');
        arrow.className = 'line-arrow';
        arrow.textContent = ' ---> ';
        chain.appendChild(arrow);
      }
    });

    line.appendChild(chain);
  }

  container.appendChild(line);
}

export function renderClipboard(state, actions) {
  const container = getElementOrThrow('clipboard-content');
  container.innerHTML = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Press Status';
  button.addEventListener('click', () => {
    actions.onPressStatus();
  });

  const report = document.createElement('pre');
  report.className = 'status-report';
  report.textContent = state.clipboard.lastReport || 'Status Report: (nothing yet)';

  container.append(button, report);
}

export function renderAll(state, actions) {
  renderNarration(state);
  renderBreakRoom(state, actions);
  renderFactoryFloor(state);
  renderClipboard(state, actions);
}
