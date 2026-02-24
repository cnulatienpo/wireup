export const level01 = {
  id: 'level01',
  title: 'Project 1: Taco Truck Emergency',
  introLines: [
    "LEVEL 1\n\nThe whole reason you're here is to watch the clipboard. It's a status report of what goes on in the machine.",
    'Step 2 — The Machine\n\nZoom out.\n\nNow you see the machine.\n\nThe machine is already running.\n\nThis matters.\n\nYou are not building the machine.\n\nYou are using a machine that is already alive.\n\nIt is waiting for something to work on.'
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
