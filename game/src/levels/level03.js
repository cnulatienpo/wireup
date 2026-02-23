export const level03 = {
  id: 'level03',
  title: 'Project 3: Metallica Came On',
  introLines: [
    'Someone cranks Metallica in the warehouse. Everything starts feeling dramatic.',
    'The lights pulse like a music video and nobody can hear normal talking.',
    'Ray Ray points at Mr Volume and nods like a roadie.'
  ],
  goalLines: [
    'Put Mr Volume on the line and enable Pulse in the How card.',
    'Feed numbers input.',
    'Switch clipboard to auto mode for movie look behavior.'
  ],
  allowedWorkers: ['chop-mr-volume'],
  wrongHintLines: ['Worker note: “Auto mode is just faster manual clicks, no behavior change.”'],
  rayRayTruthLines: [
    'Auto mode asks for updates over and over. (Continuous cook requests with advancing timeline.)',
    'Pulse drives changing values over time. (CHOP channel signal used per tick.)'
  ],
  requiredGoalChecks: [
    (state) => state.mainLineNodeIds.length === 1 && state.lineNodes[0]?.typeId === 'chop-mr-volume',
    (state) => {
      const firstNode = state.lineNodes.find((node) => node.id === state.mainLineNodeIds[0]);
      return Boolean(firstNode?.params?.pulse);
    },
    (state) => state.clipboard.mode === 'auto'
  ]
};
