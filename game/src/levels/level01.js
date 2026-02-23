export const level01 = {
  id: 'level01',
  title: 'Project 1: Taco Truck Emergency',
  introLines: [
    'Lunch siren hits. Entire crew vanishes toward street tacos.',
    'You hear someone yell, “Boss, don’t break the line!” from the parking lot.',
    'Ray Ray slides over a marker and says this is your moment.'
  ],
  goalLines: [
    'Build chain: Mr Draw -> Clipboard.',
    'Feed video input into Mr Draw.',
    'Run manual status once.'
  ],
  allowedWorkers: ['top-mr-draw'],
  wrongHintLines: [
    'Worker note: “Any worker can eat any supply item.”',
    'Worker note: “Status only works in auto mode.”'
  ],
  rayRayTruthLines: [
    'Only matching items fit the first worker. (Input compatibility by operator family.)',
    'Manual status works anytime. (Viewer cook request can be triggered interactively.)'
  ],
  requiredGoalChecks: [
    (state) => state.mainLineNodeIds.length === 1 && state.lineNodes[0]?.typeId === 'top-mr-draw',
    (state) => {
      const firstNode = state.lineNodes.find((node) => node.id === state.mainLineNodeIds[0]);
      return Boolean(firstNode?.inputs?.[0]);
    },
    (state) => state.flags.statusPressed
  ]
};
