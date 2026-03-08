const hasVideoSource = (state) =>
  state.lineNodes.some((node) => node.typeId === 'source' && node.materialType === 'video');

const hasWorker = (state, typeId) => state.lineNodes.some((node) => node.typeId === typeId);

const hasConnection = (state, fromTypeId, toTypeId) =>
  state.connections.some((connection) => {
    const fromNode = state.lineNodes.find((node) => node.id === connection.fromNodeId);
    const toNode = state.lineNodes.find((node) => node.id === connection.toNodeId);
    return fromNode?.typeId === fromTypeId && toNode?.typeId === toTypeId;
  });

const isDrawBeforeVolume = (state) => {
  const drawIndex = state.lineNodes.findIndex((node) => node.typeId === 'top-mr-draw');
  const volumeIndex = state.lineNodes.findIndex((node) => node.typeId === 'chop-mr-volume');
  return drawIndex >= 0 && volumeIndex >= 0 && drawIndex < volumeIndex;
};

const hasVolumeHow = (state) =>
  state.lineNodes.some((node) => node.typeId === 'chop-mr-volume' && typeof node.params?.pulse === 'boolean');

const hasDeepRoomInput = (state) =>
  state.lineNodes.some((node) => node.typeId === 'sop-mr-bones' && Boolean(node.inputs?.[0]));

