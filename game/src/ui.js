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

function withTd(eli5, td) {
  return `${eli5} (${td})`;
}

function hasUnusedBranch(state) {
  const mainLineSet = new Set(state.mainLineNodeIds || []);
  return state.connections.some(
    (connection) => mainLineSet.has(connection.fromNodeId) && !mainLineSet.has(connection.toNodeId)
  );
}

function getRayRayHint(state) {
  if (state.flags.lastRayMessage) {
    return state.flags.lastRayMessage;
  }

  const firstNodeId = state.mainLineNodeIds?.[0] || null;
  const firstNode = state.lineNodes.find((node) => node.id === firstNodeId) || null;

  if (firstNode && !firstNode.inputs?.[0]) {
    return "You didn't give the machine the thing to work on. (No source input connected to first node.)";
  }

  if (hasUnusedBranch(state)) {
    return 'That side line is idle. Nobody is asking it to work. (Unused branch not cooking: not downstream of an active viewer/output.)';
  }

  return '';
}

function renderHowCard(state, node, actions, parent) {
  const howCard = document.createElement('div');
  howCard.className = 'how-card';

  const title = document.createElement('p');
  title.className = 'how-card-title';
  title.textContent = withTd('How card', 'Parameters');
  howCard.appendChild(title);

  if (node.typeId === 'chop-mr-volume') {
    const pulseLabel = document.createElement('label');
    pulseLabel.className = 'how-toggle';

    const pulseCheckbox = document.createElement('input');
    pulseCheckbox.type = 'checkbox';
    pulseCheckbox.checked = Boolean(node.params?.pulse);
    pulseCheckbox.disabled = state.narration.mode !== 'none';
    pulseCheckbox.addEventListener('change', () => {
      actions.onSetNodeParam(node.id, 'pulse', pulseCheckbox.checked);
    });

    const text = document.createElement('span');
    text.textContent = 'Pulse (CHOP signal toggle)';

    pulseLabel.append(pulseCheckbox, text);
    howCard.appendChild(pulseLabel);
  }

  if (node.typeId === 'sop-mr-bones') {
    const rememberLabel = document.createElement('label');
    rememberLabel.className = 'how-toggle';

    const rememberCheckbox = document.createElement('input');
    rememberCheckbox.type = 'checkbox';
    rememberCheckbox.checked = Boolean(node.params?.remember);
    rememberCheckbox.disabled = state.narration.mode !== 'none';
    rememberCheckbox.addEventListener('change', () => {
      actions.onSetNodeParam(node.id, 'remember', rememberCheckbox.checked);
    });

    const text = document.createElement('span');
    text.textContent = 'Remember (history buffer)';

    rememberLabel.append(rememberCheckbox, text);
    howCard.append(rememberLabel);
  }

  if (howCard.children.length > 1) {
    parent.appendChild(howCard);
  }
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
    const doneCount = state.goalStatus.checks.filter(Boolean).length;
    const total = state.goalStatus.checks.length;
    lineCount.textContent = `Goals ${doneCount}/${total}`;
  }

  continueButton.disabled = state.narration.mode === 'none';
  nextButton.disabled = state.narration.mode !== 'none' || !state.goalStatus.complete;
}

