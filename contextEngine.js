import { buildContextBundle, lookupGlossaryTerms } from './lookup.js';

export let currentContext = null;

export async function updateContextFromOperator(opName) {
  currentContext = await buildContextBundle(opName);
  return currentContext;
}

export async function deriveContextPanelData() {
  if (!currentContext) return null;

  const textBlob = [currentContext.identity, currentContext.signalStory].join(' ');
  const words = textBlob.toLowerCase().split(/\W+/);
  const glossaryTerms = await lookupGlossaryTerms(words);

  return {
    operator: currentContext.operator,
    family: currentContext.family,
    lenses: currentContext.lenses,
    failureModes: currentContext.failureModes,
    glossaryTerms,
  };
}
