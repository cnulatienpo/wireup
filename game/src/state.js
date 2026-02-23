const WORKER_TYPES = [
  {
    id: 'top-mr-draw',
    displayName: 'Mr Draw',
    tdFamilyLabel: 'Picture Painter (TOP / Texture Operator)',
    descriptionEli5: 'I paint pictures on things so they look right.',
    descriptionTd: 'Creates and processes image textures used by materials and lookdev.'
  },
  {
    id: 'chop-mr-volume',
    displayName: 'Mr Volume',
    tdFamilyLabel: 'Number Beat Worker (CHOP / Channel Operator)',
    descriptionEli5: 'I handle changing numbers over time like music beats.',
    descriptionTd: 'Processes time-sliced channel data for animation, control, and signals.'
  },
  {
    id: 'sop-mr-bones',
    displayName: 'Mr Bones',
    tdFamilyLabel: 'Shape Builder (SOP / Surface Operator)',
    descriptionEli5: 'I build and change 3D shapes you can see.',
    descriptionTd: 'Generates and modifies geometric surfaces and point data.'
  },
  {
    id: 'comp-mr-box',
    displayName: 'Mr Box',
    tdFamilyLabel: 'Big Container (COMP / Component)',
    descriptionEli5: 'I hold tools together in little boxes so projects stay tidy.',
    descriptionTd: 'Encapsulates networks, UI, and behaviors into reusable component hierarchies.'
  },
  {
    id: 'dat-mr-plan',
    displayName: 'Mr Plan',
    tdFamilyLabel: 'Table Reader (DAT / Data Operator)',
    descriptionEli5: 'I read and write words and tables for instructions.',
    descriptionTd: 'Manages structured and unstructured text/tabular data for logic and configuration.'
  },
  {
    id: 'pop-mr-move',
    displayName: 'Mr Move',
    tdFamilyLabel: 'Dot Mover (POP / Particle Operator)',
    descriptionEli5: 'I move lots of tiny dots around like swarms.',
    descriptionTd: 'Simulates and updates particle systems and related motion attributes.'
  }
];

const INPUT_COMPATIBILITY = {
  'top-mr-draw': ['video'],
  'chop-mr-volume': ['numbers'],
  'sop-mr-bones': ['geometry'],
  'dat-mr-plan': ['text'],
  'comp-mr-box': ['*'],
  'pop-mr-move': ['numbers', 'geometry']
};

function toNodeId(index) {
  return `node_${String(index).padStart(3, '0')}`;
}

function getItemById(state, itemId) {
  return state.inventory.find((item) => item.id === itemId) || null;
}

function updateNodeById(state, nodeId, updater) {
  const nodeIndex = state.lineNodes.findIndex((node) => node.id === nodeId);
  if (nodeIndex < 0) {
    return state;
  }

  const node = state.lineNodes[nodeIndex];
  const updatedNode = updater(node);
  const nextLineNodes = [...state.lineNodes];
  nextLineNodes[nodeIndex] = updatedNode;

  return {
    ...state,
    lineNodes: nextLineNodes
  };
}

function getUpstreamNodeIds(state, startNodeId) {
  if (!startNodeId) {
    return [];
  }

  const incomingByNodeId = new Map();
  state.connections.forEach((connection) => {
    const incoming = incomingByNodeId.get(connection.toNodeId) || [];
    incoming.push(connection.fromNodeId);
    incomingByNodeId.set(connection.toNodeId, incoming);
  });

  const visited = new Set();
  const stack = [startNodeId];

  while (stack.length > 0) {
    const currentNodeId = stack.pop();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }
    visited.add(currentNodeId);

    const upstreamNodeIds = incomingByNodeId.get(currentNodeId) || [];
    upstreamNodeIds.forEach((upstreamNodeId) => stack.push(upstreamNodeId));
  }

  return [...visited];
}

function hasUnusedBranch(state) {
  const mainLineSet = new Set(state.mainLineNodeIds || []);
  return state.connections.some(
    (connection) => mainLineSet.has(connection.fromNodeId) && !mainLineSet.has(connection.toNodeId)
  );
}

