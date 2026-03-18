const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const runtime = require('./runtime/index.cjs');
const { buildSignalFlowDescription } = require('./signalFlowInterpreter');
const { interpretParameters } = require('./parameterInterpreter');
const {
  ensureSession,
  getRecentHistory,
  getMostRecentInteraction,
  appendInteraction,
  clearAllSessions,
} = require('./sessionMemory');
const { generateRayRayResponse } = require('./llmAdapter');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const runtimeData = runtime.loadRuntime();
const operatorNames = Object.keys(runtimeData.master_index?.operators || {});

const TOX_DISCONNECT_TIMEOUT_MS = 10_000;

const toxStatus = {
  lastStateAt: null,
  hasConnected: false,
};

function getToxConnectionState(now = Date.now()) {
  if (!toxStatus.hasConnected || toxStatus.lastStateAt == null) {
    return 'waiting';
  }

  if (now - toxStatus.lastStateAt > TOX_DISCONNECT_TIMEOUT_MS) {
    return 'disconnected';
  }

  return 'connected';
}

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


function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatStructuredRayRayAnswer(payload = {}) {
  const explanation = cleanText(payload.explanation || payload.answer || '');
  const uiExecution = Array.isArray(payload.ui_execution) ? payload.ui_execution : [];
  const expectedVisualResult = cleanText(payload.expected_visual_result || '');

  const lines = [];
  if (explanation) {
    lines.push(explanation, '');
  }

  if (uiExecution.length) {
    lines.push('Do This In TouchDesigner');
    uiExecution.forEach((item, index) => {
      lines.push(`${index + 1}. ${cleanText(item.step)}`);
      if (item.why) {
        lines.push(`   Why: ${cleanText(item.why)}`);
      }
    });
    lines.push('');
  }

  if (expectedVisualResult) {
    lines.push(`Expected visual result: ${expectedVisualResult}`);
  }

  return lines.join('\n').trim();
}

function buildUiExecution({ operator = '', parameterNames = [], state = {}, question = '' } = {}) {
  const selectedName = cleanText(state.selectedNode || operator || 'the node');
  const operatorLabel = cleanText(operator || state.nodeType || 'the operator');
  const networkName = cleanText(state.network || 'the current network');
  const parameters = Array.isArray(parameterNames) ? parameterNames.filter(Boolean) : [];
  const primaryParameter = parameters[0] || '';
  const hasChopContext = /\bchop\b/i.test(question)
    || /\bchop\b/i.test(JSON.stringify(state.parameters || {}))
    || (Array.isArray(state.upstream) && state.upstream.some((node) => /CHOP/i.test(node?.type || node?.family || '')));

  const steps = [
    {
      step: `Click the ${selectedName} ${operatorLabel ? `(${operatorLabel}) ` : ''}node in the network editor.`.replace(/\s+/g, ' ').trim(),
      why: 'That makes sure the right operator is active before you change anything.',
    },
    {
      step: `Look at the parameter panel on the right side of TouchDesigner while you stay inside ${networkName}.`,
      why: 'That panel is where this operator exposes the controls you can actually change.',
    },
  ];

  if (primaryParameter) {
    steps.push({
      step: `Find the parameter labeled "${primaryParameter}" in the parameter panel.`,
      why: 'That is the specific runtime parameter currently available for this operator.',
    });

    if (hasChopContext) {
      steps.push({
        step: `Drag the CHOP channel you want to use onto the "${primaryParameter}" parameter label, then release when the target highlights.`,
        why: 'Dropping onto the exact parameter label creates the live connection without guessing the destination.',
      });
    } else {
      steps.push({
        step: `Click in the value field next to "${primaryParameter}" and adjust it directly.`,
        why: 'That lets you test the change on the exact control that exists in the current runtime data.',
      });
    }
  } else {
    steps.push({
      step: 'Open the parameter pages for this node and use the first visible control that matches the question you asked.',
      why: 'This keeps the guidance grounded in controls you can actually see instead of inventing parameter names.',
    });
  }

  return steps;
}

function buildExpectedVisualResult({ operator = '', parameterNames = [], question = '' } = {}) {
  const primaryParameter = (Array.isArray(parameterNames) ? parameterNames[0] : '') || '';
  if (/\bchop\b/i.test(question) && primaryParameter) {
    return `You should see the "${primaryParameter}" control show an active connection, and the related value should update as the CHOP channel changes.`;
  }

  if (primaryParameter) {
    return `You should see the "${primaryParameter}" value change in the parameter panel, and the ${operator || 'operator'} output should react in its viewer if that control affects the result.`;
  }

  return `You should see the ${operator || 'selected operator'} stay selected, its parameter panel visible, and the viewer update as you change one of the controls that is present.`;
}

