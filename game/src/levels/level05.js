export const level05 = {
  id: 'level05',
  title: 'Project 5: Deep Room Tour',
  introLines: [
    'Ray Ray opens a heavy door labeled DEEP ROOM and dust goes everywhere.',
    'Inside is Mr Bones wearing safety goggles and holding geometry like treasure.',
    'You are told to prove clipboard can report this room too.'
  ],
  goalLines: [
    'Place Mr Bones on line.',
    'Feed geometry input to Mr Bones.',
    'Press status and confirm Deep Room text preview appears.'
  ],
  allowedWorkers: ['sop-mr-bones'],
  wrongHintLines: ['Worker note: “Clipboard only understands flat video lines, not deep room jobs.”'],
  rayRayTruthLines: [
    'Clipboard can report any cooked branch result text. (Viewer/status output can summarize SOP pipeline state.)'
  ],
  requiredGoalChecks: [
    (state) => state.mainLineNodeIds.length === 1 && state.lineNodes[0]?.typeId === 'sop-mr-bones',
    (state) => {
      const firstNode = state.lineNodes.find((node) => node.id === state.mainLineNodeIds[0]);
      const inputId = firstNode?.inputs?.[0] || '';
      return inputId === 'inv_tube_shape';
    },
    (state) => state.clipboard.lastReport.includes('Deep Room text preview')
  ]
};