function evaluateGoals(state) {
  const checks = state.activeLevelDef?.requiredGoalChecks || [];
  const results = checks.map((goalCheck) => Boolean(goalCheck(state)));
  const complete = results.length > 0 && results.every(Boolean);

  return {
    ...state,
    goalStatus: {
      checks: results,
      complete
    }
  };
}

function withGoalEvaluation(state) {
  return evaluateGoals(state);
}

function updateBonesHistory(state, pulseValue) {
  let nextState = state;

  state.lineNodes.forEach((node) => {
    if (node.typeId !== 'sop-mr-bones' || !node.params?.remember) {
      return;
    }

    const history = Array.isArray(node.state?.history) ? node.state.history : [];
    const nextHistory = [...history, pulseValue].slice(-5);

    nextState = updateNodeById(nextState, node.id, (currentNode) => ({
      ...currentNode,
      state: {
        ...(currentNode.state || {}),
        history: nextHistory
      }
    }));
  });

  return nextState;
}

function getPulseValue(state) {
  const hasPulseNode = state.lineNodes.some((node) => node.typeId === 'chop-mr-volume' && node.params?.pulse);
  if (!hasPulseNode) {
    return null;
  }

  return Math.sin(state.time.t);
}

export function canWorkerAcceptItem(workerTypeId, itemKind) {
  const allowedKinds = INPUT_COMPATIBILITY[workerTypeId] || [];
  return allowedKinds.includes('*') || allowedKinds.includes(itemKind);
}

export function getCompatibleInventoryForNode(state, node) {
  return state.inventory.filter((item) => canWorkerAcceptItem(node.typeId, item.kind));
}

export function createInitialState() {
  return {
    levelId: '',
    levelIndex: 0,
    levelsTotal: 0,
    levelMeta: {
      title: ''
    },
    activeLevelDef: null,
    narration: {
      lines: [],
      index: 0,
      mode: 'none'
    },
    breakRoomTypes: WORKER_TYPES.map((worker) => ({ ...worker })),
    lineNodes: [],
    mainLineNodeIds: [],
    connections: [],
    clipboard: {
      mode: 'manual',
      lastReport: ''
    },
    time: {
      running: false,
      t: 0,
      dt: 250
    },
    runtime: {
      lastCookedNodeIds: []
    },
    inventory: [
      { id: 'inv_video_clip', kind: 'video', label: 'Stock Footage Clip' },
      { id: 'inv_beat_meter', kind: 'numbers', label: 'Beat Meter' },
      { id: 'inv_tube_shape', kind: 'geometry', label: 'Tube Shape' },
      { id: 'inv_checklist_note', kind: 'text', label: 'Checklist Note' }
    ],
    goalStatus: {
      checks: [],
      complete: false
    },
    flags: {
      lastRayMessage: '',
      incompatibleAttempted: false,
      statusPressed: false
    }
  };
}

export function loadLevel(state, levelDef, levelIndex = 0, levelsTotal = 1) {
  const restrictedWorkers = state.breakRoomTypes.filter((worker) =>
    (levelDef.allowedWorkers || []).includes(worker.id)
  );

  return evaluateGoals({
    ...state,
    levelId: levelDef.id,
    levelIndex,
    levelsTotal,
    levelMeta: {
      title: levelDef.title
    },
    activeLevelDef: levelDef,
    narration: {
      lines: [...levelDef.introLines],
      index: 0,
      mode: 'intro'
    },
    breakRoomTypes: restrictedWorkers,
    lineNodes: [],
    mainLineNodeIds: [],
    connections: [],
    clipboard: {
      ...state.clipboard,
      mode: 'manual',
      lastReport: ''
    },
    time: {
      ...state.time,
      running: false,
      t: 0,
      dt: 250
    },
    runtime: {
      lastCookedNodeIds: []
    },
    flags: {
      lastRayMessage: '',
      incompatibleAttempted: false,
      statusPressed: false,
      autoFormalLinePending: false,
      autoFormalLineShown: false
    }
  });
}

export function goToNextLevel(state, levels) {
  if (!state.goalStatus.complete) {
    return state;
  }

  const nextLevelIndex = state.levelIndex + 1;
  if (nextLevelIndex >= levels.length) {
    return {
      ...state,
      flags: {
        ...state.flags,
        lastRayMessage:
          'You cleared every project. Factory boss mode unlocked. (All level goal checks complete.)'
      }
    };
  }

  return loadLevel(state, levels[nextLevelIndex], nextLevelIndex, levels.length);
}

