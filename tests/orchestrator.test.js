const test = require('node:test');
const assert = require('node:assert/strict');

const { routeMessage, selectAgentsWithLLM, autoCleanText, autoSummarizeConversation, buildAgentUniverse } = require('../agents/orchestrator');

test('uses the user prompt to parse the LLM-selected agent order', async () => {
  const originalFetch = global.fetch;
  let request;

  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: '["scientist", "comedian"]' } }] };
      }
    };
  };

  try {
    const agents = await selectAgentsWithLLM('Explain the science behind a funny quantum joke', [], 'test-key');
    assert.deepEqual(agents.map((agent) => agent.name), ['scientist', 'comedian']);
    assert.equal(request.body.messages.at(-1).content, 'Explain the science behind a funny quantum joke');
  } finally {
    global.fetch = originalFetch;
  }
});

test('returns an agent name and response when routing a message', async () => {
  const result = await routeMessage('Why is the moon so mysterious?', [], {
    skipModel: true,
    agentSelector: async () => [{ name: 'scientist' }]
  });
  assert.equal(typeof result.agent, 'string');
  assert.equal(typeof result.reply, 'string');
  assert.equal(Array.isArray(result.agents), true);
});

test('skips disabled agents when selecting a specialist', async () => {
  const result = await routeMessage('Tell me a joke about robots', [], {
    disabledAgents: ['comedian'],
    skipModel: true,
    agentSelector: async (_message, disabledAgents) =>
      disabledAgents.includes('comedian') ? [{ name: 'scientist' }] : [{ name: 'comedian' }]
  });
  assert.notEqual(result.agent, 'comedian');
  assert.equal(typeof result.reply, 'string');
});

test('uses LLM to intelligently select multiple agents when both themes are present', async () => {
  const result = await routeMessage('Explain the science behind a funny quantum joke', [], {
    skipModel: true,
    agentSelector: async () => [{ name: 'scientist' }, { name: 'comedian' }]
  });
  assert.equal(typeof result.agent, 'string');
  assert.equal(typeof result.reply, 'string');
  assert.equal(Array.isArray(result.agents), true);
});

test('auto-cleans user text and summarizes recent conversation context', () => {
  const cleaned = autoCleanText('   tell me   a funny  joke about  robots!!!  ');
  assert.equal(cleaned, 'tell me a funny joke about robots!!!');

  const summary = autoSummarizeConversation([
    { role: 'user', content: 'Tell me a funny joke about robots.' },
    { role: 'assistant', content: 'Why did the robot laugh? It had a byte of humor.' },
    { role: 'user', content: 'Explain that in simple language.' }
  ]);

  assert.match(summary, /Conversation summary/i);
  assert.match(summary, /robots/i);
});

test('includes preset universe packs for creative agent teams', () => {
  const spaceTeam = buildAgentUniverse('space');
  const gameTeam = buildAgentUniverse('game');

  assert.equal(spaceTeam.label, 'Space Mission Crew');
  assert.ok(spaceTeam.agents.includes('scientist'));
  assert.ok(gameTeam.agents.includes('comedian'));
});
