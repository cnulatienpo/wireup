// Deprecated: retained for backwards compatibility.
// Runtime lookups now use data/wireup_runtime/* through runtime/index.cjs.
const runtime = require('./runtime/index.cjs');

function loadIndex() {
  const data = runtime.loadRuntime();
  return {
    operators: data.master_index?.operators || {},
    glossary: data.concept_index || {},
  };
}

function getOperatorSources(operatorName) {
  const entry = runtime.getOperator(operatorName);
  return entry ? [entry] : [];
}

function getGlossarySource(term) {
  const index = loadIndex();
  return index.glossary?.[String(term).toLowerCase()] ?? null;
}

module.exports = {
  loadIndex,
  getOperatorSources,
  getGlossarySource,
};
