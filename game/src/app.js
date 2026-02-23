import {
  addNodeToLine,
  advanceNarration,
  createInitialState,
  feedInput,
  getCompatibleInventoryForNode,
  loadLevel,
  pressStatus,
  splitOutput
} from './state.js';
import { LEVELS } from './levels/index.js';
import { renderAll } from './ui.js';

function setupControls(getState, setStateAndRender) {
  const resetButton = document.getElementById('reset-button');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      window.location.reload();
    });
  }

  const continueButton = document.getElementById('continue-button');
  if (continueButton) {
    continueButton.addEventListener('click', () => {
      const nextState = advanceNarration(getState());
      setStateAndRender(nextState);
    });
  }

  const nextButton = document.getElementById('next-button');
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (getState().narration.mode !== 'none') {
        return;
      }
      window.alert('Gameplay starts next step');
    });
  }
}

function initializeApp() {
  let state = loadLevel(createInitialState(), LEVELS[0]);

  const actions = {
    onSendToLine: (workerTypeId) => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = addNodeToLine(state, workerTypeId);
      setStateAndRender(nextState);
    },
    onFeedInput: (itemId) => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = feedInput(state, itemId);
      setStateAndRender(nextState);
    },
    getCompatibleItemsForNode: (node) => getCompatibleInventoryForNode(state, node),
    onSplitOutput: (nodeId) => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = splitOutput(state, nodeId);
      setStateAndRender(nextState);
    },
    onPressStatus: () => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = pressStatus(state);
      setStateAndRender(nextState);
    }
  };

  const setStateAndRender = (nextState) => {
    state = nextState;
    renderAll(state, actions);
  };

  setupControls(() => state, setStateAndRender);
  renderAll(state, actions);
}

document.addEventListener('DOMContentLoaded', initializeApp);
