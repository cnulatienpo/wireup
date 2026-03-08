const express = require('express');
const fs = require('fs');
const path = require('path');
const { loadIndex, getOperatorSources } = require('./rayrayIndex');
const { buildSignalFlowDescription } = require('./signalFlowInterpreter');
const { interpretParameters } = require('./parameterInterpreter');
const {
  ensureSession,
  getRecentHistory,
  getMostRecentInteraction,
  appendInteraction,
} = require('./sessionMemory');
const { generateRayRayResponse } = require('./llmAdapter');

const app = express();
const PORT = 3000;

app.use(express.json());

const operatorIndex = loadIndex();
const operatorNames = Object.keys(operatorIndex.operators || {});

const parsedFileCache = new Map();

function normalizeOperatorName(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeToken(token = '') {
  const trimmed = token.trim();
  if (trimmed.length > 3 && trimmed.endsWith('s')) {
    return trimmed.slice(0, -1);
  }

  return trimmed;
}

function tokenize(text = '') {
  return normalizeOperatorName(text)
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function findOperatorsInQuestion(question = '') {
  const questionTokens = tokenize(question);
  if (!questionTokens.length) {
    return [];
  }

  const tokenSet = new Set(questionTokens);

  const matches = operatorNames
    .map((name) => {
      const opTokens = tokenize(name);
      if (!opTokens.length) return null;

      const matched = opTokens.every((token) => tokenSet.has(token));
      if (!matched) return null;

      const firstIndex = Math.min(
        ...opTokens
          .map((token) => questionTokens.indexOf(token))
          .filter((index) => index >= 0),
      );

      return {
        name,
        firstIndex: Number.isFinite(firstIndex) ? firstIndex : Number.MAX_SAFE_INTEGER,
        tokenCount: opTokens.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.firstIndex !== b.firstIndex) return a.firstIndex - b.firstIndex;
      if (a.tokenCount !== b.tokenCount) return b.tokenCount - a.tokenCount;
      return b.name.length - a.name.length;
    });

  return matches.map((match) => match.name);
}

function detectComparisonOperators(question = '') {
  const matches = findOperatorsInQuestion(question);
  return matches.length >= 2 ? matches.slice(0, 2) : [];
}

function detectOperator(question = '', state = {}) {
  const nodeType = state?.nodeType;

  if (nodeType) {
    const direct = operatorNames.find(
      (name) => normalizeOperatorName(name) === normalizeOperatorName(nodeType),
    );
    return direct || nodeType;
  }

  const matches = findOperatorsInQuestion(question);
  return matches[0] || null;
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

const COMPARISON_SECTIONS = ['Identity', 'Signal Story', 'Failure Modes', 'Recipes', 'Reasoning Lens'];

function findSectionValue(entry, sectionName) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const normalizedSection = normalizeOperatorName(sectionName);
  for (const [key, value] of Object.entries(entry)) {
    if (normalizeOperatorName(key) === normalizedSection) {
      return value;
    }
  }

  for (const value of Object.values(entry)) {
    if (value && typeof value === 'object') {
      const nested = findSectionValue(value, sectionName);
      if (nested != null) return nested;
    }
  }

  return null;
}

function formatSectionValue(value) {
  if (value == null) {
    return 'Not explicitly documented in indexed fragments.';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function buildOperatorComparisonContext(operatorName) {
  const sources = getOperatorSources(operatorName);
  const entries = sources
    .map((source) => extractSourceEntry(source))
    .filter((data) => data != null);

  const sectionBlocks = COMPARISON_SECTIONS.map((sectionName) => {
    const sectionValue = entries
      .map((entry) => findSectionValue(entry, sectionName))
      .find((value) => value != null);

    return `${sectionName}:\n${formatSectionValue(sectionValue)}`;
  });

  if (!entries.length) {
    sectionBlocks.push('Knowledge Fragments:\nNo indexed knowledge fragments were found.');
  }

  return sectionBlocks.join('\n\n');
}

function buildComparisonPrompt(operatorA, operatorB, question, recentHistory = [], followUp = false) {
  const contextA = buildOperatorComparisonContext(operatorA);
  const contextB = buildOperatorComparisonContext(operatorB);
  const recentConversation = buildRecentConversationContext(recentHistory);
  const followUpInstruction = followUp
    ? 'This appears to be a follow-up question, so keep continuity with prior context when useful.'
    : 'Treat this as a standalone comparison unless recent conversation clearly helps.';

  return [
    'You are Ray Ray, a TouchDesigner tutor.',
    '',
    'Explain the practical difference between these operators.',
    'Keep the answer short and beginner friendly.',
    'Cover: (1) what each operator does, (2) how they differ, (3) when to use one vs the other.',
    '',
    `Operator A: ${operatorA}`,
    contextA,
    '',
    `Operator B: ${operatorB}`,
    contextB,
    '',
    recentConversation,
    followUpInstruction,
    '',
    'User question:',
    question,
  ].join('\n');
}

async function compareOperators(operatorA, operatorB, question, recentHistory = [], followUp = false) {
  const prompt = buildComparisonPrompt(operatorA, operatorB, question, recentHistory, followUp);
  return generateRayRayResponse([{ role: 'user', content: prompt }]);
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



function buildParameterObservationContext(state = {}, previousState = null) {
  const observations = interpretParameters({
    nodeType: state.nodeType || state.selectedNode || '',
    nodeFamily: state.nodeFamily || state.family || '',
    parameters: state.parameters || {},
    previousParameters: previousState?.parameters || {},
  });

  if (!observations.length) {
    return 'Parameter Observations:\n- none';
  }

  return ['Parameter Observations:', ...observations.map((line) => `- ${line}`)].join('\n');
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


function hasStateSnapshot(state = {}) {
  return Boolean(state && typeof state === 'object' && Object.keys(state).length > 0);
}

const FOLLOW_UP_PATTERNS = [
  /\bwhat about now\b/i,
  /\band now\b/i,
  /\bdid that fix it\b/i,
  /^\s*why\b/i,
];

function isFollowUpQuestion(question = '') {
  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(question));
}

function buildRecentConversationContext(history = []) {
  if (!history.length) {
    return 'Recent Conversation:\n- none';
  }

  const lines = ['Recent Conversation:'];

  history.forEach((entry, index) => {
    lines.push(`${index + 1}. User: ${entry.question || '(no question)'}`);
    lines.push(`   Ray Ray: ${entry.answer || '(no answer)'}`);
  });

  return lines.join('\n');
}

function buildPrompt(context, question, state, previousState = null, mode = 'qa', recentHistory = [], followUp = false) {
  const patchContext = buildPatchContext(state);
  const flowContext = buildSignalFlowContext(state);
  const parameterObservationContext = buildParameterObservationContext(state, previousState);

  const modeInstruction = mode === 'explain_patch'
    ? 'Instruction: The user asked for a short beginner-friendly patch signal-flow explanation. Prioritize the Patch Signal Flow section.'
    : 'Instruction: Answer the user question using context and signal flow details when helpful.';

  const followUpInstruction = followUp
    ? 'Follow-up handling: This looks like a follow-up question. Prefer continuity with the latest remembered patch state and prior answer.'
    : 'Follow-up handling: Treat this as a standalone question unless conversation history helps.';

  const recentConversation = buildRecentConversationContext(recentHistory);

  return [
    'System:',
    '"You are Ray Ray, a TouchDesigner tutor who explains nodes clearly using layered reasoning."',
    '',
    'Context:',
    context,
    '',
    patchContext,
    '',
    parameterObservationContext,
    '',
    flowContext,
    '',
    recentConversation,
    '',
    modeInstruction,
    followUpInstruction,
    '',
    'User question:',
    question,
  ].join('\n');
}

async function handleRayrayRequest(req, res) {
  try {
    const { question = '', state = {}, mode = 'qa', sessionId: incomingSessionId } = req.body || {};

    const sessionId = ensureSession(incomingSessionId);

    if (typeof question !== 'string') {
      return res.status(400).json({
        sessionId,
        answer: 'Please include a valid question string.',
      });
    }

    const followUp = isFollowUpQuestion(question);
    const mostRecent = getMostRecentInteraction(sessionId);
    const hasIncomingState = hasStateSnapshot(state);
    const effectiveState = hasIncomingState ? state : (followUp && mostRecent?.state ? mostRecent.state : state);
    const previousState = mostRecent?.state || null;

    const flow = buildSignalFlowDescription(effectiveState);
    if (mode === 'explain_patch') {
      const answer = flow.beginnerSummary;
      appendInteraction(sessionId, {
        question,
        state: effectiveState,
        answer,
        timestamp: Date.now(),
      });

      return res.json({
        sessionId,
        answer,
        flow,
      });
    }

    if (!question.trim()) {
      return res.status(400).json({
        sessionId,
        answer: 'Please include a non-empty question, or use mode=explain_patch.',
      });
    }

    const comparisonOperators = detectComparisonOperators(question);
    const recentHistory = getRecentHistory(sessionId, 5);

    if (comparisonOperators.length === 2) {
      const [operatorA, operatorB] = comparisonOperators;
      const answer = await compareOperators(operatorA, operatorB, question, recentHistory, followUp);

      appendInteraction(sessionId, {
        question,
        state: effectiveState,
        answer,
        timestamp: Date.now(),
      });

      return res.json({
        sessionId,
        answer,
        comparison: {
          operatorA,
          operatorB,
        },
      });
    }

    const operator = detectOperator(question, effectiveState);

    if (!operator) {
      const answer = "I couldn't determine which operator you're asking about.";
      appendInteraction(sessionId, {
        question,
        state: effectiveState,
        answer,
        timestamp: Date.now(),
      });

      return res.json({ sessionId, answer });
    }

    const context = buildKnowledgeContext(operator);
    const prompt = buildPrompt(context, question, effectiveState, previousState, mode, recentHistory, followUp);
    const answer = await generateRayRayResponse([{ role: 'user', content: prompt }]);

    appendInteraction(sessionId, {
      question,
      state: effectiveState,
      answer,
      timestamp: Date.now(),
    });

    return res.json({ sessionId, answer });
  } catch (error) {
    return res.status(500).json({ answer: `Ray Ray hit an error: ${error.message}` });
  }

}

app.post('/rayray', handleRayrayRequest);
app.post('/api/rayray', handleRayrayRequest);

app.listen(PORT, () => {
  console.log('Ray Ray server running at http://localhost:3000');
});
