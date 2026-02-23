export const level04 = {
  id: 'level04',
  title: 'Project 4: New Guy Orientation',
  introLines: [
    'A brand-new worker asks if geometry is “just crunchy video.”',
    'Before you can answer, they try shoving random supplies into Mr Draw.',
    'Ray Ray takes a deep breath and smiles politely.'
  ],
  goalLines: [
    'Place Mr Draw on the line.',
    'Try feeding one wrong supply item first.',
    'Then feed the correct video item.'
  ],
  allowedWorkers: ['top-mr-draw'],
  wrongHintLines: ['Worker note: “Compatible means eventually it will work if you click enough.”'],
  rayRayTruthLines: [
    'Some workers only accept specific input kinds. (Operator input contract / type compatibility.)'
  ],
  requiredGoalChecks: [
    (state) => state.mainLineNodeIds.length === 1 && state.lineNodes[0]?.typeId === 'top-mr-draw',
    (state) => state.flags.incompatibleAttempted,
    (state) => {
      const firstNode = state.lineNodes.find((node) => node.id === state.mainLineNodeIds[0]);
      const inputId = firstNode?.inputs?.[0] || '';
      return inputId === 'inv_video_clip';
    }
  ]
};
