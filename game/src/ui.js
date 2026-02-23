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

export function renderBreakRoom(state) {
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
    button.disabled = true;

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
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Assembly line is empty.';
    line.appendChild(placeholder);
  }

  container.appendChild(line);
}

export function renderClipboard(state) {
  const container = getElementOrThrow('clipboard-content');
  container.innerHTML = '';

  const report = document.createElement('p');
  report.className = 'placeholder';
  report.textContent = `Status Report: ${state.clipboard.lastReport || '(nothing yet)'}`;

  container.appendChild(report);
}

export function renderAll(state) {
  renderNarration(state);
  renderBreakRoom(state);
  renderFactoryFloor(state);
  renderClipboard(state);
}