export function advanceNarration(state) {
  const { narration, activeLevelDef } = state;

  if (narration.mode === 'none' || !activeLevelDef) {
    return state;
  }

  const nextIndex = narration.index + 1;
  if (nextIndex < narration.lines.length) {
    return {
      ...state,
      narration: {
        ...narration,
        index: nextIndex
      }
    };
  }

  if (narration.mode === 'intro') {
    return {
      ...state,
      narration: {
        lines: [...activeLevelDef.goalLines],
        index: 0,
        mode: 'goals'
      }
    };
  }

  return {
    ...state,
    narration: {
      lines: [],
      index: 0,
      mode: 'none'
    }
  };
}

export function addNodeToLine(state, workerTypeId) {
  const allowedWorkers = state.activeLevelDef?.allowedWorkers || [];
  if (!allowedWorkers.includes(workerTypeId)) {
    return {
      ...state,
      flags: {
        ...state.flags,
        lastRayMessage:
          'That worker is off this project today. (Not included in level allowedWorkers list.)'
      }
    };
  }

  const workerType = state.breakRoomTypes.find((worker) => worker.id === workerTypeId);
  if (!workerType) {
    return state;
  }

  const nextNode = {
    id: toNodeId(state.lineNodes.length + 1),
    typeId: workerType.id,
    label: workerType.displayName,
    params: {},
    state: {},
    inputs: []
  };

  const previousNode = state.lineNodes[state.lineNodes.length - 1] || null;
  const nextConnection = previousNode
    ? {
        fromNodeId: previousNode.id,
        toNodeId: nextNode.id
      }
    : null;

  const nextState = {
    ...state,
    lineNodes: [...state.lineNodes, nextNode],
    mainLineNodeIds: [...state.mainLineNodeIds, nextNode.id],
    connections: nextConnection ? [...state.connections, nextConnection] : [...state.connections]
  };

  return withGoalEvaluation(nextState);
}

export function setNodeParam(state, nodeId, key, value) {
  return withGoalEvaluation(
    updateNodeById(state, nodeId, (node) => ({
      ...node,
      params: {
        ...(node.params || {}),
        [key]: value
      }
    }))
  );
}

export function splitOutput(state, nodeId) {
  const outgoing = state.connections.find((connection) => connection.fromNodeId === nodeId);
  if (!outgoing) {
    return state;
  }

  const downstream = state.lineNodes.find((node) => node.id === outgoing.toNodeId);
  if (!downstream) {
    return state;
  }

  const clonedNode = {
    ...downstream,
    id: toNodeId(state.lineNodes.length + 1),
    params: { ...downstream.params },
    state: {
      ...(downstream.state || {}),
      history: Array.isArray(downstream.state?.history) ? [...downstream.state.history] : []
    },
    inputs: []
  };

  return withGoalEvaluation({
    ...state,
    lineNodes: [...state.lineNodes, clonedNode],
    connections: [
      ...state.connections,
      {
        fromNodeId: nodeId,
        toNodeId: clonedNode.id
      }
    ]
  });
}

export function feedInput(state, itemId) {
  if (state.lineNodes.length === 0) {
    return state;
  }

  const firstNodeId = state.mainLineNodeIds[0] || null;
  const firstNodeIndex = state.lineNodes.findIndex((node) => node.id === firstNodeId);
  const firstNode = firstNodeIndex >= 0 ? state.lineNodes[firstNodeIndex] : null;
  if (!firstNode) {
    return state;
  }

  const existingInput = firstNode.inputs?.[0];
  if (existingInput) {
    return state;
  }

  const item = getItemById(state, itemId);
  if (!item) {
    return state;
  }

  if (!canWorkerAcceptItem(firstNode.typeId, item.kind)) {
    return withGoalEvaluation({
      ...state,
      flags: {
        ...state.flags,
        incompatibleAttempted: true,
        lastRayMessage: `That item does not fit this worker. (${firstNode.label} expects ${
          INPUT_COMPATIBILITY[firstNode.typeId].join(' / ')
        } input types.)`
      }
    });
  }

  const updatedFirstNode = {
    ...firstNode,
    inputs: [item.id]
  };

  const nextLineNodes = [...state.lineNodes];
  nextLineNodes[firstNodeIndex] = updatedFirstNode;

  return withGoalEvaluation({
    ...state,
    lineNodes: nextLineNodes,
    flags: {
      ...state.flags,
      lastRayMessage: ''
    }
  });
}

