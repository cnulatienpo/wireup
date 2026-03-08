function formatParamName(key = '') {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function inferFamily(nodeType = '', nodeFamily = '') {
  if (nodeFamily) {
    return String(nodeFamily).toUpperCase();
  }

  const type = String(nodeType).toUpperCase();
  if (type.includes(' TOP')) return 'TOP';
  if (type.includes(' CHOP')) return 'CHOP';
  if (type.includes(' SOP')) return 'SOP';

  return '';
}

function isNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function describeValue(value) {
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function buildFamilyAwareObservation({ family, nodeType, paramName, value }) {
  const lowerName = paramName.toLowerCase();
  const lowerType = String(nodeType).toLowerCase();

  if (family === 'TOP' && isNumeric(value) && value === 0 && (lowerName.includes('filtersize') || lowerName.includes('blur') || lowerName.includes('radius') || lowerType.includes('blur'))) {
    return `${formatParamName(paramName)} is currently 0, so the node will not visibly blur the image.`;
  }

  if (isNumeric(value) && value === 1 && lowerName.includes('scale')) {
    return `${formatParamName(paramName)} is 1, which keeps the image at its original size.`;
  }

  if (family === 'TOP' && isNumeric(value) && value === 0 && lowerName.includes('brightness')) {
    return `${formatParamName(paramName)} is 0, so the output image will appear black.`;
  }

  return null;
}

function buildGenericObservation(paramName, value) {
  if (value === false) {
    return `${formatParamName(paramName)} is off, which disables this part of the effect.`;
  }

  if (isNumeric(value)) {
    if (value === 0) {
      return `${formatParamName(paramName)} is 0, which usually disables or removes its visible effect.`;
    }

    if (value === 1) {
      return `${formatParamName(paramName)} is 1, which is often a neutral/default setting.`;
    }

    if (Math.abs(value) < 0.01) {
      return `${formatParamName(paramName)} is very small (${value}), so its effect may be barely noticeable.`;
    }

    if (Math.abs(value) >= 1000) {
      return `${formatParamName(paramName)} is extremely large (${value}), which can produce a very intense result.`;
    }

    if (Math.abs(value) >= 100) {
      return `${formatParamName(paramName)} is quite large (${value}), so expect a strong effect.`;
    }
  }

  return null;
}

function buildChangeObservation(paramName, previousValue, currentValue, nodeType, family) {
  if (previousValue === currentValue) return null;

  const lowerName = String(paramName).toLowerCase();
  if (
    family === 'TOP' &&
    isNumeric(previousValue) &&
    isNumeric(currentValue) &&
    previousValue === 0 &&
    currentValue > 0 &&
    (lowerName.includes('filtersize') || lowerName.includes('blur') || lowerName.includes('radius') || String(nodeType).toLowerCase().includes('blur'))
  ) {
    return `Previously ${formatParamName(paramName)} was 0. It is now ${currentValue}, so the blur should become visible.`;
  }

  if (isNumeric(previousValue) && isNumeric(currentValue)) {
    const direction = currentValue > previousValue ? 'increased' : 'decreased';
    const impact = currentValue > previousValue ? 'stronger' : 'weaker';
    return `${formatParamName(paramName)} changed from ${previousValue} to ${currentValue}. It ${direction}, so this effect should feel ${impact}.`;
  }

  return `${formatParamName(paramName)} changed from ${describeValue(previousValue)} to ${describeValue(currentValue)}.`;
}

function interpretParameters({ nodeType = '', nodeFamily = '', parameters = {}, previousParameters = {} } = {}) {
  const family = inferFamily(nodeType, nodeFamily);
  const paramEntries = Object.entries(parameters || {}).slice(0, 10);
  const observations = [];

  for (const [paramName, value] of paramEntries) {
    const familyAware = buildFamilyAwareObservation({
      family,
      nodeType,
      paramName,
      value,
    });

    const generic = familyAware ? null : buildGenericObservation(paramName, value);

    if (familyAware) {
      observations.push(familyAware);
    } else if (generic) {
      observations.push(generic);
    }

    if (Object.prototype.hasOwnProperty.call(previousParameters || {}, paramName)) {
      const previousValue = previousParameters[paramName];
      const changeObservation = buildChangeObservation(paramName, previousValue, value, nodeType, family);
      if (changeObservation) observations.push(changeObservation);
    }
  }

  return observations;
}

module.exports = {
  interpretParameters,
};
