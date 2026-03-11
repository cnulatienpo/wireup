import { currentContext } from './contextEngine.js';
import { lookupGlossaryTerms } from './lookup.js';

export async function mapContextForPanel() {
  if (!currentContext) return null;

  const { operator, family, identity, signalStory, failureModes, lenses } = currentContext;

  const signalBullets = Array.isArray(signalStory)
    ? signalStory
    : signalStory?.split('.').map((s) => s.trim()).filter(Boolean);

  const textBlob = [identity, ...(signalBullets || []), ...(failureModes || [])].join(' ');
  const words = textBlob.toLowerCase().split(/\W+/);
  const glossary = await lookupGlossaryTerms(words);

  return {
    focus: { operator, family },
    identity,
    signalStory: signalBullets || [],
    warnings: failureModes || [],
    lenses: lenses || [],
    glossary,
    officialDocs: {
      label: operator,
      url: `https://docs.derivative.ca/${operator.replace(/\s+/g, '_')}`,
    },
  };
}