export function setClipboardAutoMode(state) {
  return withGoalEvaluation({
    ...state,
    clipboard: {
      ...state.clipboard,
      mode: 'auto'
    },
    time: {
      ...state.time,
      running: true
    },
    flags: {
      ...state.flags,
      autoFormalLinePending: !state.flags.autoFormalLineShown,
      autoFormalLineShown: state.flags.autoFormalLineShown || false
    }
  });
}

export function adjustTimeInterval(state, direction) {
  const currentDt = state.time.dt;
  const nextDt = direction === 'faster' ? Math.max(16, Math.floor(currentDt / 2)) : Math.min(1000, currentDt * 2);

  return {
    ...state,
    time: {
      ...state.time,
      dt: nextDt
    }
  };
}

export function tickTime(state) {
  if (!state.time.running) {
    return state;
  }

  return {
    ...state,
    time: {
      ...state.time,
      t: state.time.t + state.time.dt / 1000
    }
  };
}

export function pressStatus(state) {
  const clipboardTargetNodeId = state.mainLineNodeIds[state.mainLineNodeIds.length - 1] || null;
  const cookedNodeIds = getUpstreamNodeIds(state, clipboardTargetNodeId);
  const cookedNodeSet = new Set(cookedNodeIds);
  const labels = state.lineNodes.filter((node) => cookedNodeSet.has(node.id)).map((node) => node.label);
  const lineText = labels.length > 0 ? labels.join(' -> ') : '(empty)';
  const firstNodeId = state.mainLineNodeIds[0] || null;
  const firstNode = state.lineNodes.find((node) => node.id === firstNodeId) || null;
  const firstInputId = firstNode?.inputs?.[0] || null;
  const firstInput = firstInputId ? getItemById(state, firstInputId) : null;
  const inputText = firstInput ? firstInput.label : '(none)';

  const pulseValue = getPulseValue(state);
  let nextState = pulseValue === null ? state : updateBonesHistory(state, pulseValue);

  const reportLines = [
    `Line: ${lineText}`,
    `Nodes: ${cookedNodeIds.length}`,
    `Connections: ${state.connections.length}`,
    `Input: ${inputText}`,
    `Clock: t=${nextState.time.t.toFixed(2)}s, step=${nextState.time.dt}ms`
  ];

  if (pulseValue !== null) {
    reportLines.push(`Pulse: ${pulseValue.toFixed(3)}`);
  }

  const hasDeepRoomRun = nextState.lineNodes.some((node) => node.typeId === 'sop-mr-bones' && node.inputs?.[0]);
  if (hasDeepRoomRun) {
    reportLines.push('Deep Room text preview: Geometry arrived and transformed.');
  }

  nextState.lineNodes.forEach((node) => {
    if (node.typeId !== 'sop-mr-bones' || !node.params?.remember) {
      return;
    }

    const history = Array.isArray(node.state?.history) ? node.state.history : [];
    reportLines.push(`${node.label} Trail: ${history.map((value) => value.toFixed(3)).join(', ') || '(empty)'}`);
  });

  if (!firstInput) {
    reportLines.push('The machine has nothing to work on.');
  }

  if (hasUnusedBranch(nextState)) {
    reportLines.push('Unused branch detected: split output exists without clipboard demand.');
  }

  if (nextState.flags.autoFormalLinePending) {
    reportLines.push('The procession will now continue.');
  }

  return withGoalEvaluation({
    ...nextState,
    runtime: {
      ...nextState.runtime,
      lastCookedNodeIds: cookedNodeIds
    },
    clipboard: {
      ...nextState.clipboard,
      lastReport: reportLines.join('\n')
    },
    flags: {
      ...nextState.flags,
      statusPressed: true,
      autoFormalLinePending: false,
      autoFormalLineShown: nextState.flags.autoFormalLineShown || nextState.flags.autoFormalLinePending
    }
  });
}
