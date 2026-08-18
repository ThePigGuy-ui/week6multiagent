const comedian = require('./comedian');
const scientist = require('./scientist');
const inspector = require('./inspector');
const { callVibeProxy, callOllama } = require('./shared');

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

const SELECTOR_PROMPT = `You are an intelligent orchestrator. Given the user's prompt, determine which specialist agents should handle it, in order of priority.

Available agents:
- comedian: handles jokes, humor, entertainment, making things funny
- scientist: handles science questions, research, technical topics, explanations
- inspector: handles investigations, mysteries, detective work, problem-solving

Respond with ONLY a JSON array of agent names in order of priority. Include every agent that should contribute, and do not include agents that are irrelevant.
Examples:
- ["scientist"] (for: Explain quantum physics)
- ["scientist", "comedian"] (for: Tell me something funny about science)
- ["inspector"] (for: Solve this mystery)
- ["comedian"] (for: Make me laugh)

Only use the available agent names exactly as written. If uncertain, choose the most relevant available agent.`;

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

  const systemPrompt = `${SELECTOR_PROMPT}\n\nCurrently enabled agents: ${enabledNames.join(', ')}`;

  try {
    let response;
    try {
      response = await callVibeProxy({ message, systemPrompt, history: [], apiKey });
    } catch (vibeError) {
      try {
        response = await callOllama({ message, systemPrompt, history: [], apiKey });
      } catch (ollamaError) {
        throw new Error(`Agent selection failed: ${vibeError.message}; ${ollamaError.message}`);
      }
    }

    const normalizedResponse = String(response || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
    const selectedNames = JSON.parse(normalizedResponse);
    if (!Array.isArray(selectedNames)) {
      throw new Error('Agent selector did not return an array');
    }

    const agentNames = selectedNames
      .map((name) => String(name).toLowerCase().trim())
      .filter((name) => enabledNames.includes(name));

    if (agentNames.length === 0) {
      throw new Error('Agent selector returned no enabled agents');
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
    throw error;
  }
}

async function resolveAgents(message, disabledAgents = [], apiKey = '') {
  return selectAgentsWithLLM(message, disabledAgents, apiKey);
}

function pickAgent(message, disabledAgents = []) {
  return AGENTS.find((agent) => !disabledAgents.includes(agent.name)) || comedian;
}

async function routeMessage(message, history = [], options = {}) {
  const cleanedMessage = autoCleanText(message);
  const disabledAgents = Array.isArray(options.disabledAgents) ? options.disabledAgents : [];
  const apiKey = options.apiKey || '';
  const triggeredAgents = options.agentSelector
    ? await options.agentSelector(cleanedMessage, disabledAgents, apiKey)
    : await resolveAgents(cleanedMessage, disabledAgents, apiKey);
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
};
