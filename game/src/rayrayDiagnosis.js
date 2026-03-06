export const RAYRAY_DIAGNOSIS = {
  inputMissing: [
    'Blank status report. No input.',
    'You didn’t give the machine the thing to work on.',
    'The engine has nothing to change.',
    'The line is empty.'
  ],
  howMissing: [
    'Numbers are still the same.',
    'You gotta tell him how.',
    'The order is unwritten.',
    'No instructions.'
  ],
  beltMissing: [
    'No passage.',
    'They ain’t connected.',
    'Draw the belt.',
    'He can’t get the thing to change.'
  ],
  wrongOrder: [
    'Wrong order.',
    'The thing moves this way.',
    'Reverse the line.',
    'The procession is backward.'
  ],
  statusNotPressed: [
    'The machine changed. The report didn’t.',
    'Push the button.',
    'Stale report.',
    'You’re looking at the old result.'
  ],
  volumeWithoutDraw: [
    'He only changes strength.',
    'That’s just brighter.',
    'He speaks in numbers.',
    'No color was chosen.'
  ],
  rare: [
    'You built it. Now use it.',
    'It hums correctly.',
    'The flow is honorable.',
    'The belt carries its burden.',
    'The numbers obey their station.',
    'This pleases the mechanism.'
  ]
};

export function getRayRayDiagnosis(type) {
  const list = RAYRAY_DIAGNOSIS[type];
  if (!list) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}
