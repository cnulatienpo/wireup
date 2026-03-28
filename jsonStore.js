import { loadRuntime } from './runtime/loader/index.js';

export const store = {
  runtime: null,
  tops: {},
  chops: {},
  sops: {},
  glossary: {}
};

export async function loadAllJSON() {
  const runtime = await loadRuntime();
  store.runtime = runtime;

  store.tops = {};
  store.chops = {};
  store.sops = {};

  Object.values(runtime.master_index.operators || {}).forEach((op) => {
    const family = op.family || 'unknown';
    if (!store[family]) {
      store[family] = {};
    }

    store[family][op.name] = {
      operator: op.name,
      layer_1_identity: op.identity,
      layer_2_signal_story: op.signal_story,
      layer_3_failure_modes: op.failure_modes,
      layer_4_minimal_recipes: op.recipes,
      layer_5_reasoning_lens: op.lenses,
    };
  });

  store.glossary = Object.fromEntries(
    Object.values(runtime.concept_index || {}).map((entry) => [entry.term.toLowerCase(), entry.definition]),
  );

  return store;
}
