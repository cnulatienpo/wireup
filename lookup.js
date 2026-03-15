import { getOperator, retrieveContext } from './runtime/retrieval/index.js';

const FAMILIES = ['tops', 'chops', 'sops'];

export async function findOperator(opName) {
  const data = await getOperator(opName);
  if (!data) return null;

  return {
    name: data.name,
    family: FAMILIES.includes(data.family) ? data.family : 'unknown',
    data,
  };
}

export async function buildContextBundle(opName) {
  const found = await findOperator(opName);
  if (!found) return null;

  const { family, data } = found;
  return {
    operator: found.name,
    family,
    identity: data.identity,
    signalStory: data.signal_story,
    failureModes: data.failure_modes || [],
    recipes: data.recipes || [],
    lenses: data.lenses || [],
  };
}

export async function lookupGlossaryTerms(words = []) {
  const context = await retrieveContext(words.join(' '));
  const set = new Set(words.map((w) => String(w).toLowerCase()));
  return (context.concepts || [])
    .filter((entry) => set.has(entry.term.toLowerCase()))
    .map((entry) => ({ term: entry.term, definition: entry.definition }));
}
