const chatWindow = document.getElementById('chat');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const button = document.getElementById('send-button');
const status = document.getElementById('status');
const agentToggle = document.getElementById('agent-toggle');
const agentPanel = document.getElementById('agent-panel');
const agentList = document.getElementById('agent-list');
const agentButtons = Array.from(document.querySelectorAll('.agent-item'));
const tracePrompt = document.getElementById('trace-prompt');
const traceAgent = document.getElementById('trace-agent');
const themeToggle = document.getElementById('theme-toggle');
const clearHistoryButton = document.getElementById('clear-history');
const universeSelect = document.getElementById('universe-select');

const STORAGE_KEY = 'multi-agent-chat-state';
const DEFAULT_THEME = 'dark';
const VIBE_PROXY_ENDPOINT = 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions';
const VIBE_PROXY_KEY = 'sk-vibe-summer-2026';

// Mirrors agents/*.js so the chat works standalone on static hosts (e.g. GitHub
// Pages) with no backend server required.
const AGENT_SYSTEM_PROMPTS = {
  comedian: `You are a comedian. Your ONLY job is to make people laugh with jokes, humor, and entertainment.

Rules:
- ONLY tell jokes, puns, funny stories, or humorous commentary
- Do NOT provide serious explanations or educational content
- Do NOT try to be informative or factual
- Focus on humor and entertainment only
- If asked to do something non-humorous, politely decline and offer a joke instead

Respond with ONLY comedy and humor.`,
  scientist: `You are a scientist. Your ONLY job is to provide clear, accurate, and evidence-based scientific explanations.

Rules:
- ONLY answer questions with scientific facts and explanations
- Do NOT tell jokes, make puns, or try to be funny
- Do NOT provide non-scientific advice or commentary
- Focus on accuracy, structure, and clarity
- If asked to do something non-scientific, politely decline and redirect to science

Respond with ONLY scientific content.`,
  inspector: `You are an investigator. Your ONLY job is to analyze facts, solve mysteries, and investigate problems with detective-like reasoning.

Rules:
- ONLY investigate, analyze evidence, and solve mysteries
- Do NOT tell jokes or be entertaining
- Do NOT provide casual friendly banter
- Focus on logical deduction, evidence, and problem-solving
- Think like a detective: gather facts, identify patterns, reason about causes
- If asked to do something non-investigative, politely decline and offer to investigate instead

Respond with ONLY investigative analysis.`
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

function buildConversationHistory(history = []) {
  return history
    .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim())
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content.trim()
    }));
}

