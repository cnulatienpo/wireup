export function detectPatterns(patch = {}, rules = { patterns: [] }) {
  const text = JSON.stringify(patch).toLowerCase();
  return (rules.patterns || []).filter((rule) => (rule.when_any || []).some((token) => text.includes(token)));
}

function tdExplain(context = {}) {
  if (!context.operator) {
    return 'No direct operator match found in runtime index.';
  }

  const op = context.operator;
  return [
    `${op.name} [${op.family.toUpperCase()}]`,
    op.identity,
    op.signal_story ? `Signal story: ${op.signal_story}` : null,
    Array.isArray(op.failure_modes) && op.failure_modes.length ? `Failure modes: ${op.failure_modes.join(' | ')}` : null,
  ].filter(Boolean).join('\n');
}

function eli5Explain(context = {}) {
  if (!context.operator) {
    return "I couldn't find that exact operator, but we can still explore the idea with glossary concepts.";
  }

  const op = context.operator;
  return `${op.name} is like a tool that ${op.identity || 'changes your signal in a useful way'}. ${op.signal_story || ''}`.trim();
}

export function explainContext(context, mode = 'td') {
  if (mode === 'eli5') return eli5Explain(context);
  if (mode === 'dual') return `TD:\n${tdExplain(context)}\n\nELI5:\n${eli5Explain(context)}`;
  return tdExplain(context);
}
