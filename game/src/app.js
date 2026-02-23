import { LEVELS } from './levels/index.js';
import { advanceNarration, createInitialState, loadLevel } from './state.js';
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

  const setStateAndRender = (nextState) => {
    state = nextState;
    renderAll(state);
  };

  setupControls(() => state, setStateAndRender);
  renderAll(state);
}

document.addEventListener('DOMContentLoaded', initializeApp);
