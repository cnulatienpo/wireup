function getElementOrThrow(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

function getInventoryItemById(state, itemId) {
  return state.inventory.find((item) => item.id === itemId) || null;
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

  const supplySection = document.createElement('section');
  supplySection.className = 'subpanel';

  const supplyHeading = document.createElement('h3');
  supplyHeading.className = 'subpanel-heading';
  supplyHeading.textContent = 'Supply Room';

  const supplyList = document.createElement('ul');
  supplyList.className = 'inventory-list';

  state.inventory.forEach((item) => {
    const row = document.createElement('li');
    row.className = 'inventory-item';

    const label = document.createElement('span');
    label.textContent = item.label;

    const kind = document.createElement('span');
    kind.className = 'inventory-kind';
    kind.textContent = item.kind;

    row.append(label, kind);
    supplyList.appendChild(row);
  });

  supplySection.append(supplyHeading, supplyList);

  const workersSection = document.createElement('section');
  workersSection.className = 'subpanel';

  const workersHeading = document.createElement('h3');
  workersHeading.className = 'subpanel-heading';
  workersHeading.textContent = 'Workers';

  const workerList = document.createElement('div');
  workerList.className = 'worker-list';

  state.breakRoomTypes.forEach((worker) => {
    const card = document.createElement('article');
    card.className = 'worker-card';

    const heading = document.createElement('h4');
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
    workerList.appendChild(card);
  });

  workersSection.append(workersHeading, workerList);

  container.append(supplySection, workersSection);
}

export function renderFactoryFloor(state, actions) {
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

      const title = document.createElement('p');
      title.className = 'line-node-label';
      title.textContent = node.label;

      box.appendChild(title);

      if (index === 0) {
        const inputId = node.inputs?.[0] || null;
        const inputItem = inputId ? getInventoryItemById(state, inputId) : null;

        const inputLine = document.createElement('p');
        inputLine.className = 'line-node-input';
        inputLine.textContent = `Input: ${inputItem ? inputItem.label : '(none)'}`;
        box.appendChild(inputLine);

        const controls = document.createElement('div');
        controls.className = 'feed-controls';

        const feedSelect = document.createElement('select');
        feedSelect.className = 'feed-select';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select supply item';
        defaultOption.selected = true;
        feedSelect.appendChild(defaultOption);

        const compatibleItems = actions.getCompatibleItemsForNode(node);
        compatibleItems.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          feedSelect.appendChild(option);
        });

        const feedButton = document.createElement('button');
        feedButton.type = 'button';
        feedButton.textContent = 'Feed';
        feedButton.disabled = state.narration.mode !== 'none' || Boolean(inputItem) || compatibleItems.length === 0;
        feedButton.addEventListener('click', () => {
          if (!feedSelect.value) {
            return;
          }
          actions.onFeedInput(feedSelect.value);
        });

        feedSelect.disabled = feedButton.disabled;

        controls.append(feedSelect, feedButton);
        box.appendChild(controls);
      }

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
  button.disabled = state.narration.mode !== 'none';
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
  renderFactoryFloor(state, actions);
  renderClipboard(state, actions);
}
