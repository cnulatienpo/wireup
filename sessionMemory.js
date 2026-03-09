const crypto = require('crypto');

const MAX_HISTORY = 10;

const sessions = {};

function createSessionId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSession(sessionId) {
  const id = sessionId || createSessionId();

  if (!sessions[id]) {
    sessions[id] = { history: [] };
  }

  return id;
}

function getSession(sessionId) {
  if (!sessionId || !sessions[sessionId]) return null;
  return sessions[sessionId];
}

function getRecentHistory(sessionId, limit = MAX_HISTORY) {
  const session = getSession(sessionId);
  if (!session) return [];

  return session.history.slice(-limit);
}

function getMostRecentInteraction(sessionId) {
  const history = getRecentHistory(sessionId, 1);
  return history[0] || null;
}

function appendInteraction(sessionId, interaction) {
  const id = ensureSession(sessionId);
  const session = sessions[id];

  session.history.push({
    question: interaction.question,
    state: interaction.state,
    answer: interaction.answer,
    timestamp: interaction.timestamp || Date.now(),
  });

  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }

  return id;
}

function getMemorySnapshot() {
  return sessions;
}

function clearAllSessions() {
  Object.keys(sessions).forEach((sessionId) => {
    delete sessions[sessionId];
  });
}

module.exports = {
  MAX_HISTORY,
  ensureSession,
  getSession,
  getRecentHistory,
  getMostRecentInteraction,
  appendInteraction,
  getMemorySnapshot,
  clearAllSessions,
};