export function renderBreakRoom(state, actions) {
  const container = getElementOrThrow('break-room-content');
  container.innerHTML = '';

  const supplySection = document.createElement('section');
  supplySection.className = 'subpanel';

  const supplyHeading = document.createElement('h3');
  supplyHeading.className = 'subpanel-heading';
  supplyHeading.textContent = withTd('Supply Room', 'Input Inventory');

  const supplyList = document.createElement('ul');
  supplyList.className = 'inventory-list';

  state.inventory.forEach((item) => {
    const row = document.createElement('li');
    row.className = 'inventory-item';

    const label = document.createElement('span');
    label.textContent = item.label;

    const kind = document.createElement('span');
    kind.className = 'inventory-kind';
    kind.textContent = `${item.kind} (type)`;

    row.append(label, kind);
    supplyList.appendChild(row);
  });

  supplySection.append(supplyHeading, supplyList);

  const workersSection = document.createElement('section');
  workersSection.className = 'subpanel';

  const workersHeading = document.createElement('h3');
  workersHeading.className = 'subpanel-heading';
  workersHeading.textContent = withTd('Workers', 'Operators');

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

    const firstNodeId = state.mainLineNodeIds?.[0] || null;
    const cookedNodeSet = new Set(state.runtime?.lastCookedNodeIds || []);

    state.lineNodes.forEach((node) => {
      const box = document.createElement('div');
      box.className = 'line-node-box';
      if (cookedNodeSet.has(node.id)) {
        box.classList.add('cooking');
      }

      const title = document.createElement('p');
      title.className = 'line-node-label';
      title.textContent = node.label;

      const nodeIdLabel = document.createElement('p');
      nodeIdLabel.className = 'line-node-id';
      nodeIdLabel.textContent = node.id;

      box.append(title, nodeIdLabel);

      if (node.id === firstNodeId) {
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

        state.inventory.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          feedSelect.appendChild(option);
        });

        const feedButton = document.createElement('button');
        feedButton.type = 'button';
        feedButton.textContent = 'Feed';
        feedButton.disabled = state.narration.mode !== 'none' || Boolean(inputItem);
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

      renderHowCard(state, node, actions, box);

      const splitButton = document.createElement('button');
      splitButton.type = 'button';
      splitButton.className = 'split-button';
      splitButton.textContent = 'Split Output';
      splitButton.disabled =
        state.narration.mode !== 'none' ||
        !state.connections.some((connection) => connection.fromNodeId === node.id);
      splitButton.addEventListener('click', () => {
        actions.onSplitOutput(node.id);
      });
      box.appendChild(splitButton);

      chain.appendChild(box);
    });

    line.appendChild(chain);

    const connections = document.createElement('div');
    connections.className = 'connections-list';

    const heading = document.createElement('p');
    heading.className = 'connections-heading';
    heading.textContent = withTd('Connections', 'Links');
    connections.appendChild(heading);

    if (state.connections.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder';
      empty.textContent = '(none)';
      connections.appendChild(empty);
    } else {
      state.connections.forEach((connection) => {
        const row = document.createElement('p');
        row.className = 'connection-row';
        row.textContent = `${connection.fromNodeId} -> ${connection.toNodeId}`;
        connections.appendChild(row);
      });
    }

    line.appendChild(connections);
  }

  container.appendChild(line);
}

export function renderClipboard(state, actions) {
  const container = getElementOrThrow('clipboard-content');
  container.innerHTML = '';

  const controls = document.createElement('div');
  controls.className = 'clipboard-controls';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Press Status';
  button.disabled = state.narration.mode !== 'none';
  button.addEventListener('click', () => {
    actions.onPressStatus();
  });

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.textContent = 'Let it run';
  runButton.disabled = state.narration.mode !== 'none' || state.clipboard.mode === 'auto';
  runButton.addEventListener('click', () => {
    actions.onLetItRun();
  });

  const fasterButton = document.createElement('button');
  fasterButton.type = 'button';
  fasterButton.textContent = 'Faster';
  fasterButton.disabled =
    state.narration.mode !== 'none' || state.clipboard.mode !== 'auto' || state.time.dt <= 16;
  fasterButton.addEventListener('click', () => {
    actions.onAdjustSpeed('faster');
  });

  const slowerButton = document.createElement('button');
  slowerButton.type = 'button';
  slowerButton.textContent = 'Slower';
  slowerButton.disabled =
    state.narration.mode !== 'none' || state.clipboard.mode !== 'auto' || state.time.dt >= 1000;
  slowerButton.addEventListener('click', () => {
    actions.onAdjustSpeed('slower');
  });

  const modeText = document.createElement('p');
  modeText.className = 'clipboard-mode';
  modeText.textContent = `Mode: ${state.clipboard.mode} | Tick: ${state.time.dt}ms | Clock: ${state.time.t.toFixed(2)}s`;

  controls.append(button, runButton, fasterButton, slowerButton);

  const report = document.createElement('pre');
  report.className = 'status-report';
  report.textContent = state.clipboard.lastReport || `${withTd('Status Report', 'Viewer')}: (nothing yet)`;

  const wrongHeading = document.createElement('p');
  wrongHeading.className = 'connections-heading';
  wrongHeading.textContent = 'Slightly Wrong Worker Instructions';

  const wrongList = document.createElement('ul');
  wrongList.className = 'inventory-list';
  (state.activeLevelDef?.wrongHintLines || []).forEach((line) => {
    const row = document.createElement('li');
    row.className = 'inventory-item';
    row.textContent = line;
    wrongList.appendChild(row);
  });

  const truthHeading = document.createElement('p');
  truthHeading.className = 'connections-heading';
  truthHeading.textContent = 'Ray Ray Translation';

  const truthList = document.createElement('ul');
  truthList.className = 'inventory-list';
  (state.activeLevelDef?.rayRayTruthLines || []).forEach((line) => {
    const row = document.createElement('li');
    row.className = 'inventory-item';
    row.textContent = line;
    truthList.appendChild(row);
  });

  const hint = document.createElement('p');
  hint.className = 'ray-ray-hint';
  hint.textContent = getRayRayHint(state) || 'Ray Ray: ✅';

  container.append(controls, modeText, report, wrongHeading, wrongList, truthHeading, truthList, hint);
}

export function renderAll(state, actions) {
  renderNarration(state);
  renderBreakRoom(state, actions);
  renderFactoryFloor(state, actions);
  renderClipboard(state, actions);
}
