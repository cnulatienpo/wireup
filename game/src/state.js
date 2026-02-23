const WORKER_TYPES = [
  {
    id: 'top-mr-draw',
    displayName: 'Mr Draw',
    tdFamilyLabel: 'TOP (Texture Operator)',
    descriptionEli5: 'I paint pictures on things so they look right.',
    descriptionTd: 'Creates and processes image textures used by materials and lookdev.'
  },
  {
    id: 'chop-mr-volume',
    displayName: 'Mr Volume',
    tdFamilyLabel: 'CHOP (Channel Operator)',
    descriptionEli5: 'I handle changing numbers over time like music beats.',
    descriptionTd: 'Processes time-sliced channel data for animation, control, and signals.'
  },
  {
    id: 'sop-mr-bones',
    displayName: 'Mr Bones',
    tdFamilyLabel: 'SOP (Surface Operator)',
    descriptionEli5: 'I build and change 3D shapes you can see.',
    descriptionTd: 'Generates and modifies geometric surfaces and point data.'
  },
  {
    id: 'comp-mr-box',
    displayName: 'Mr Box',
    tdFamilyLabel: 'COMP (Component)',
    descriptionEli5: 'I hold tools together in little boxes so projects stay tidy.',
    descriptionTd: 'Encapsulates networks, UI, and behaviors into reusable component hierarchies.'
  },
  {
    id: 'dat-mr-plan',
    displayName: 'Mr Plan',
    tdFamilyLabel: 'DAT (Data Operator)',
    descriptionEli5: 'I read and write words and tables for instructions.',
    descriptionTd: 'Manages structured and unstructured text/tabular data for logic and configuration.'
  },
  {
    id: 'pop-mr-move',
    displayName: 'Mr Move',
    tdFamilyLabel: 'POP (Particle Operator)',
    descriptionEli5: 'I move lots of tiny dots around like swarms.',
    descriptionTd: 'Simulates and updates particle systems and related motion attributes.'
  }
];

export function createInitialState() {
  return {
    levelId: 'level01',
    breakRoomTypes: WORKER_TYPES.map((worker) => ({ ...worker })),
    lineNodes: [],
    connections: [],
    clipboard: {
      mode: 'manual',
      lastReport: ''
    },
    inventory: [],
    flags: {}
  };
}
