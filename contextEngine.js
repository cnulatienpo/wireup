// contextEngine.js
import { buildContextBundle, lookupGlossaryTerms } from "./lookup.js";

export let currentContext = null;

export function updateContextFromOperator(opName) {
  currentContext = buildContextBundle(opName);
  return currentContext;
}

export function deriveContextPanelData() {
  if (!currentContext) return null;

  const textBlob = [
    currentContext.identity,
    currentContext.signalStory
  ].join(" ");

  const words = textBlob
    .toLowerCase()
    .split(/\W+/);

  const glossaryTerms = lookupGlossaryTerms(words);

  return {
    operator: currentContext.operator,
    family: currentContext.family,
    lenses: currentContext.lenses,
    failureModes: currentContext.failureModes,
    glossaryTerms
  };
}
