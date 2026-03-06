export const LEVELS = [
  {
    id: 1,
    title: 'Level 1 — Clipboard is a status report.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 1', highlight: null },
      {
        speaker: "system",
        text: "The whole reason you're here is to watch the clipboard.",
        highlight: 'clipboard'
      },
      {
        speaker: "system",
        text: "It's a status report of what goes on in the machine.",
        highlight: 'clipboard'
      },
      { speaker: "system", text: 'This panel is the Break Room.', highlight: 'breakroom' },
      {
        speaker: "system",
        text: 'Workers wait here until you put them on the line.',
        highlight: 'breakroom'
      },
      { speaker: "system", text: 'This panel is the Factory Floor.', highlight: 'factory' },
      {
        speaker: "system",
        text: 'This is where the workers actually do their jobs.',
        highlight: 'factory'
      },
      {
        speaker: "system",
        text: 'The Break Room and the Factory Floor together make the machine.',
        highlight: 'machine'
      }
    ],
    unlocks: []
  },
  {
    id: 2,
    title: 'Level 2 — The machine is already running.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 2' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Do not wait for startup.' },
      { speaker: "system", text: 'The machine is already running.' },
      { speaker: "system", text: 'Your job is to inspect and guide it.' }
    ],
    unlocks: []
  },
  {
    id: 3,
    title: 'Level 3 — The machine needs something to work on.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 3' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Running is not enough.' },
      { speaker: "system", text: 'The machine needs something to process.' },
      { speaker: "system", text: 'No input means no meaningful result.' }
    ],
    unlocks: []
  },
  {
    id: 4,
    title: 'Level 4 — Data domains exist.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 4' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Data has families.' },
      { speaker: "system", text: 'Common domains are image, number, geometry, and text.' },
      { speaker: "system", text: 'Treat each domain as distinct.' }
    ],
    unlocks: []
  },
  {
    id: 5,
    title: 'Level 5 — Operators are typed.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 5' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Each operator has a type.' },
      { speaker: "system", text: 'Type defines what it can accept and produce.' },
      { speaker: "system", text: 'Choose operators by type, not by name alone.' }
    ],
    unlocks: []
  },
  {
    id: 6,
    title: 'Level 6 — Operators have inputs and outputs.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 6' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Every operator receives data.' },
      { speaker: "system", text: 'Every operator emits data.' },
      { speaker: "system", text: 'Trace both ends before judging behavior.' }
    ],
    unlocks: []
  },
  {
    id: 7,
    title: 'Level 7 — Connections define dependency.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 7' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'A wire means dependency.' },
      { speaker: "system", text: 'Downstream results depend on upstream values.' },
      { speaker: "system", text: 'Connection order defines influence.' }
    ],
    unlocks: []
  },
  {
    id: 8,
    title: 'Level 8 — Output is not display.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 8' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Output exists before you see it.' },
      { speaker: "system", text: 'Display is only one consumer.' },
      { speaker: "system", text: 'Do not confuse visibility with existence.' }
    ],
    unlocks: []
  },
  {
    id: 9,
    title: 'Level 9 — Evaluation happens in discrete slices.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 9' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Evaluation is stepwise.' },
      { speaker: "system", text: 'Each step is a discrete slice in time.' },
      { speaker: "system", text: 'Compare slices to detect change.' }
    ],
    unlocks: []
  },
  {
    id: 10,
    title: 'Level 10 — Motion is repeated evaluation.',
    dialogue: [
      { speaker: "system", text: 'LEVEL 10' },
      { speaker: "system", text: '' },
      { speaker: "system", text: 'Motion is not magic.' },
      { speaker: "system", text: 'Motion is repeated evaluation across slices.' },
      { speaker: "system", text: 'Stable repetition creates predictable movement.' }
    ],
    unlocks: []
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
