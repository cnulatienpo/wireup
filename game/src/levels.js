const baseDialogue = (id, focus, lesson) => [
  `LEVEL ${id}`,
  '',
  focus,
  lesson
];

export const LEVELS = [
  {
    id: 1,
    title: 'LEVEL 1 — The Clipboard',
    dialogue: [
      'LEVEL 1',
      '',
      "The whole reason you're here is to watch the clipboard.",
      "It's a status report of what goes on in the machine."
    ],
    unlocks: []
  },
  {
    id: 2,
    title: 'LEVEL 2 — The First Worker',
    dialogue: baseDialogue(2, 'The line only starts when a worker is placed.', 'You are wiring behavior, not building a new machine.'),
    unlocks: []
  },
  {
    id: 3,
    title: 'LEVEL 3 — Inputs Matter',
    dialogue: baseDialogue(3, 'Workers still need matching input before status means anything.', 'Bad input gives bad output, even with perfect wiring.'),
    unlocks: []
  },
  {
    id: 4,
    title: 'LEVEL 4 — Status Timing',
    dialogue: baseDialogue(4, 'Status is a snapshot of the moment you ask for it.', 'Read reports like evidence, not decoration.'),
    unlocks: []
  },
  {
    id: 5,
    title: 'LEVEL 5 — Controlled Rhythm',
    dialogue: baseDialogue(5, 'Some lines need repeated checks to reveal patterns.', 'Consistency is how operators spot drifting behavior.'),
    unlocks: []
  },
  {
    id: 6,
    title: 'LEVEL 6 — Forked Paths',
    dialogue: baseDialogue(6, 'A split path only matters if something consumes it.', 'Unused branches are noise until connected to demand.'),
    unlocks: []
  },
  {
    id: 7,
    title: 'LEVEL 7 — Pulse Literacy',
    dialogue: baseDialogue(7, 'Signals change over time even when the UI looks calm.', 'Read values over time, not just one frame.'),
    unlocks: []
  },
  {
    id: 8,
    title: 'LEVEL 8 — Memory in Motion',
    dialogue: baseDialogue(8, 'History tells you where a system has been.', 'Reliable pipelines keep useful traces.'),
    unlocks: []
  },
  {
    id: 9,
    title: 'LEVEL 9 — Intentional Branching',
    dialogue: baseDialogue(9, 'Every branch should answer a question.', 'If a branch solves nothing, it is technical debt.'),
    unlocks: []
  },
  {
    id: 10,
    title: 'LEVEL 10 — Operational Calm',
    dialogue: baseDialogue(10, 'Slow down and verify the fundamentals.', 'Stability starts with repeatable checks.'),
    unlocks: []
  },
  {
    id: 11,
    title: 'LEVEL 11 — Reading the Line',
    dialogue: baseDialogue(11, 'Node order defines meaning in the report.', 'Sequence is part of logic, not just layout.'),
    unlocks: []
  },
  {
    id: 12,
    title: 'LEVEL 12 — Input Discipline',
    dialogue: baseDialogue(12, 'The first worker defines the line entry contract.', 'Respect the contract and the rest can cook.'),
    unlocks: []
  },
  {
    id: 13,
    title: 'LEVEL 13 — Quiet Diagnostics',
    dialogue: baseDialogue(13, 'A good operator can debug with very little output.', 'Small clues beat loud guesses.'),
    unlocks: []
  },
  {
    id: 14,
    title: 'LEVEL 14 — Signal and Shape',
    dialogue: baseDialogue(14, 'Some jobs blend numeric rhythm with geometric form.', 'Cross-domain thinking is core factory work.'),
    unlocks: []
  },
  {
    id: 15,
    title: 'LEVEL 15 — Midline Review',
    dialogue: baseDialogue(15, 'Halfway means standards rise, not rest.', 'From here on, precision is assumed.'),
    unlocks: []
  },
  {
    id: 16,
    title: 'LEVEL 16 — Reliable Reports',
    dialogue: baseDialogue(16, 'Clipboard logs should be readable under pressure.', 'If humans cannot scan it fast, rewrite it.'),
    unlocks: []
  },
  {
    id: 17,
    title: 'LEVEL 17 — Faster Loops',
    dialogue: baseDialogue(17, 'Auto mode reveals behavior that manual mode misses.', 'Cadence changes what you can observe.'),
    unlocks: []
  },
  {
    id: 18,
    title: 'LEVEL 18 — Slower Truths',
    dialogue: baseDialogue(18, 'Sometimes slowing the clock is the fix.', 'Visibility beats speed during diagnosis.'),
    unlocks: []
  },
  {
    id: 19,
    title: 'LEVEL 19 — Defensive Wiring',
    dialogue: baseDialogue(19, 'Assume bad input will eventually arrive.', 'Design line behavior so failures are obvious.'),
    unlocks: []
  },
  {
    id: 20,
    title: 'LEVEL 20 — Branch Hygiene',
    dialogue: baseDialogue(20, 'Delete or justify every side path mentally.', 'Clean graphs reduce report ambiguity.'),
    unlocks: []
  },
  {
    id: 21,
    title: 'LEVEL 21 — Pattern Detection',
    dialogue: baseDialogue(21, 'Repeated status lines are data, not boredom.', 'Trends are where hidden issues live.'),
    unlocks: []
  },
  {
    id: 22,
    title: 'LEVEL 22 — Communication Layer',
    dialogue: baseDialogue(22, 'Reports are for teammates as much as for you.', 'Narrate what changed and why it matters.'),
    unlocks: []
  },
  {
    id: 23,
    title: 'LEVEL 23 — Operator Confidence',
    dialogue: baseDialogue(23, 'Confidence comes from checks, not intuition alone.', 'You can trust the line you can explain.'),
    unlocks: []
  },
  {
    id: 24,
    title: 'LEVEL 24 — Converging Signals',
    dialogue: baseDialogue(24, 'Different data families still tell one story.', 'Unify observations before deciding next actions.'),
    unlocks: []
  },
  {
    id: 25,
    title: 'LEVEL 25 — Late-Stage Discipline',
    dialogue: baseDialogue(25, 'At this depth, small sloppiness compounds fast.', 'Maintain sharp logs and controlled edits.'),
    unlocks: []
  },
  {
    id: 26,
    title: 'LEVEL 26 — Nearing Graduation',
    dialogue: baseDialogue(26, 'You now read the machine like a language.', 'Final steps test consistency under routine pressure.'),
    unlocks: []
  },
  {
    id: 27,
    title: 'LEVEL 27 — Final Rehearsal',
    dialogue: baseDialogue(27, 'Rehearse clean runs with no skipped checks.', 'Professional work is boring on purpose.'),
    unlocks: []
  },
  {
    id: 28,
    title: 'LEVEL 28 — Audit Pass',
    dialogue: baseDialogue(28, 'Assume someone audits every report line.', 'Make each line defensible.'),
    unlocks: []
  },
  {
    id: 29,
    title: 'LEVEL 29 — Threshold',
    dialogue: baseDialogue(29, 'One final pass before graduation protocol.', 'Finish strong; no shortcuts now.'),
    unlocks: []
  },
  {
    id: 30,
    title: 'LEVEL 30 — Graduation',
    dialogue: [
      'LEVEL 30',
      '',
      'You completed the full line progression.',
      'Translation mode is now unlocked for bilingual UI labels.'
    ],
    unlocks: ['translationMode']
  }
];
