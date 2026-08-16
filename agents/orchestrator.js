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

const AGENT_UNIVERSES = {
  default: { label: 'Core Crew', agents: ['comedian', 'scientist', 'inspector'] },
  game: { label: 'Game Designer Team', agents: ['comedian', 'scientist', 'inspector'] },
  space: { label: 'Space Mission Crew', agents: ['scientist', 'inspector', 'comedian'] },
  superhero: { label: 'Superhero Squad', agents: ['inspector', 'scientist', 'comedian'] },
  animal: { label: 'Animal Rescue Team', agents: ['inspector', 'scientist', 'comedian'] }
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

function autoCleanText(input = '') {
  return String(input || '').trim().replace(/\s+/g, ' ');
}

function autoSummarizeConversation(history = []) {
  const items = Array.isArray(history) ? history.filter((entry) => entry && typeof entry.content === 'string') : [];

  if (items.length === 0) {
    return 'Conversation summary: no messages yet.';
  }

  const userPrompts = [];
  const topicMatches = [];

  items.forEach(({ role, content }) => {
    const cleaned = autoCleanText(content);
    if (!cleaned) return;

    if (role === 'user') {
      userPrompts.push(cleaned);
    }

    const lower = cleaned.toLowerCase();
    const matches = [];

    if (/(robots|robot)/.test(lower)) matches.push('robots');
    if (/(space|planet|galaxy|mission|rocket|cosmos)/.test(lower)) matches.push('space');
    if (/(science|scientist|physics|chemistry|experiment|theory|quantum|research)/.test(lower)) matches.push('science');
    if (/(detective|mystery|suspect|clue|crime|investigation|case|forensics)/.test(lower)) matches.push('detective work');
    if (/(joke|funny|humor|comedy|pun|roast|laugh)/.test(lower)) matches.push('humor');
    if (/(rescue|animal|superhero|game|adventure|mission)/.test(lower)) matches.push('creative play');

    if (matches.length > 0) {
      topicMatches.push(...matches);
    }
  });

  const lastUserPrompt = userPrompts[userPrompts.length - 1] || 'the recent conversation';
  const summaryTopic = topicMatches.length
    ? topicMatches[topicMatches.length - 1]
    : lastUserPrompt;
  const uniqueTopics = [...new Set(topicMatches)].slice(0, 3);
  const topicList = uniqueTopics.length ? uniqueTopics.join(', ') : 'general chat';

  return `Conversation summary: the latest discussion focused on ${summaryTopic}, with recent themes including ${topicList}.`;
}

function buildAgentUniverse(name = 'default') {
  const key = String(name || 'default').toLowerCase();
  const universe = AGENT_UNIVERSES[key] || AGENT_UNIVERSES.default;
  return { ...universe, key };
}

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

  if (/(detective|investigate|case|suspect|clue|mystery|crime|evidence|forensics|inspect|alibi|whodunit|hidden|fraud|interrogate|investigation|rescue|squad|mission|tracks|pattern|solve)/.test(text)) {
    matchedAgents.push(inspector);
  }

  if (/(science|scientist|physics|chemistry|biology|astronomy|space|experiment|theory|research|equation|planet|energy|cell|genetics|data|compute|rocket|universe|quantum|entanglement|particle|molecule|dna|galaxy|cosmos|black hole|relativity|thermodynamics|nuclear|mission)/.test(text)) {
    matchedAgents.push(scientist);
  }

  if (/(joke|funny|laugh|comedy|humor|pun|roast|standup|banter|giggle|entertain|hilarious|game|superhero|animal|adventure)/.test(text)) {
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
  const cleanedMessage = autoCleanText(message);
  const disabledAgents = Array.isArray(options.disabledAgents) ? options.disabledAgents : [];
  const apiKey = options.apiKey || '';
  const triggeredAgents = await resolveAgents(cleanedMessage, disabledAgents, apiKey);
  const selectedAgent = triggeredAgents[0] || pickAgent(cleanedMessage, disabledAgents);

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
    const output = await agent.generateReply(cleanedMessage, currentHistory, apiKey);
    steps.push({ agent: agent.name, reply: output });
    currentHistory = [
      ...currentHistory,
      { role: 'assistant', content: output }
    ];
  }

  const summary = options.autoSummarize !== false && history.length > 0
    ? `\n\n${autoSummarizeConversation(history)}`
    : '';

  const reply = steps.length > 1
    ? steps.map(({ agent, reply: text }) => `[${agent}] ${text}`).join('\n\n') + summary
    : (steps[0]?.reply || 'No response returned.') + summary;

  return {
    agent: selectedAgent.name,
    agents: triggeredAgents.map((agent) => agent.name),
    reply,
    steps,
    summary: autoSummarizeConversation(history),
    cleanedMessage,
    universe: buildAgentUniverse(options.universe || 'default')
  };
}

module.exports = {
  AGENTS,
  AGENT_UNIVERSES,
  autoCleanText,
  autoSummarizeConversation,
  buildAgentUniverse,
  pickAgent,
  resolveAgents,
  routeMessage,
  selectAgentsWithLLM,
  fallbackKeywordSelection
};
