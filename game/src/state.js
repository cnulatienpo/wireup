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
    connections: [],
    clipboard: {
      mode: 'manual',
      lastReport: ''
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
    connections: nextConnection ? [...state.connections, nextConnection] : [...state.connections]
  };
}

export function feedInput(state, itemId) {
  if (state.lineNodes.length === 0) {
    return state;
  }

  const firstNode = state.lineNodes[0];
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

  return {
    ...state,
    lineNodes: [updatedFirstNode, ...state.lineNodes.slice(1)]
  };
}

export function pressStatus(state) {
  const labels = state.lineNodes.map((node) => node.label);
  const lineText = labels.length > 0 ? labels.join(' -> ') : '(empty)';
  const firstInputId = state.lineNodes[0]?.inputs?.[0] || null;
  const firstInput = firstInputId ? getItemById(state, firstInputId) : null;
  const inputText = firstInput ? firstInput.label : '(none)';

  const reportLines = [
    `Line: ${lineText}`,
    `Nodes: ${state.lineNodes.length}`,
    `Connections: ${state.connections.length}`,
    `Input: ${inputText}`
  ];

  if (!firstInput) {
    reportLines.push('The machine has nothing to work on.');
  }

  return {
    ...state,
    clipboard: {
      ...state.clipboard,
      lastReport: reportLines.join('\n')
    }
  };
}
