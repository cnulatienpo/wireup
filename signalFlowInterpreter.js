function normalizeFamily(value) {
  if (!value) return null;
  const text = String(value).toUpperCase();
  const known = ['TOP', 'CHOP', 'SOP', 'DAT', 'MAT', 'POP'];
  const exact = known.find((fam) => fam === text);
  if (exact) return exact;

  const fromType = known.find((fam) => text.endsWith(` ${fam}`) || text.includes(` ${fam} `));
  return fromType || null;
}

function hasEnabledToggle(parameters = {}) {
  const entries = Object.entries(parameters);
  const toggleKeys = ['bypass', 'enable', 'active', 'cook'];

  for (const [key, raw] of entries) {
    const normalizedKey = key.toLowerCase();
    if (!toggleKeys.some((name) => normalizedKey.includes(name))) continue;

    if (typeof raw === 'boolean') {
      if (normalizedKey.includes('bypass') && raw) return false;
      if (!normalizedKey.includes('bypass') && raw === false) return false;
    }

    if (typeof raw === 'number') {
      if (normalizedKey.includes('bypass') && raw > 0) return false;
      if (!normalizedKey.includes('bypass') && raw === 0) return false;
    }
  }

  return true;
}

function detectDisabledEffect(nodeType = '', parameters = {}) {
  const lowerType = String(nodeType).toLowerCase();

  if (lowerType.includes('blur')) {
    const blurValue = Number(parameters.filtersize ?? parameters.blursize ?? parameters.size ?? Number.NaN);
    if (Number.isFinite(blurValue) && blurValue <= 0) {
      return 'Blur size is 0, so no visible blur is being applied.';
    }
  }

  if (!hasEnabledToggle(parameters)) {
    return 'The operator appears disabled/bypassed, so its effect may not be visible.';
  }

  return null;
}

function buildSignalFlowDescription(state = {}) {
  const selectedNode = state.selectedNode || 'selected node';
  const nodeType = state.nodeType || 'Unknown operator';
  const upstream = Array.isArray(state.upstream) ? state.upstream : [];
  const downstream = Array.isArray(state.downstream) ? state.downstream : [];
  const parameters = state.parameters && typeof state.parameters === 'object' ? state.parameters : {};

  const firstInput = upstream[0];
  const firstOutput = downstream[0];

  const lines = [];
  if (firstInput) {
    lines.push(`Signal enters through ${firstInput.type || firstInput.name || 'an upstream node'}.`);
  } else {
    lines.push(`No upstream input is connected to ${selectedNode}.`);
  }

  lines.push(`The signal is processed by ${nodeType}.`);

  if (firstOutput) {
    lines.push(`The result flows into ${firstOutput.type || firstOutput.name || 'a downstream node'}.`);
  } else {
    lines.push(`There is no downstream node connected after ${selectedNode}.`);
  }

  const path = [];
  if (firstInput) path.push(firstInput.type || firstInput.name || 'Input');
  path.push(nodeType);
  if (firstOutput) path.push(firstOutput.type || firstOutput.name || 'Output');

  const warnings = [];
  if (!upstream.length) {
    warnings.push(`${nodeType} has no input connected, so it may not receive usable signal.`);
  }

  const selectedFamily = normalizeFamily(state.nodeFamily || nodeType);
  const mismatchNode = [...upstream, ...downstream].find((node) => {
    const fam = normalizeFamily(node.family || node.type);
    return selectedFamily && fam && fam !== selectedFamily;
  });

  if (mismatchNode) {
    warnings.push(
      `Possible family mismatch: ${nodeType} (${selectedFamily}) is connected with ${mismatchNode.type || mismatchNode.name} (${normalizeFamily(mismatchNode.family || mismatchNode.type)}).`,
    );
  }

  if (state.isCooking === false) {
    warnings.push(`${nodeType} is not cooking, so the node is currently not updating.`);
  }

  const disabledMessage = detectDisabledEffect(nodeType, parameters);
  if (disabledMessage) {
    warnings.push(disabledMessage);
  }

  const beginnerSummary = firstInput && firstOutput
    ? `The signal comes from ${firstInput.type || firstInput.name}, then goes through ${nodeType}, and finally goes to ${firstOutput.type || firstOutput.name}.`
    : lines.join(' ');

  return {
    orderedDescription: lines,
    beginnerSummary,
    path,
    warnings,
  };
}

module.exports = {
  buildSignalFlowDescription,
};
