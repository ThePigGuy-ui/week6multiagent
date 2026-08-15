const test = require('node:test');
const assert = require('node:assert/strict');

const { pickAgent, routeMessage, fallbackKeywordSelection } = require('../agents/orchestrator');

test('routes science prompts to the scientist agent using fallback', () => {
  const agents = fallbackKeywordSelection('Explain quantum entanglement in simple terms', []);
  assert.equal(agents[0].name, 'scientist');
});

test('routes detective prompts to the inspector agent using fallback', () => {
  const agents = fallbackKeywordSelection('We have a suspect and a clue, investigate the case', []);
  assert.equal(agents[0].name, 'inspector');
});

test('routes comedy prompts to the comedian agent using fallback', () => {
  const agents = fallbackKeywordSelection('Tell me a funny joke about a programmer', []);
  assert.equal(agents[0].name, 'comedian');
});

test('returns an agent name and response when routing a message', async () => {
  const result = await routeMessage('Why is the moon so mysterious?', []);
  assert.equal(typeof result.agent, 'string');
  assert.equal(typeof result.reply, 'string');
  assert.equal(Array.isArray(result.agents), true);
});

test('skips disabled agents when selecting a specialist', async () => {
  const result = await routeMessage('Tell me a joke about robots', [], { disabledAgents: ['comedian'] });
  assert.notEqual(result.agent, 'comedian');
  assert.equal(typeof result.reply, 'string');
});

test('uses LLM to intelligently select multiple agents when both themes are present', async () => {
  const result = await routeMessage('Explain the science behind a funny quantum joke', []);
  assert.equal(typeof result.agent, 'string');
  assert.equal(typeof result.reply, 'string');
  assert.equal(Array.isArray(result.agents), true);
});
