const comedian = require('./comedian');
const scientist = require('./scientist');
const inspector = require('./inspector');
const { callOpenAI, callOllama } = require('./shared');

const AGENTS = [comedian, scientist, inspector];
const AGENT_MAP = {
  comedian,
  scientist,
  inspector
};

const SELECTOR_PROMPT = `You are an intelligent orchestrator. Given a user prompt, determine which specialist agents should handle it, in order of priority.

Available agents:
- comedian: handles jokes, humor, entertainment, making things funny
- scientist: handles science questions, research, technical topics, explanations
- inspector: handles investigations, mysteries, detective work, problem-solving

Respond with ONLY a comma-separated list of agent names in order of priority.
Examples:
- "scientist" (for: Explain quantum physics)
- "scientist,comedian" (for: Tell me something funny about science)
- "inspector" (for: Solve this mystery)
- "comedian" (for: Make me laugh)

If uncertain, default to: comedian

User prompt: "`;

async function selectAgentsWithLLM(message, disabledAgents = [], apiKey = '') {
  const enabledNames = ['comedian', 'scientist', 'inspector'].filter(
    (name) => !disabledAgents.includes(name)
  );

  const systemPrompt = SELECTOR_PROMPT + message + '"';

  try {
    let response;
    try {
      response = await callOpenAI({ message: '', systemPrompt, history: [], apiKey });
    } catch (openAiError) {
      try {
        response = await callOllama({ message: '', systemPrompt, history: [], apiKey });
      } catch (ollamaError) {
        return fallbackKeywordSelection(message, disabledAgents);
      }
    }

    const agentNames = response
      .toLowerCase()
      .split(',')
      .map((name) => name.trim())
      .filter((name) => enabledNames.includes(name));

    if (agentNames.length === 0) {
      return fallbackKeywordSelection(message, disabledAgents);
    }

    const unique = [];
    agentNames.forEach((name) => {
      if (!unique.includes(name)) {
        unique.push(name);
      }
    });

    return unique.map((name) => AGENT_MAP[name]).filter(Boolean);
  } catch (error) {
    console.error('LLM selection error:', error);
    return fallbackKeywordSelection(message, disabledAgents);
  }
}

function fallbackKeywordSelection(message, disabledAgents = []) {
  const text = String(message || '').toLowerCase();
  const enabledAgents = Object.values(AGENT_MAP).filter(
    (agent) => !disabledAgents.includes(agent.name)
  );
  const matchedAgents = [];

  if (/(detective|investigate|case|suspect|clue|mystery|crime|evidence|forensics|inspect|alibi|whodunit|hidden|fraud|interrogate|investigation)/.test(text)) {
    matchedAgents.push(inspector);
  }

  if (/(science|scientist|physics|chemistry|biology|astronomy|space|experiment|theory|research|equation|planet|energy|cell|genetics|data|compute|rocket|universe|quantum|entanglement|particle|molecule|dna|galaxy|cosmos|black hole|relativity|thermodynamics|nuclear)/.test(text)) {
    matchedAgents.push(scientist);
  }

  if (/(joke|funny|laugh|comedy|humor|pun|roast|standup|banter|giggle|entertain|hilarious)/.test(text)) {
    matchedAgents.push(comedian);
  }

  const ordered = matchedAgents.filter((agent) =>
    enabledAgents.some((enabled) => enabled.name === agent.name)
  );
  const unique = [];

  ordered.forEach((agent) => {
    if (!unique.some((item) => item.name === agent.name)) {
      unique.push(agent);
    }
  });

  if (unique.length === 0) {
    return enabledAgents.length ? [enabledAgents[0]] : [comedian];
  }

  return unique;
}

async function resolveAgents(message, disabledAgents = [], apiKey = '') {
  return selectAgentsWithLLM(message, disabledAgents, apiKey);
}

function pickAgent(message, disabledAgents = []) {
  return fallbackKeywordSelection(message, disabledAgents)[0] || comedian;
}

async function routeMessage(message, history = [], options = {}) {
  const disabledAgents = Array.isArray(options.disabledAgents) ? options.disabledAgents : [];
  const apiKey = options.apiKey || '';
  const triggeredAgents = await resolveAgents(message, disabledAgents, apiKey);
  const selectedAgent = triggeredAgents[0] || pickAgent(message, disabledAgents);

  if (options.skipModel) {
    return {
      agent: selectedAgent.name,
      agents: triggeredAgents.map((agent) => agent.name),
      reply: `This would be handled by the ${selectedAgent.name} agent.`
    };
  }

  const steps = [];
  let currentHistory = [...history];

  for (const agent of triggeredAgents) {
    const output = await agent.generateReply(message, currentHistory, apiKey);
    steps.push({ agent: agent.name, reply: output });
    currentHistory = [
      ...currentHistory,
      { role: 'assistant', content: output }
    ];
  }

  const reply = steps.length > 1
    ? steps.map(({ agent, reply: text }) => `[${agent}] ${text}`).join('\n\n')
    : steps[0]?.reply || 'No response returned.';

  return {
    agent: selectedAgent.name,
    agents: triggeredAgents.map((agent) => agent.name),
    reply,
    steps
  };
}

module.exports = {
  AGENTS,
  pickAgent,
  resolveAgents,
  routeMessage,
  selectAgentsWithLLM,
  fallbackKeywordSelection
};
