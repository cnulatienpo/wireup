export const RAYRAY_SUCCESS_LINES = [
  'You may proceed.',
  'Order is restored.',
  'The procession may continue.',
  'The machine accepts your command.',
  'ok, den.',
  'everything is in readiness, sire.',
  'righto,',
  'The passage stands open.',
  'The work is properly arranged.',
  'The engine obeys.',
  'The line is in correct formation.',
  'The numbers now comply.',
  'The report reflects reality.',
  'Balance has been achieved.',
  'The circuit acknowledges you.',
  'The mechanism consents.',
  'The assembly is satisfied.',
  'The sequence stands in dignity.',
  'The operation is sanctioned.',
  'The line is aligned.',
  'The machine is appeased.',
  'The arrangement is lawful.',
  'Proceed under my authority.'
];

export function getRandomRayRayLine() {
  const index = Math.floor(Math.random() * RAYRAY_SUCCESS_LINES.length);
  return RAYRAY_SUCCESS_LINES[index];
}
