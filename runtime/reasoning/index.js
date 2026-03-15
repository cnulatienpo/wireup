export function detectPatterns(patch = {}, rules = { patterns: [] }) {
  const text = JSON.stringify(patch).toLowerCase();
  return (rules.patterns || []).filter((rule) => (rule.when_any || []).some((token) => text.includes(token)));
}

function tdExplain(context = {}) {
  if (!context.operator) {
    return 'Try naming an operator directly, like Blur TOP, Math CHOP, or Null SOP.';
  }

  const op = context.operator;
  const family = op.family ? ` (${op.family.toUpperCase()})` : '';
  const identity = op.identity ? op.identity.replace(/\.$/, '') : '';
  const story = op.signal_story ? op.signal_story.split('.')[0].trim() : '';
  let text = `The ${op.name}${family}`;
  if (identity) text += ` ${identity.charAt(0).toLowerCase() + identity.slice(1)}`;
  if (story) text += ` — like ${story.charAt(0).toLowerCase() + story.slice(1)}.`;
  else text += '.';
  return text;
}

function eli5Explain(context = {}) {
  if (!context.operator) {
    return 'Try naming an operator directly, like Blur TOP, Math CHOP, or Null SOP.';
  }

  const op = context.operator;
  const story = op.signal_story ? ` — like ${op.signal_story.charAt(0).toLowerCase() + op.signal_story.slice(1)}.` : '.';
  return `The ${op.name} ${op.identity || 'changes your signal in a useful way'}${story}`.trim();
}

export function explainContext(context, mode = 'td') {
  if (mode === 'eli5') return eli5Explain(context);
  if (mode === 'dual') return `TD:\n${tdExplain(context)}\n\nELI5:\n${eli5Explain(context)}`;
  return tdExplain(context);
}