async function callVibeProxy({ message, history = [], systemPrompt = '' }) {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...buildConversationHistory(history),
    { role: 'user', content: message }
  ];

  const response = await fetch(VIBE_PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VIBE_PROXY_KEY}`
    },
    body: JSON.stringify({ model: 'class-chat-model', messages })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || 'Vibe proxy request failed');
  }

  return data.choices?.[0]?.message?.content?.trim() || 'No response returned by the model.';
}

async function selectAgents(message, disabledAgents = []) {
  const enabledNames = Object.keys(AGENT_SYSTEM_PROMPTS).filter((name) => !disabledAgents.includes(name));
  const systemPrompt = `${SELECTOR_PROMPT}\n\nCurrently enabled agents: ${enabledNames.join(', ')}`;

  const response = await callVibeProxy({ message, systemPrompt });
  const normalized = response.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  const selectedNames = JSON.parse(normalized);

  if (!Array.isArray(selectedNames)) {
    throw new Error('Agent selector did not return an array');
  }

  const names = [];
  selectedNames
    .map((name) => String(name).toLowerCase().trim())
    .filter((name) => enabledNames.includes(name))
    .forEach((name) => {
      if (!names.includes(name)) names.push(name);
    });

  if (names.length === 0) {
    throw new Error('Agent selector returned no enabled agents');
  }

  return names;
}

// Selects the right specialist agent(s) and returns { agent, agents, reply }.
async function routeMessage(message, history, disabledAgents) {
  const agentNames = await selectAgents(message, disabledAgents);

  const steps = [];
  let currentHistory = [...history];

  for (const name of agentNames) {
    const reply = await callVibeProxy({ message, history: currentHistory, systemPrompt: AGENT_SYSTEM_PROMPTS[name] });
    steps.push({ agent: name, reply });
    currentHistory = [...currentHistory, { role: 'assistant', content: reply }];
  }

  const reply = steps.length > 1
    ? steps.map(({ agent, reply: text }) => `[${agent}] ${text}`).join('\n\n')
    : steps[0]?.reply || 'No response returned.';

  return { agent: agentNames[0], agents: agentNames, reply };
}

const state = {
  history: [],
  agentPanelVisible: true,
  disabledAgents: [],
  theme: DEFAULT_THEME,
  universe: 'default'
};

function safeParseHistory(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function persistState() {
  const payload = {
    history: state.history,
    disabledAgents: state.disabledAgents,
    agentPanelVisible: state.agentPanelVisible,
    theme: state.theme,
    universe: state.universe
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const hydrate = raw ? JSON.parse(raw) : null;

  localStorage.removeItem('multi-agent-chat-state');

  if (hydrate && typeof hydrate === 'object') {
    state.history = Array.isArray(hydrate.history) ? hydrate.history : [];
    state.disabledAgents = Array.isArray(hydrate.disabledAgents) ? hydrate.disabledAgents : [];
    state.agentPanelVisible = hydrate.agentPanelVisible !== false;
    state.theme = hydrate.theme === 'light' ? 'light' : DEFAULT_THEME;
    state.universe = hydrate.universe || 'default';
  }

  input.disabled = false;
  button.disabled = false;
  input.focus();
}

function addMessage(role, text, details = '') {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'You' : role === 'bot' ? 'AI' : '…';

  const bubbleWrap = document.createElement('div');
  bubbleWrap.className = 'message-bubble';

  if (details) {
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = details;
    bubbleWrap.appendChild(meta);
  }

  const content = document.createElement('div');
  content.textContent = text;
  bubbleWrap.appendChild(content);

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubbleWrap);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderHistory() {
  chatWindow.innerHTML = '';

  if (!state.history.length) {
    addMessage('bot', 'Hello! I am the orchestrator. I will route your prompt to the right specialist agent: comedian, scientist, or inspector.');
    return;
  }

  state.history.forEach((entry) => {
    if (entry.role === 'assistant') {
      addMessage('bot', entry.content, 'assistant');
    } else if (entry.role === 'user') {
      addMessage('user', entry.content, 'you');
    } else {
      addMessage('system', entry.content, 'system');
    }
  });
}

function setStatus(text, ok = true) {
  status.textContent = text;
  status.style.borderColor = ok ? 'rgba(34, 197, 94, 0.65)' : 'rgba(248, 113, 113, 0.7)';
  status.style.color = ok ? '#d1fae5' : '#fee2e2';
  status.style.background = ok ? 'rgba(34, 197, 94, 0.12)' : 'rgba(248, 113, 113, 0.14)';
}

function syncTheme() {
  document.body.classList.toggle('theme-light', state.theme === 'light');
  document.body.classList.toggle('theme-dark', state.theme !== 'light');
  themeToggle.textContent = state.theme === 'light' ? '🌙' : '☀️';
  persistState();
}

function syncAgentPanel() {
  const visible = state.agentPanelVisible;

  agentPanel.classList.toggle('collapsed', !visible);
  agentList.classList.toggle('hidden', !visible);
  agentToggle.classList.toggle('is-off', !visible);
  agentToggle.textContent = visible ? 'On' : 'Off';
  agentToggle.setAttribute('aria-pressed', String(visible));
  persistState();
}

function syncAgentButtons() {
  agentButtons.forEach((button) => {
    const agentName = button.dataset.agent;
    const isDisabled = state.disabledAgents.includes(agentName);

    button.classList.toggle('off', isDisabled);
    button.setAttribute('aria-pressed', String(!isDisabled));
  });
  persistState();
}

function syncUniverse() {
  universeSelect.value = state.universe;
  persistState();
}

function updateTrace(prompt, agent) {
  tracePrompt.textContent = prompt || 'No prompt yet';
  traceAgent.textContent = agent || 'Waiting...';
}

function isComedyPrompt(message) {
  return /(joke|funny|laugh|comedy|humor|pun|roast|standup|banter|giggle|hilarious)/i.test(message);
}

agentToggle.addEventListener('click', () => {
  state.agentPanelVisible = !state.agentPanelVisible;
  syncAgentPanel();
});

agentButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const agentName = button.dataset.agent;
    if (state.disabledAgents.includes(agentName)) {
      state.disabledAgents = state.disabledAgents.filter((name) => name !== agentName);
    } else {
      state.disabledAgents = [...state.disabledAgents, agentName];
    }

    syncAgentButtons();
  });
});

function playTone(type = 'send') {
  if (!('AudioContext' in window || 'webkitAudioContext' in window)) {
    return;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtor();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = type === 'send' ? 'triangle' : 'sine';
  oscillator.frequency.value = type === 'send' ? 520 : 180;
  gainNode.gain.value = 0.04;

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.08);
}

themeToggle.addEventListener('click', () => {
  state.theme = state.theme === 'light' ? DEFAULT_THEME : 'light';
  syncTheme();
  playTone('receive');
});

clearHistoryButton.addEventListener('click', () => {
  state.history = [];
  renderHistory();
  persistState();
  updateTrace('History cleared', 'Orchestrator');
  setStatus('History cleared', true);
});

universeSelect.addEventListener('change', (event) => {
  state.universe = event.target.value;
  syncUniverse();
  setStatus(`Universe: ${state.universe}`, true);
});

async function sendMessage(event) {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) return;

  const cleanMessage = message.replace(/\s+/g, ' ');
  input.value = '';
  addMessage('user', cleanMessage, 'you');
  state.history.push({ role: 'user', content: cleanMessage });

  if (isComedyPrompt(cleanMessage) && state.disabledAgents.includes('comedian')) {
    const unavailableMessage = 'The comedian agent is disabled. Enable it to request a joke.';
    addMessage('bot', unavailableMessage, 'orchestrator');
    state.history.push({ role: 'assistant', content: unavailableMessage });
    updateTrace(cleanMessage, 'comedian disabled');
    setStatus('Comedian is disabled', false);
    persistState();
    return;
  }

  button.disabled = true;
  input.disabled = true;
  setStatus('Thinking...', true);

  const waiting = document.createElement('div');
  waiting.className = 'message system';
  waiting.innerHTML = '<div class="message-avatar">…</div><div class="message-bubble"><span class="spinner"></span> Working on your answer...</div>';
  chatWindow.appendChild(waiting);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const historyBeforeReply = state.history.slice(0, -1);
    const { agent, reply } = await routeMessage(cleanMessage, historyBeforeReply, state.disabledAgents);

    const systemMessage = document.querySelector('.message.system:last-of-type');
    if (systemMessage) {
      systemMessage.remove();
    }

    if (!reply) {
      throw new Error('No response returned.');
    }

    const agentLabel = agent || 'orchestrator';
    addMessage('bot', reply, agentLabel);

    updateTrace(cleanMessage, agentLabel);
    state.history.push({ role: 'assistant', content: reply });
    setStatus('Ready to chat', true);
    persistState();
    playTone('send');
  } catch (error) {
    const systemMessage = document.querySelector('.message.system:last-of-type');
    if (systemMessage) {
      systemMessage.remove();
    }
    addMessage('bot', `Error: ${error.message}`, 'assistant');
    setStatus('Need attention', false);
  } finally {
    button.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', sendMessage);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

restoreState();
renderHistory();
updateTrace('Waiting for first prompt', 'Orchestrator');
syncAgentPanel();
syncAgentButtons();
syncTheme();
syncUniverse();

input.disabled = false;
button.disabled = false;
input.focus();
input.value = '';
