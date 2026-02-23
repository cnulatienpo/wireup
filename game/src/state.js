const WORKER_TYPES = [
  {
    id: 'top-mr-draw',
    displayName: 'Mr Draw',
    tdFamilyLabel: 'TOP (Texture Operator)',
    descriptionEli5: 'I paint pictures on things so they look right.',
    descriptionTd: 'Creates and processes image textures used by materials and lookdev.'
  },
  {
    id: 'chop-mr-volume',
    displayName: 'Mr Volume',
    tdFamilyLabel: 'CHOP (Channel Operator)',
    descriptionEli5: 'I handle changing numbers over time like music beats.',
    descriptionTd: 'Processes time-sliced channel data for animation, control, and signals.'
  },
  {
    id: 'sop-mr-bones',
    displayName: 'Mr Bones',
    tdFamilyLabel: 'SOP (Surface Operator)',
    descriptionEli5: 'I build and change 3D shapes you can see.',
    descriptionTd: 'Generates and modifies geometric surfaces and point data.'
  },
  {
    id: 'comp-mr-box',
    displayName: 'Mr Box',
    tdFamilyLabel: 'COMP (Component)',
    descriptionEli5: 'I hold tools together in little boxes so projects stay tidy.',
    descriptionTd: 'Encapsulates networks, UI, and behaviors into reusable component hierarchies.'
  },
  {
    id: 'dat-mr-plan',
    displayName: 'Mr Plan',
    tdFamilyLabel: 'DAT (Data Operator)',
    descriptionEli5: 'I read and write words and tables for instructions.',
    descriptionTd: 'Manages structured and unstructured text/tabular data for logic and configuration.'
  },
  {
    id: 'pop-mr-move',
    displayName: 'Mr Move',
    tdFamilyLabel: 'POP (Particle Operator)',
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
    runtime: {
      lastCookedNodeIds: []
    },
    inventory: [
      { id: 'inv_video_clip', kind: 'video', label: 'Stock Footage Clip' },
      { id: 'inv_beat_meter', kind: 'numbers', label: 'Beat Meter' },
      { id: 'inv_tube_shape', kind: 'geometry', label: 'Tube Shape' },
      { id: 'inv_checklist_note', kind: 'text', label: 'Checklist Note' }
    ],
    flags: {}
  };
}

export function loadLevel(state, levelDef) {
  return {
    ...state,
    levelId: levelDef.id,
    levelMeta: {
      title: levelDef.title
    },
    activeLevelDef: levelDef,
    narration: {
      lines: [...levelDef.introLines],
      index: 0,
      mode: 'intro'
    },
    lineNodes: [],
    mainLineNodeIds: [],
    connections: [],
    clipboard: {
      ...state.clipboard,
      lastReport: ''
    },
    runtime: {
      lastCookedNodeIds: []
    }
  };
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
  const workerType = state.breakRoomTypes.find((worker) => worker.id === workerTypeId);
  if (!workerType) {
    return state;
  }

  const nextNode = {
    id: toNodeId(state.lineNodes.length + 1),
    typeId: workerType.id,
    label: workerType.displayName,
    params: {},
    inputs: []
  };

  const previousNode = state.lineNodes[state.lineNodes.length - 1];
  const nextConnection = previousNode
    ? {
        fromNodeId: previousNode.id,
        toNodeId: nextNode.id
      }
    : null;

  return {
    ...state,
    lineNodes: [...state.lineNodes, nextNode],
    mainLineNodeIds: [...state.mainLineNodeIds, nextNode.id],
    connections: nextConnection ? [...state.connections, nextConnection] : [...state.connections]
  };
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
    inputs: []
  };

  return {
    ...state,
    lineNodes: [...state.lineNodes, clonedNode],
    connections: [
      ...state.connections,
      {
        fromNodeId: nodeId,
        toNodeId: clonedNode.id
      }
    ]
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
  if (!item || !canWorkerAcceptItem(firstNode.typeId, item.kind)) {
    return state;
  }

  const updatedFirstNode = {
    ...firstNode,
    inputs: [item.id]
  };

  const nextLineNodes = [...state.lineNodes];
  nextLineNodes[firstNodeIndex] = updatedFirstNode;

  return {
    ...state,
    lineNodes: nextLineNodes
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

  const reportLines = [
    `Line: ${lineText}`,
    `Nodes: ${cookedNodeIds.length}`,
    `Connections: ${state.connections.length}`,
    `Input: ${inputText}`
  ];

  if (!firstInput) {
    reportLines.push('The machine has nothing to work on.');
  }

  return {
    ...state,
    runtime: {
      ...state.runtime,
      lastCookedNodeIds: cookedNodeIds
    },
    clipboard: {
      ...state.clipboard,
      lastReport: reportLines.join('\n')
    }
  };
}
