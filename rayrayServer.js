const express = require('express');
const fs = require('fs');
const path = require('path');
const { loadIndex, getOperatorSources } = require('./rayrayIndex');
const { buildSignalFlowDescription } = require('./signalFlowInterpreter');

const app = express();
const PORT = 3000;

app.use(express.json());

const operatorIndex = loadIndex();
const operatorNames = Object.keys(operatorIndex.operators || {});

const parsedFileCache = new Map();

function normalizeOperatorName(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function detectOperator(question = '', state = {}) {
  const nodeType = state?.nodeType;

  if (nodeType) {
    const direct = operatorNames.find(
      (name) => normalizeOperatorName(name) === normalizeOperatorName(nodeType),
    );
    return direct || nodeType;
  }

  const normalizedQuestion = normalizeOperatorName(question);
  if (!normalizedQuestion) return null;

  let bestMatch = null;
  for (const name of operatorNames) {
    const normalizedName = normalizeOperatorName(name);
    if (normalizedName && normalizedQuestion.includes(normalizedName)) {
      if (!bestMatch || normalizedName.length > normalizeOperatorName(bestMatch).length) {
        bestMatch = name;
      }
    }
  }

  return bestMatch;
}

function parseConcatenatedJson(content) {
  const docs = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const jsonText = content.slice(start, i + 1);
        docs.push(JSON.parse(jsonText));
        start = -1;
      }
    }
  }

  return docs;
}

function getParsedFileDocs(fileName) {
  if (parsedFileCache.has(fileName)) {
    return parsedFileCache.get(fileName);
  }

  const filePath = path.join(__dirname, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  const docs = parseConcatenatedJson(raw);

  parsedFileCache.set(fileName, docs);
  return docs;
}

function resolvePathWithParent(root, jsonPath) {
  const cleanPath = jsonPath.replace(/^\$/, '');
  const tokens = cleanPath.match(/[^.\[\]]+|\[(\d+)\]/g) || [];

  let current = root;
  let parent = null;

  for (const token of tokens) {
    parent = current;
    if (token.startsWith('[') && token.endsWith(']')) {
      current = current?.[Number(token.slice(1, -1))];
    } else {
      current = current?.[token];
    }
  }

  return { value: current, parent };
}

function extractSourceEntry(source) {
  const docs = getParsedFileDocs(source.file);
  const docMatch = source.path.match(/^\$(\d+)/);
  if (!docMatch) return null;

  const docIndex = Number(docMatch[1]);
  const doc = docs[docIndex];
  if (!doc) return null;

  const relativePath = source.path.replace(/^\$\d+\.?/, '');
  if (!relativePath) return doc;

  const resolved = resolvePathWithParent(doc, relativePath);
  if (resolved.value && typeof resolved.value === 'object') return resolved.value;
  if (resolved.parent && typeof resolved.parent === 'object') return resolved.parent;

  return resolved.value;
}

function buildKnowledgeContext(operatorName) {
  const sources = getOperatorSources(operatorName);
  if (!sources.length) {
    return `Operator: ${operatorName}\n\nNo indexed knowledge fragments were found.`;
  }

  const fragments = sources
    .map((source) => ({ source, data: extractSourceEntry(source) }))
    .filter((entry) => entry.data != null)
    .map((entry, index) => {
      const body =
        typeof entry.data === 'string'
          ? entry.data
          : JSON.stringify(entry.data, null, 2);

      return `Fragment ${index + 1} (${entry.source.file} | ${entry.source.path})\n${body}`;
    });

  return [`Operator: ${operatorName}`, '', ...fragments].join('\n\n');
}

function summarizeNeighborhood(nodes = []) {
  return nodes
    .map((node) => {
      const family = node.family ? ` [${node.family}]` : '';
      const depth = node.depth != null ? ` (depth ${node.depth})` : '';
      return `- ${node.name || 'unknown'}: ${node.type || 'Unknown Type'}${family}${depth}`;
    })
    .join('\n');
}

function buildPatchContext(state = {}) {
  const upstream = Array.isArray(state.upstream) ? state.upstream : [];
  const downstream = Array.isArray(state.downstream) ? state.downstream : [];
  const params = state.parameters && typeof state.parameters === 'object' ? state.parameters : {};
  const paramPreview = Object.entries(params)
    .slice(0, 12)
    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
    .join('\n');

  return [
    'Patch Context:',
    `Selected Node: ${state.nodeType || state.selectedNode || 'Unknown'}`,
    `Selected Name: ${state.selectedNode || 'Unknown'}`,
    `Network: ${state.network || 'Unknown'}`,
    `Family: ${state.nodeFamily || 'Unknown'}`,
    '',
    'Upstream Nodes:',
    summarizeNeighborhood(upstream) || '- none',
    '',
    'Downstream Nodes:',
    summarizeNeighborhood(downstream) || '- none',
    '',
    'Selected Node Parameters:',
    paramPreview || '- none',
  ].join('\n');
}


function buildSignalFlowContext(state = {}) {
  const flow = buildSignalFlowDescription(state);
  const warnings = flow.warnings.length
    ? ['Flow Warnings:', ...flow.warnings.map((warning) => `- ${warning}`)]
    : ['Flow Warnings:', '- none'];

  return [
    'Patch Signal Flow:',
    flow.path.join(' -> ') || 'Unknown -> Unknown',
    '',
    'Flow Explanation:',
    ...flow.orderedDescription.map((line) => `- ${line}`),
    '',
    ...warnings,
  ].join('\n');
}
function buildPrompt(context, question, state, mode = 'qa') {
  const patchContext = buildPatchContext(state);
  const flowContext = buildSignalFlowContext(state);

  const modeInstruction = mode === 'explain_patch'
    ? 'Instruction: The user asked for a short beginner-friendly patch signal-flow explanation. Prioritize the Patch Signal Flow section.'
    : 'Instruction: Answer the user question using context and signal flow details when helpful.';

  return [
    'System:',
    '"You are Ray Ray, a TouchDesigner tutor who explains nodes clearly using layered reasoning."',
    '',
    'Context:',
    context,
    '',
    patchContext,
    '',
    flowContext,
    '',
    modeInstruction,
    '',
    'User question:',
    question,
  ].join('\n');
}

async function askRayRay(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model request failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() || 'I could not generate an answer right now.';
}

app.post('/rayray', async (req, res) => {
  try {
    const { question = '', state = {}, mode = 'qa' } = req.body || {};

    if (typeof question !== 'string') {
      return res.status(400).json({ answer: 'Please include a valid question string.' });
    }

    const flow = buildSignalFlowDescription(state);
    if (mode === 'explain_patch') {
      return res.json({
        answer: flow.beginnerSummary,
        flow,
      });
    }

    if (!question.trim()) {
      return res.status(400).json({ answer: 'Please include a non-empty question, or use mode=explain_patch.' });
    }

    const operator = detectOperator(question, state);

    if (!operator) {
      return res.json({ answer: "I couldn't determine which operator you're asking about." });
    }

    const context = buildKnowledgeContext(operator);
    const prompt = buildPrompt(context, question, state, mode);
    const answer = await askRayRay(prompt);

    return res.json({ answer });
  } catch (error) {
    return res.status(500).json({ answer: `Ray Ray hit an error: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log('Ray Ray server running at http://localhost:3000');
});
