const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'data', 'wireup_runtime');
const MENU_SOURCES = [
  path.join(__dirname, '..', 'touch designer tops.json'),
  path.join(__dirname, '..', 'touch designer glossery part 3.json'),
  path.join(__dirname, '..', 'td simple glossery.json'),
];

let runtimeCache = null;
let operatorMenuIndex = null;

function loadFile(fileName) {
  const raw = fs.readFileSync(path.join(BASE, fileName), 'utf8');
  return JSON.parse(raw);
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeOperatorLabel(value = '') {
  return normalize(String(value).replace(/\([^)]*\)/g, ' '));
}

function parseConcatenatedJson(raw = '') {
  const objects = [];
  let idx = 0;

  while (idx < raw.length) {
    while (idx < raw.length && /\s/.test(raw[idx])) idx += 1;
    if (idx >= raw.length) break;

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let parsed = false;

    for (let i = idx; i < raw.length; i += 1) {
      const ch = raw[i];

      if (start === -1) {
        if (ch === '{') {
          start = i;
          depth = 1;
        }
        continue;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;

        if (depth === 0) {
          const candidate = raw.slice(start, i + 1);
          try {
            objects.push(JSON.parse(candidate));
          } catch (_parseError) {
            // Skip malformed block.
          }
          idx = i + 1;
          parsed = true;
          break;
        }
      }
    }

    if (!parsed) {
      break;
    }
  }

  return objects;
}

function loadRuntime() {
  if (runtimeCache) return runtimeCache;
  runtimeCache = {
    master_index: loadFile('master_index.json'),
    operator_lookup: loadFile('operator_lookup.json'),
    concept_index: loadFile('concept_index.json'),
    concept_graph: loadFile('concept_graph.json'),
    runtime_rules: loadFile('runtime_rules.json'),
  };
  return runtimeCache;
}

function loadOperatorMenuIndex() {
  if (operatorMenuIndex) return operatorMenuIndex;

  const index = {};

  MENU_SOURCES.forEach((filePath) => {
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf8');
    const objects = parseConcatenatedJson(raw);

    objects.forEach((obj) => {
      const operatorName = String(obj.operator || obj.operator_name || '').trim();
      if (!operatorName) return;

      const key = normalizeOperatorLabel(operatorName);
      if (!key || index[key]) return;

      index[key] = obj;
    });
  });

  operatorMenuIndex = index;
  return operatorMenuIndex;
}

function extract_menu_guidance(operatorJson = {}) {
  if (!operatorJson || typeof operatorJson !== 'object') {
    return [];
  }

  const operatorName = String(operatorJson.operator || operatorJson.operator_name || '').trim();
  const menus = operatorJson.operator_specific_menus || operatorJson.operator_specific_menu;

  if (!menus || typeof menus !== 'object') {
    return [];
  }

  return Object.entries(menus).map(([menuName, menuConfig]) => {
    const itemKeys = menuConfig && typeof menuConfig.items === 'object'
      ? Object.keys(menuConfig.items)
      : [];

    const important_controls = itemKeys.slice(0, 6);

    return {
      operator: operatorName,
      menu: menuName,
      meaning: String(menuConfig?.meaning || '').trim(),
      important_controls,
    };
  }).filter((entry) => entry.important_controls.length >= 3);
}

function getOperatorMenuGuidance(name = '') {
  const menuIndex = loadOperatorMenuIndex();
  const key = normalizeOperatorLabel(name);
  const operatorJson = menuIndex[key];
  if (!operatorJson) return [];

  return extract_menu_guidance(operatorJson);
}

function getOperator(name) {
  const runtime = loadRuntime();
  const n = normalize(name);
  const canonical = runtime.operator_lookup[n] || runtime.operator_lookup[String(name).toLowerCase()];
  return canonical ? runtime.master_index.operators[canonical] : null;
}

function retrieveContext(question = '') {
  const runtime = loadRuntime();
  const q = String(question).toLowerCase();
  const operator = Object.values(runtime.master_index.operators).find((entry) => q.includes(entry.name.toLowerCase())) || null;
  const concepts = Object.values(runtime.concept_index).filter((entry) => q.includes(entry.term.toLowerCase())).slice(0, 5);
  return { operator, concepts, graph: runtime.concept_graph, rules: runtime.runtime_rules };
}

function detectPatterns(patch = {}) {
  const { runtime_rules } = loadRuntime();
  const text = JSON.stringify(patch).toLowerCase();
  return (runtime_rules.patterns || []).filter((rule) => (rule.when_any || []).some((token) => text.includes(token)));
}

function explainContext(context, mode = 'td') {
  const op = context?.operator;
  const td = op
    ? [op.name, op.identity, op.signal_story ? `Signal story: ${op.signal_story}` : null].filter(Boolean).join('\n')
    : 'No direct operator match found in runtime index.';
  const eli5 = op
    ? `${op.name} is like a helper tool: ${op.identity || 'it changes your signal in a useful way'}.`
    : "I couldn't find that exact operator, but I can still explain nearby concepts.";

  if (mode === 'eli5') return eli5;
  if (mode === 'dual') return `TD:\n${td}\n\nELI5:\n${eli5}`;
  return td;
}

module.exports = {
  loadRuntime,
  getOperator,
  retrieveContext,
  detectPatterns,
  explainContext,
  extract_menu_guidance,
  getOperatorMenuGuidance,
};
