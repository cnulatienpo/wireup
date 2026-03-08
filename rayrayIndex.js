const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, 'rayray_index.json');

function loadIndex() {
  const raw = fs.readFileSync(INDEX_PATH, 'utf8');
  return JSON.parse(raw);
}

function getOperatorSources(operatorName) {
  const index = loadIndex();
  return index.operators?.[operatorName] ?? [];
}

function getGlossarySource(term) {
  const index = loadIndex();
  return index.glossary?.[term] ?? [];
}

module.exports = {
  loadIndex,
  getOperatorSources,
  getGlossarySource,
};
