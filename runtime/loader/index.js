const RUNTIME_FILES = {
  master_index: '/data/wireup_runtime/master_index.json',
  operator_lookup: '/data/wireup_runtime/operator_lookup.json',
  concept_index: '/data/wireup_runtime/concept_index.json',
  concept_graph: '/data/wireup_runtime/concept_graph.json',
  runtime_rules: '/data/wireup_runtime/runtime_rules.json',
};

let runtimeCache = null;

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Runtime load failed for ${path}: ${res.status}`);
  }
  return res.json();
}

export async function loadRuntime() {
  if (runtimeCache) return runtimeCache;

  const entries = await Promise.all(
    Object.entries(RUNTIME_FILES).map(async ([key, path]) => [key, await fetchJson(path)]),
  );

  runtimeCache = Object.fromEntries(entries);
  return runtimeCache;
}

export function getRuntimeCache() {
  return runtimeCache;
}