function buildStructuredRayRayPayload({ explanation = '', operator = '', state = {}, question = '', parameterNames = [] } = {}) {
  const payload = {
    explanation: cleanText(explanation),
    ui_execution: buildUiExecution({ operator, parameterNames, state, question }),
    expected_visual_result: buildExpectedVisualResult({ operator, parameterNames, question }),
  };

  return {
    ...payload,
    answer: formatStructuredRayRayAnswer(payload),
  };
}

function buildKnowledgeContext(operatorName, explainMode = 'td') {
  const context = runtime.retrieveContext(operatorName);
  return runtime.explainContext(context, explainMode);
}

function buildMenuGuidanceContext(operatorName) {
  const menuGuidance = runtime.getOperatorMenuGuidance(operatorName);

  if (!menuGuidance.length) {
    return 'Important controls:\n- No operator menu guidance found.';
  }

  const lines = ['Important controls:'];

  menuGuidance.forEach((menu) => {
    lines.push(`Open the ${menu.menu} menu (${menu.operator}):`);
    if (menu.meaning) {
      lines.push(`- Meaning: ${menu.meaning}`);
    }

    menu.important_controls.slice(0, 6).forEach((control) => {
      lines.push(`- ${control}`);
    });
  });

  return lines.join('\n');
}

const COMPARISON_SECTIONS = ['Identity', 'Signal Story', 'Failure Modes', 'Recipes', 'Reasoning Lens'];

