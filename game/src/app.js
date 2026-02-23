import { createInitialState } from './state.js';
import { renderAll } from './ui.js';

function setupControls() {
  const resetButton = document.getElementById('reset-button');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

function initializeApp() {
  const state = createInitialState();
  setupControls();
  renderAll(state);
}

document.addEventListener('DOMContentLoaded', initializeApp);
