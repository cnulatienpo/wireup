import {
  addNodeToLine,
  adjustTimeInterval,
  advanceNarration,
  createInitialState,
  feedInput,
  goToNextLevel,
  loadLevel,
  pressStatus,
  setClipboardAutoMode,
  setNodeParam,
  splitOutput,
  tickTime
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

  const continueButton = document.getElementById('continue-btn');
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
      const nextState = goToNextLevel(getState(), LEVELS);
      setStateAndRender(nextState);
    });
  }
}

function initializeApp() {
  let state = loadLevel(createInitialState(), LEVELS[0], 0, LEVELS.length);
  let autoTickHandle = null;

  const stopAutoTicker = () => {
    if (autoTickHandle !== null) {
      window.clearInterval(autoTickHandle);
      autoTickHandle = null;
    }
  };

  const runAutoCycle = () => {
    if (state.clipboard.mode !== 'auto' || !state.time.running || state.narration.mode !== 'none') {
      return;
    }

    const advanced = tickTime(state);
    const evaluated = pressStatus(advanced);
    setStateAndRender(evaluated);
  };

  const syncAutoTicker = () => {
    stopAutoTicker();

    if (state.clipboard.mode === 'auto' && state.time.running && state.narration.mode === 'none') {
      autoTickHandle = window.setInterval(runAutoCycle, state.time.dt);
    }
  };

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
    onSplitOutput: (nodeId) => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = splitOutput(state, nodeId);
      setStateAndRender(nextState);
    },
    onSetNodeParam: (nodeId, key, value) => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = setNodeParam(state, nodeId, key, value);
      setStateAndRender(nextState);
    },
    onPressStatus: () => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const nextState = pressStatus(state);
      setStateAndRender(nextState);
    },
    onLetItRun: () => {
      if (state.narration.mode !== 'none') {
        return;
      }
      const armedState = setClipboardAutoMode(state);
      setStateAndRender(armedState);
      runAutoCycle();
    },
    onAdjustSpeed: (direction) => {
      if (state.narration.mode !== 'none' || state.clipboard.mode !== 'auto') {
        return;
      }
      const nextState = adjustTimeInterval(state, direction);
      setStateAndRender(nextState);
    }
  };

  const setStateAndRender = (nextState) => {
    state = nextState;
    renderAll(state, actions);
    syncAutoTicker();
  };

  setupControls(() => state, setStateAndRender);
  setStateAndRender(state);

  window.addEventListener('beforeunload', () => {
    stopAutoTicker();
  });
}

document.addEventListener('DOMContentLoaded', initializeApp);
