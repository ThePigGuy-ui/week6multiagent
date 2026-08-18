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

// Send the user's prompt to the classroom proxy and return its raw response.
// The proxy follows the chat-completions format, so the answer is read from
// data.choices[0].message.content after the JSON response is parsed.
async function requestChat(message) {
  return fetch(VIBE_PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VIBE_PROXY_KEY}`
    },
    body: JSON.stringify({
      model: 'class-chat-model',
      messages: [{ role: 'user', content: message }]
    })
  });
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

  button.disabled = true;
  input.disabled = true;
  setStatus('Thinking...', true);

  const waiting = document.createElement('div');
  waiting.className = 'message system';
  waiting.innerHTML = '<div class="message-avatar">…</div><div class="message-bubble"><span class="spinner"></span> Working on your answer...</div>';
  chatWindow.appendChild(waiting);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const response = await requestChat(cleanMessage);

    const data = await response.json();
    const systemMessage = document.querySelector('.message.system:last-of-type');
    if (systemMessage) {
      systemMessage.remove();
    }

    if (!response.ok) {
      throw new Error(data?.error?.message || data?.error || 'The model returned an error.');
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new Error('The proxy returned an empty response.');
    }

    addMessage('bot', reply, 'classroom proxy');

    updateTrace(cleanMessage, 'classroom proxy');
    state.history.push({ role: 'assistant', content: reply });
    setStatus('Ready to chat', true);
    persistState();
    playTone('send');
  } catch (error) {
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
