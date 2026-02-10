// lookup.js
import { store } from "./jsonStore.js";

const FAMILIES = ["tops", "chops", "sops"];

export function findOperator(opName) {
  for (const family of FAMILIES) {
    const ops = store[family];
    if (ops && ops[opName]) {
      return {
        name: opName,
        family,
        data: ops[opName]
      };
    }
  }
  return null;
}

export function buildContextBundle(opName) {
  const found = findOperator(opName);
  if (!found) return null;

  const { family, data } = found;

  return {
    operator: found.name,
    family,
    identity: data.layer_1_identity,
    signalStory: data.layer_2_signal_story,
    failureModes: data.layer_3_failure_modes || [],
    recipes: data.layer_4_minimal_recipes || [],
    lenses: data.layer_5_reasoning_lens || []
  };
}

export function lookupGlossaryTerms(words = []) {
  const glossary = store.glossary || {};
  return words
    .filter(w => glossary[w])
    .map(w => ({
      term: w,
      definition: glossary[w]
    }));
}
