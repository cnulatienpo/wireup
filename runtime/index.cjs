const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'data', 'wireup_runtime');

let runtimeCache = null;

function loadFile(fileName) {
  const raw = fs.readFileSync(path.join(BASE, fileName), 'utf8');
  return JSON.parse(raw);
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function loadRuntime() {
  if (runtimeCache) return runtimeCache;
  runtimeCache = {
    master_index: loadFile('master_index.json'),
    operator_lookup: loadFile('operator_lookup.json'),
    concept_index: loadFile('concept_index.json'),
    concept_graph: loadFile('concept_graph.json'),
    runtime_rules: loadFile('runtime_rules.json'),
  };
  return runtimeCache;
}

function getOperator(name) {
  const runtime = loadRuntime();
  const n = normalize(name);
  const canonical = runtime.operator_lookup[n] || runtime.operator_lookup[String(name).toLowerCase()];
  return canonical ? runtime.master_index.operators[canonical] : null;
}

function retrieveContext(question = '') {
  const runtime = loadRuntime();
  const q = String(question).toLowerCase();
  const operator = Object.values(runtime.master_index.operators).find((entry) => q.includes(entry.name.toLowerCase())) || null;
  const concepts = Object.values(runtime.concept_index).filter((entry) => q.includes(entry.term.toLowerCase())).slice(0, 5);
  return { operator, concepts, graph: runtime.concept_graph, rules: runtime.runtime_rules };
}

function detectPatterns(patch = {}) {
  const { runtime_rules } = loadRuntime();
  const text = JSON.stringify(patch).toLowerCase();
  return (runtime_rules.patterns || []).filter((rule) => (rule.when_any || []).some((token) => text.includes(token)));
}

function explainContext(context, mode = 'td') {
  const op = context?.operator;
  const td = op
    ? [op.name, op.identity, op.signal_story ? `Signal story: ${op.signal_story}` : null].filter(Boolean).join('\n')
    : 'No direct operator match found in runtime index.';
  const eli5 = op
    ? `${op.name} is like a helper tool: ${op.identity || 'it changes your signal in a useful way'}.`
    : "I couldn't find that exact operator, but I can still explain nearby concepts.";

  if (mode === 'eli5') return eli5;
  if (mode === 'dual') return `TD:\n${td}\n\nELI5:\n${eli5}`;
  return td;
}

module.exports = { loadRuntime, getOperator, retrieveContext, detectPatterns, explainContext };
