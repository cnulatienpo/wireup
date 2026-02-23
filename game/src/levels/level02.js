export const level02 = {
  id: 'level02',
  title: 'Project 2: Union Steward Inspection',
  introLines: [
    'A union steward walks in holding a clipboard and a very serious donut.',
    'They ask whether you understand side branches or if you are “just clicking buttons.”',
    'Ray Ray whispers: “We got this. Probably.”'
  ],
  goalLines: [
    'Build at least two workers in line.',
    'Split one output so one branch is not connected to clipboard path.',
    'Run status and observe the idle branch idea.'
  ],
  allowedWorkers: ['top-mr-draw', 'dat-mr-plan'],
  wrongHintLines: ['Worker note: “If you split output, both branches always cook.”'],
  rayRayTruthLines: [
    'That side line is idle. Nobody is asking it to work. (Unused branch not cooking: not downstream of an active viewer/output.)'
  ],
  requiredGoalChecks: [
    (state) => state.mainLineNodeIds.length >= 2,
    (state) => {
      const main = new Set(state.mainLineNodeIds || []);
      return state.connections.some((connection) => main.has(connection.fromNodeId) && !main.has(connection.toNodeId));
    },
    (state) => state.flags.statusPressed
  ]
};
