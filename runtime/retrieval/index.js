import { loadRuntime } from '../loader/index.js';

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function getOperator(name) {
  const runtime = await loadRuntime();
  const normalized = normalize(name);
  const canonical = runtime.operator_lookup[normalized] || runtime.operator_lookup[String(name).toLowerCase()];
  if (!canonical) return null;
  return runtime.master_index.operators[canonical] || null;
}

export async function retrieveContext(question = '') {
  const runtime = await loadRuntime();
  const q = String(question).toLowerCase();

  const operator = Object.values(runtime.master_index.operators).find((entry) => q.includes(entry.name.toLowerCase())) || null;
  const conceptMatches = Object.values(runtime.concept_index)
    .filter((entry) => q.includes(entry.term.toLowerCase()))
    .slice(0, 5);

  return {
    operator,
    concepts: conceptMatches,
    graph: runtime.concept_graph,
    rules: runtime.runtime_rules,
  };
}
