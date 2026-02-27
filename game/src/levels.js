export const LEVELS = [
  {
    id: 1,
    title: 'Level 1 — Clipboard is a status report.',
    dialogue: [
      'LEVEL 1',
      '',
      'Read the clipboard first.',
      'It reports machine status.',
      'It is evidence, not decoration.'
    ],
    unlocks: []
  },
  {
    id: 2,
    title: 'Level 2 — The machine is already running.',
    dialogue: [
      'LEVEL 2',
      '',
      'Do not wait for startup.',
      'The machine is already running.',
      'Your job is to inspect and guide it.'
    ],
    unlocks: []
  },
  {
    id: 3,
    title: 'Level 3 — The machine needs something to work on.',
    dialogue: [
      'LEVEL 3',
      '',
      'Running is not enough.',
      'The machine needs something to process.',
      'No input means no meaningful result.'
    ],
    unlocks: []
  },
  {
    id: 4,
    title: 'Level 4 — Data domains exist.',
    dialogue: [
      'LEVEL 4',
      '',
      'Data has families.',
      'Common domains are image, number, geometry, and text.',
      'Treat each domain as distinct.'
    ],
    unlocks: []
  },
  {
    id: 5,
    title: 'Level 5 — Operators are typed.',
    dialogue: [
      'LEVEL 5',
      '',
      'Each operator has a type.',
      'Type defines what it can accept and produce.',
      'Choose operators by type, not by name alone.'
    ],
    unlocks: []
  },
  {
    id: 6,
    title: 'Level 6 — Operators have inputs and outputs.',
    dialogue: [
      'LEVEL 6',
      '',
      'Every operator receives data.',
      'Every operator emits data.',
      'Trace both ends before judging behavior.'
    ],
    unlocks: []
  },
  {
    id: 7,
    title: 'Level 7 — Connections define dependency.',
    dialogue: [
      'LEVEL 7',
      '',
      'A wire means dependency.',
      'Downstream results depend on upstream values.',
      'Connection order defines influence.'
    ],
    unlocks: []
  },
  {
    id: 8,
    title: 'Level 8 — Output is not display.',
    dialogue: [
      'LEVEL 8',
      '',
      'Output exists before you see it.',
      'Display is only one consumer.',
      'Do not confuse visibility with existence.'
    ],
    unlocks: []
  },
  {
    id: 9,
    title: 'Level 9 — Evaluation happens in discrete slices.',
    dialogue: [
      'LEVEL 9',
      '',
      'Evaluation is stepwise.',
      'Each step is a discrete slice in time.',
      'Compare slices to detect change.'
    ],
    unlocks: []
  },
  {
    id: 10,
    title: 'Level 10 — Motion is repeated evaluation.',
    dialogue: [
      'LEVEL 10',
      '',
      'Motion is not magic.',
      'Motion is repeated evaluation across slices.',
      'Stable repetition creates predictable movement.'
    ],
    unlocks: []
  },
  {
    id: 11,
    title: 'Level 11 — Cooking only happens when requested.',
    dialogue: [
      'LEVEL 11',
      '',
      'Cooking is demand-driven.',
      'No request means no cook.',
      'Do not assume every node updates continuously.'
    ],
    unlocks: []
  },
  {
    id: 12,
    title: 'Level 12 — Requests travel upstream.',
    dialogue: [
      'LEVEL 12',
      '',
      'Demand starts at a consumer.',
      'The request travels upstream for required data.',
      'Follow demand direction when debugging.'
    ],
    unlocks: []
  },
  {
    id: 13,
    title: 'Level 13 — Unused branches do not cook.',
    dialogue: [
      'LEVEL 13',
      '',
      'Disconnected demand means idle branches.',
      'Unused branches do not cook.',
      'Idle branches cost structure, not compute.'
    ],
    unlocks: []
  },
  {
    id: 14,
    title: 'Level 14 — One output can feed many operators.',
    dialogue: [
      'LEVEL 14',
      '',
      'Fan-out is normal.',
      'One output can feed many operators.',
      'Shared sources keep systems consistent.'
    ],
    unlocks: []
  },
  {
    id: 15,
    title: 'Level 15 — Some operators require multiple inputs.',
    dialogue: [
      'LEVEL 15',
      '',
      'Some operators combine sources.',
      'They require multiple inputs to produce results.',
      'Missing an input changes or blocks output.'
    ],
    unlocks: []
  },
  {
    id: 16,
    title: 'Level 16 — Types must match.',
    dialogue: [
      'LEVEL 16',
      '',
      'Connections obey type rules.',
      'Types must match between endpoints.',
      'Mismatch produces invalid or empty results.'
    ],
    unlocks: []
  },
  {
    id: 17,
    title: 'Level 17 — Conversion operators exist.',
    dialogue: [
      'LEVEL 17',
      '',
      'Mismatch is not always fatal.',
      'Conversion operators bridge domains.',
      'Convert intentionally and verify meaning.'
    ],
    unlocks: []
  },
  {
    id: 18,
    title: 'Level 18 — Operators can maintain internal state.',
    dialogue: [
      'LEVEL 18',
      '',
      'Not every node is stateless.',
      'Some operators maintain internal state.',
      'State changes how repeated cooks behave.'
    ],
    unlocks: []
  },
  {
    id: 19,
    title: 'Level 19 — State persists between evaluations.',
    dialogue: [
      'LEVEL 19',
      '',
      'State survives the current slice.',
      'It persists between evaluations.',
      'Current output can depend on prior history.'
    ],
    unlocks: []
  },
  {
    id: 20,
    title: 'Level 20 — Accumulation over time.',
    dialogue: [
      'LEVEL 20',
      '',
      'Persistence enables accumulation.',
      'Accumulation over time creates trends.',
      'Reset state when you need clean measurement.'
    ],
    unlocks: []
  },
  {
    id: 21,
    title: 'Level 21 — Time can be used as data.',
    dialogue: [
      'LEVEL 21',
      '',
      'Time is not just a clock.',
      'Time can be used as data.',
      'Drive systems with time when behavior must evolve.'
    ],
    unlocks: []
  },
  {
    id: 22,
    title: 'Level 22 — 2D and 3D are separate domains.',
    dialogue: [
      'LEVEL 22',
      '',
      '2D and 3D are separate domains.',
      'They use different operators and assumptions.',
      'Crossing domains requires explicit conversion.'
    ],
    unlocks: []
  },
  {
    id: 23,
    title: 'Level 23 — Rendering is separate from geometry.',
    dialogue: [
      'LEVEL 23',
      '',
      'Geometry defines structure.',
      'Rendering defines how structure is viewed.',
      'Keep modeling and viewing concerns separate.'
    ],
    unlocks: []
  },
  {
    id: 24,
    title: 'Level 24 — Containers hold sub-networks.',
    dialogue: [
      'LEVEL 24',
      '',
      'Large systems need grouping.',
      'Containers hold sub-networks.',
      'Grouping improves scope and reuse.'
    ],
    unlocks: []
  },
  {
    id: 25,
    title: 'Level 25 — Evaluation order is graph-based.',
    dialogue: [
      'LEVEL 25',
      '',
      'Order follows dependency graph.',
      'Position on screen does not define execution order.',
      'Read wires, not layout, to predict timing.'
    ],
    unlocks: []
  },
  {
    id: 26,
    title: 'Level 26 — Structure affects readability.',
    dialogue: [
      'LEVEL 26',
      '',
      'Readable structure is a performance tool for humans.',
      'Clear layout reduces mistakes during edits.',
      'Design graphs for future inspection.'
    ],
    unlocks: []
  },
  {
    id: 27,
    title: 'Level 27 — Debugging means tracing dependencies.',
    dialogue: [
      'LEVEL 27',
      '',
      'Debugging starts at the symptom.',
      'Then trace dependencies upstream.',
      'Stop when the first wrong value appears.'
    ],
    unlocks: []
  },
  {
    id: 28,
    title: 'Level 28 — Performance depends on cooking paths.',
    dialogue: [
      'LEVEL 28',
      '',
      'Performance follows demand paths.',
      'Long cooking paths cost more time.',
      'Trim unnecessary dependencies to recover speed.'
    ],
    unlocks: []
  },
  {
    id: 29,
    title: 'Level 29 — Automatic playback vs manual stepping.',
    dialogue: [
      'LEVEL 29',
      '',
      'Automatic playback favors continuity.',
      'Manual stepping favors inspection.',
      'Use the mode that fits the question.'
    ],
    unlocks: []
  },
  {
    id: 30,
    title: 'Level 30 — Full translation reveal and system summary.',
    dialogue: [
      'LEVEL 30',
      '',
      'Formal summary: the evaluation model is complete.',
      'Translation mode is now active (translationMode enabled).',
      'TouchDesigner terms are now explicit (OP, TOP, CHOP, SOP, DAT, COMP).',
      'System statement: request-driven cooking propagates through typed operator dependencies.'
    ],
    unlocks: ['translationMode']
  }
];