function formatSectionValue(value) {
  if (value == null) {
    return 'Not explicitly documented in runtime index.';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function buildOperatorComparisonContext(operatorName) {
  const entry = runtime.getOperator(operatorName);
  if (!entry) {
    return 'No runtime entry found.';
  }

  const sectionMap = {
    Identity: entry.identity,
    'Signal Story': entry.signal_story,
    'Failure Modes': entry.failure_modes,
    Recipes: entry.recipes,
    'Reasoning Lens': entry.lenses,
  };

  return COMPARISON_SECTIONS.map((name) => `${name}:\n${formatSectionValue(sectionMap[name])}`).join('\n\n');
}

async function compareOperators(operatorA, operatorB, question, recentHistory = [], followUp = false, explainMode = 'td') {
  const prompt = buildComparisonPrompt(operatorA, operatorB, question, recentHistory, followUp);
  const context = runtime.retrieveContext(`${operatorA} ${operatorB}`);
  const explanation = runtime.explainContext(context, explainMode);
  const menuGuidance = [
    `${operatorA}:\n${buildMenuGuidanceContext(operatorA)}`,
    `${operatorB}:\n${buildMenuGuidanceContext(operatorB)}`,
  ].join('\n\n');
  return generateRayRayResponse([{ role: 'user', content: `${prompt}\n\nRuntime explanation mode (${explainMode}):\n${explanation}\n\nOperator parameter guidance:\n${menuGuidance}` }]);
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

function normalizeBridgeSessionId(sessionId, bridgeName = 'wireup-outpost') {
  const fallback = `${bridgeName}:outpost`;
  const raw = typeof sessionId === 'string' ? sessionId.trim() : '';

  if (!raw) {
    return fallback;
  }

  const namespaced = raw.startsWith(`${bridgeName}:`) ? raw : `${bridgeName}:${raw}`;
  return namespaced.slice(0, 128);
}

function buildBridgeRequest(body = {}, bridgeName = 'wireup-outpost') {
  const state = body?.state && typeof body.state === 'object' ? body.state : {};
  const question = typeof body?.question === 'string'
    ? body.question
    : (typeof body?.query === 'string' ? body.query : '');

  return {
    question,
    state,
    mode: body?.mode || 'qa',
    explainMode: body?.explainMode || 'td',
    sessionId: normalizeBridgeSessionId(body?.sessionId || body?.session_id, bridgeName),
    bridge: bridgeName,
  };
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
    const requestBody = req.body || {};
    const { question = '', state = {}, mode = 'qa', explainMode = 'td', sessionId: incomingSessionId } = requestBody;

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

    if (hasIncomingState) {
      toxStatus.lastStateAt = Date.now();
      toxStatus.hasConnected = true;
    }
    const effectiveState = hasIncomingState ? state : (followUp && mostRecent?.state ? mostRecent.state : state);
    const previousState = mostRecent?.state || null;

    const flow = buildSignalFlowDescription(effectiveState);
    if (mode === 'explain_patch') {
      const structured = buildStructuredRayRayPayload({
        explanation: flow.beginnerSummary,
        operator: effectiveState.nodeType || '',
        state: effectiveState,
        question,
        parameterNames: Object.keys(effectiveState.parameters || {}),
      });
      const answer = structured.answer;
      appendInteraction(sessionId, {
        question,
        state: effectiveState,
        answer,
        timestamp: Date.now(),
      });

      return res.json({
        sessionId,
        ...structured,
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
      const explanation = await compareOperators(operatorA, operatorB, question, recentHistory, followUp, explainMode);
      const structured = buildStructuredRayRayPayload({
        explanation,
        operator: operatorA,
        state: effectiveState,
        question,
        parameterNames: Object.keys(effectiveState.parameters || {}),
      });
      const answer = structured.answer;

      appendInteraction(sessionId, {
        question,
        state: effectiveState,
        answer,
        timestamp: Date.now(),
      });

      return res.json({
        sessionId,
        ...structured,
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

      return res.json({
        sessionId,
        ...buildStructuredRayRayPayload({ explanation: answer, state: effectiveState, question }),
      });
    }

    const context = buildKnowledgeContext(operator, explainMode);
    const menuGuidanceContext = buildMenuGuidanceContext(operator);
    const runtimeContext = runtime.retrieveContext(question);
    const runtimePatterns = runtime.detectPatterns(effectiveState);
    const prompt = buildPrompt(`${context}\n\n${menuGuidanceContext}\n\nRuntime concepts: ${JSON.stringify(runtimeContext.concepts || [])}\nRuntime patterns: ${JSON.stringify(runtimePatterns)}`, question, effectiveState, previousState, mode, recentHistory, followUp);
    const explanation = await generateRayRayResponse([{ role: 'user', content: prompt }]);
    const structured = buildStructuredRayRayPayload({
      explanation,
      operator,
      state: effectiveState,
      question,
      parameterNames: Object.keys(effectiveState.parameters || {}),
    });
    const answer = structured.answer;

    appendInteraction(sessionId, {
      question,
      state: effectiveState,
      answer,
      timestamp: Date.now(),
    });

    return res.json({ sessionId, ...structured });
  } catch (error) {
    const structured = buildStructuredRayRayPayload({ explanation: `Ray Ray hit an error: ${error.message}` });
    return res.status(500).json(structured);
  }

}


async function handleOutpostBridgeRequest(req, res) {
  try {
    const rawBody = req.body || {};
    const query = typeof rawBody?.query === 'string'
      ? rawBody.query
      : (typeof rawBody?.question === 'string' ? rawBody.question : '');
    const sessionId = typeof rawBody?.session_id === 'string'
      ? rawBody.session_id
      : (typeof rawBody?.sessionId === 'string' ? rawBody.sessionId : '');

    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ response: 'Please include a non-empty query.', workflow_used: false });
    }

    if (sessionId === 'outpost') {
      const pipeline = spawnSync('python', ['backend/outpost_pipeline_runner.py'], {
        cwd: __dirname,
        input: JSON.stringify({ query, session_id: sessionId }),
        encoding: 'utf-8',
      });

      if (pipeline.status !== 0) {
        const errorOutput = (pipeline.stderr || pipeline.stdout || '').trim();
        return res.status(500).json({
          response: `Outpost pipeline error: ${errorOutput || 'Unknown error'}`,
          workflow_used: false,
        });
      }

      const rawOutput = (pipeline.stdout || '').trim();
      const jsonLine = rawOutput.split('\n').reverse().find((line) => line.trim().startsWith('{')) || '{}';
      const payload = JSON.parse(jsonLine);
      return res.json(payload);
    }

    req.body = buildBridgeRequest(rawBody, 'wireup-outpost');
    return handleRayrayRequest(req, res);
  } catch (error) {
    return res.status(500).json({ response: `Outpost bridge error: ${error.message}`, workflow_used: false });
  }
}

app.post('/rayray', handleRayrayRequest);
app.post('/api/rayray', handleRayrayRequest);
app.post('/query', handleOutpostBridgeRequest);
app.post('/outpost/query', handleOutpostBridgeRequest);
app.post('/api/outpost/query', handleOutpostBridgeRequest);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/outpost', (_req, res) => {
  res.sendFile(path.join(__dirname, 'wireup-outpost.html'));
});

app.get('/outpost/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'wireup-outpost.html'));
});

app.get('/wireup-shack.html', (_req, res) => {
  res.redirect('/outpost');
});

app.get('/wireup-shack', (_req, res) => {
  res.redirect('/outpost');
});

app.get('/wireup-shack/', (_req, res) => {
  res.redirect('/outpost');
});

app.get('/shack', (_req, res) => {
  res.redirect('/outpost');
});

app.get('/shack/', (_req, res) => {
  res.redirect('/outpost');
});

app.get('/wireup-outpost', (_req, res) => {
  res.redirect('/outpost');
});

app.get('/machines', (_req, res) => {
  res.sendFile(path.join(__dirname, 'machines.html'));
});

app.get('/machines/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'machines.html'));
});

app.get('/machines/index.json', (_req, res) => {
  res.sendFile(path.join(__dirname, 'ipld', 'published', 'index.json'));
});

app.use('/machines/files', express.static(path.join(__dirname, 'ipld', 'published')));

app.get('/', (_req, res) => {
  res.redirect('/outpost');
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log('Ray Ray server running at http://localhost:3000');
  console.log('Outpost pipeline ready');
  console.log('TOX path registered');
  console.log('Session routing locked to outpost');
});