export const LEVELS = [
  {
    id: 1,
    title: 'This is a factory',
    dialogue: [
      { speaker: 'system', text: 'You are the boss. You will make it make a thing.' },
      { speaker: 'system', text: 'But first it needs something to work on.' },
      { speaker: 'system', text: 'Drag a video into the machine.' }
    ],
    allowedWorkers: ['top-mr-draw'],
    allowedSourceTypes: ['video'],
    disableBeltDrawing: true,
    disableHowPanel: true,
    requiredGoalChecks: [
      (state) => hasVideoSource(state)
    ],
    noInputDiagnosis: "Blank status report.\nYou didn't give the machine the thing to work on.",
    unlocks: []
  },
  {
    id: 2,
    title: 'Write the How',
    dialogue: [
      { speaker: 'system', text: 'Workers know one job.' },
      { speaker: 'system', text: 'Mr Draw changes color.' },
      { speaker: 'system', text: 'But he needs instructions.' },
      { speaker: 'system', text: 'Tell him what color to use.' }
    ],
    allowedWorkers: ['top-mr-draw'],
    allowedSourceTypes: ['video'],
    disableBeltDrawing: true,
    requiredGoalChecks: [
      (state) => hasVideoSource(state),
      (state) => hasVideoSource(state) && Boolean(state.flags?.statusPressed)
    ],
    unlocks: ['howPanel'],
    failureDialogue: [
      { speaker: 'rayray', text: 'Numbers are still the same.\nYou gotta tell him how.' }
    ]
  },
  {
    id: 3,
    title: 'Draw the Belt',
    dialogue: [
      { speaker: 'system', text: 'Workers pass things to each other.' },
      { speaker: 'system', text: 'They need a belt.' },
      { speaker: 'system', text: 'Draw a belt from Draw to Volume.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume'],
    allowedSourceTypes: ['video'],
    requiredGoalChecks: [
      (state) => hasVideoSource(state),
      (state) => hasConnection(state, 'top-mr-draw', 'chop-mr-volume'),
      (state) => hasConnection(state, 'top-mr-draw', 'chop-mr-volume') && Boolean(state.flags?.statusPressed)
    ],
    unlocks: ['mrVolume', 'belts'],
    failureDialogue: [
      { speaker: 'rayray', text: 'Mr Volume is waiting.\nDraw the belt so he gets the thing to change.' }
    ]
  },
  {
    id: 4,
    title: 'Order Matters',
    dialogue: [
      { speaker: 'system', text: 'The order of workers matters.' },
      { speaker: 'system', text: 'The thing moves left to right.' },
      { speaker: 'system', text: 'Fix the order.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume'],
    allowedSourceTypes: ['video'],
    requiredGoalChecks: [
      (state) => hasWorker(state, 'top-mr-draw') && hasWorker(state, 'chop-mr-volume'),
      (state) => isDrawBeforeVolume(state),
      (state) => hasConnection(state, 'top-mr-draw', 'chop-mr-volume'),
      (state) =>
        isDrawBeforeVolume(state) &&
        hasConnection(state, 'top-mr-draw', 'chop-mr-volume') &&
        Boolean(state.flags?.statusPressed)
    ],
    unlocks: ['workerReordering'],
    failureDialogue: [
      { speaker: 'rayray', text: 'Wrong order.\nThe thing moves this way.' }
    ]
  },
  {
    id: 5,
    title: 'The Report Is A Snapshot',
    dialogue: [
      { speaker: 'system', text: 'The machine is always working.' },
      { speaker: 'system', text: 'But the clipboard is just a report.' },
      { speaker: 'system', text: 'It shows one moment.' },
      { speaker: 'system', text: 'Press Status to update the report.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume'],
    allowedSourceTypes: ['video'],
    requiredGoalChecks: [
      (state) => hasVolumeHow(state),
      (state) => hasVolumeHow(state) && Boolean(state.flags?.statusPressed)
    ],
    unlocks: [],
    failureDialogue: [
      { speaker: 'rayray', text: 'The machine changed.\nThe report didn’t.\nPush the button.' }
    ]
  },
  {
    id: 6,
    title: 'Workers Have Jobs',
    dialogue: [
      { speaker: 'system', text: 'Every worker knows one job.' },
      { speaker: 'system', text: 'Mr Draw chooses color.' },
      { speaker: 'system', text: 'Mr Volume changes strength.' },
      { speaker: 'system', text: 'They do different work.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume'],
    allowedSourceTypes: ['video'],
    requiredGoalChecks: [
      (state) => hasWorker(state, 'top-mr-draw'),
      (state) => hasWorker(state, 'chop-mr-volume'),
      (state) => hasVolumeHow(state),
      (state) => hasConnection(state, 'top-mr-draw', 'chop-mr-volume') && Boolean(state.flags?.statusPressed)
    ],
    unlocks: []
  },
  {
    id: 7,
    title: 'Changing What',
    dialogue: [
      { speaker: 'system', text: 'Some workers change what you see.' },
      { speaker: 'system', text: 'Color is one example.' },
      { speaker: 'system', text: 'Use Mr Draw to change the picture.' }
    ],
    allowedWorkers: ['top-mr-draw'],
    allowedSourceTypes: ['video'],
    disableBeltDrawing: true,
    disableHowPanel: true,
    requiredGoalChecks: [
      (state) => hasWorker(state, 'top-mr-draw') && hasVideoSource(state),
      (state) => hasWorker(state, 'top-mr-draw') && hasVideoSource(state) && Boolean(state.flags?.statusPressed)
    ],
    unlocks: []
  },
  {
    id: 8,
    title: 'Changing How Much',
    dialogue: [
      { speaker: 'system', text: 'Some workers change how strong something is.' },
      { speaker: 'system', text: 'Mr Volume changes strength.' },
      { speaker: 'system', text: 'Make the picture brighter.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume'],
    allowedSourceTypes: ['video'],
    requiredGoalChecks: [
      (state) => hasWorker(state, 'chop-mr-volume'),
      (state) => hasVolumeHow(state),
      (state) => hasVolumeHow(state) && Boolean(state.flags?.statusPressed)
    ],
    unlocks: [],
    failureDialogue: [
      { speaker: 'rayray', text: 'He only changes color.\nTry the strength worker.' }
    ]
  },
  {
    id: 9,
    title: 'Changing Where',
    dialogue: [
      { speaker: 'system', text: 'Some workers move things.' },
      { speaker: 'system', text: 'They can move pictures.' },
      { speaker: 'system', text: 'Try moving the picture.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume', 'sop-mr-bones'],
    requiredGoalChecks: [
      (state) => hasWorker(state, 'sop-mr-bones'),
      (state) => state.lineNodes.some((node) => node.typeId === 'sop-mr-bones' && Boolean(node.params?.remember)),
      (state) =>
        state.lineNodes.some((node) => node.typeId === 'sop-mr-bones' && Boolean(node.params?.remember)) &&
        Boolean(state.flags?.statusPressed)
    ],
    unlocks: ['transformWorker']
  },
  {
    id: 10,
    title: 'The Deep Room',
    dialogue: [
      { speaker: 'system', text: 'There is another room inside the machine.' },
      { speaker: 'system', text: 'The Flat Room changes pictures.' },
      { speaker: 'system', text: 'The Deep Room builds space.' },
      { speaker: 'system', text: 'But you cannot see it directly.' },
      { speaker: 'system', text: 'You need a camera.' },
      { speaker: 'system', text: 'The camera takes a picture.' }
    ],
    allowedWorkers: ['top-mr-draw', 'chop-mr-volume', 'sop-mr-bones'],
    requiredGoalChecks: [
      (state) => hasWorker(state, 'sop-mr-bones'),
      (state) => hasDeepRoomInput(state),
      (state) => hasDeepRoomInput(state) && Boolean(state.flags?.statusPressed)
    ],
    unlocks: ['deepRoom', 'cameraWorker']
  },
  {
    id: 11,
    title: 'Level 11 — Cooking only happens when requested.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 11' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Cooking is demand-driven.' },
      { speaker: "system", text: 'No request means no cook.' },
      { speaker: "system", text: 'Do not assume every node updates continuously.' }
    ],
    unlocks: []
  },
  {
    id: 12,
    title: 'Level 12 — Requests travel upstream.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 12' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Demand starts at a consumer.' },
      { speaker: "system", text: 'The request travels upstream for required data.' },
      { speaker: "system", text: 'Follow demand direction when debugging.' }
    ],
    unlocks: []
  },
  {
    id: 13,
    title: 'Level 13 — Unused branches do not cook.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 13' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Disconnected demand means idle branches.' },
      { speaker: "system", text: 'Unused branches do not cook.' },
      { speaker: "system", text: 'Idle branches cost structure, not compute.' }
    ],
    unlocks: []
  },
  {
    id: 14,
    title: 'Level 14 — One output can feed many operators.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 14' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Fan-out is normal.' },
      { speaker: "system", text: 'One output can feed many operators.' },
      { speaker: "system", text: 'Shared sources keep systems consistent.' }
    ],
    unlocks: []
  },
  {
    id: 15,
    title: 'Level 15 — Some operators require multiple inputs.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 15' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Some operators combine sources.' },
      { speaker: "system", text: 'They require multiple inputs to produce results.' },
      { speaker: "system", text: 'Missing an input changes or blocks output.' }
    ],
    unlocks: []
  },
  {
    id: 16,
    title: 'Level 16 — Types must match.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 16' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Connections obey type rules.' },
      { speaker: "system", text: 'Types must match between endpoints.' },
      { speaker: "system", text: 'Mismatch produces invalid or empty results.' }
    ],
    unlocks: []
  },
  {
    id: 17,
    title: 'Level 17 — Conversion operators exist.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 17' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Mismatch is not always fatal.' },
      { speaker: "system", text: 'Conversion operators bridge domains.' },
      { speaker: "system", text: 'Convert intentionally and verify meaning.' }
    ],
    unlocks: []
  },
  {
    id: 18,
    title: 'Level 18 — Operators can maintain internal state.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 18' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Not every node is stateless.' },
      { speaker: "system", text: 'Some operators maintain internal state.' },
      { speaker: "system", text: 'State changes how repeated cooks behave.' }
    ],
    unlocks: []
  },
  {
    id: 19,
    title: 'Level 19 — State persists between evaluations.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 19' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'State survives the current slice.' },
      { speaker: "system", text: 'It persists between evaluations.' },
      { speaker: "system", text: 'Current output can depend on prior history.' }
    ],
    unlocks: []
  },
  {
    id: 20,
    title: 'Level 20 — Accumulation over time.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 20' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Persistence enables accumulation.' },
      { speaker: "system", text: 'Accumulation over time creates trends.' },
      { speaker: "system", text: 'Reset state when you need clean measurement.' }
    ],
    unlocks: []
  },
  {
    id: 21,
    title: 'Level 21 — Time can be used as data.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 21' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Time is not just a clock.' },
      { speaker: "system", text: 'Time can be used as data.' },
      { speaker: "system", text: 'Drive systems with time when behavior must evolve.' }
    ],
    unlocks: []
  },
  {
    id: 22,
    title: 'Level 22 — 2D and 3D are separate domains.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 22' },
      { speaker: "system", text: '' },
      { speaker: "system", text: '2D and 3D are separate domains.' },
      { speaker: "system", text: 'They use different operators and assumptions.' },
      { speaker: "system", text: 'Crossing domains requires explicit conversion.' }
    ],
    unlocks: []
  },
  {
    id: 23,
    title: 'Level 23 — Rendering is separate from geometry.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 23' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Geometry defines structure.' },
      { speaker: "system", text: 'Rendering defines how structure is viewed.' },
      { speaker: "system", text: 'Keep modeling and viewing concerns separate.' }
    ],
    unlocks: []
  },
  {
    id: 24,
    title: 'Level 24 — Containers hold sub-networks.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 24' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Large systems need grouping.' },
      { speaker: "system", text: 'Containers hold sub-networks.' },
      { speaker: "system", text: 'Grouping improves scope and reuse.' }
    ],
    unlocks: []
  },
  {
    id: 25,
    title: 'Level 25 — Evaluation order is graph-based.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 25' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Order follows dependency graph.' },
      { speaker: "system", text: 'Position on screen does not define execution order.' },
      { speaker: "system", text: 'Read wires, not layout, to predict timing.' }
    ],
    unlocks: []
  },
  {
    id: 26,
    title: 'Level 26 — Structure affects readability.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 26' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Readable structure is a performance tool for humans.' },
      { speaker: "system", text: 'Clear layout reduces mistakes during edits.' },
      { speaker: "system", text: 'Design graphs for future inspection.' }
    ],
    unlocks: []
  },
  {
    id: 27,
    title: 'Level 27 — Debugging means tracing dependencies.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 27' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Debugging starts at the symptom.' },
      { speaker: "system", text: 'Then trace dependencies upstream.' },
      { speaker: "system", text: 'Stop when the first wrong value appears.' }
    ],
    unlocks: []
  },
  {
    id: 28,
    title: 'Level 28 — Performance depends on cooking paths.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 28' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Performance follows demand paths.' },
      { speaker: "system", text: 'Long cooking paths cost more time.' },
      { speaker: "system", text: 'Trim unnecessary dependencies to recover speed.' }
    ],
    unlocks: []
  },
  {
    id: 29,
    title: 'Level 29 — Automatic playback vs manual stepping.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 29' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Automatic playback favors continuity.' },
      { speaker: "system", text: 'Manual stepping favors inspection.' },
      { speaker: "system", text: 'Use the mode that fits the question.' }
    ],
    unlocks: []
  },
  {
    id: 30,
    title: 'Level 30 — Full translation reveal and system summary.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 30' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Formal summary: the evaluation model is complete.' },
      { speaker: "system", text: 'Translation mode is now active (translationMode enabled).' },
      { speaker: "system", text: 'TouchDesigner terms are now explicit (OP, TOP, CHOP, SOP, DAT, COMP).' },
      { speaker: "system", text: 'System statement: request-driven cooking propagates through typed operator dependencies.' }
    ],
    unlocks: ['translationMode']
  }
];
