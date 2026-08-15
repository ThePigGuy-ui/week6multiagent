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
const apiKeyInput = document.getElementById('api-key-input');
const connectButton = document.getElementById('connect-button');
const connectionStatus = document.getElementById('connection-status');

const state = {
  history: [],
  agentPanelVisible: true,
  disabledAgents: [],
  apiKeyConnected: false
};

function addMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  wrapper.textContent = text;
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setStatus(text, ok = true) {
  status.textContent = text;
  status.style.borderColor = ok ? 'rgba(34, 197, 94, 0.65)' : 'rgba(248, 113, 113, 0.7)';
  status.style.color = ok ? '#d1fae5' : '#fee2e2';
  status.style.background = ok ? 'rgba(34, 197, 94, 0.12)' : 'rgba(248, 113, 113, 0.14)';
}

function syncAgentPanel() {
  const visible = state.agentPanelVisible;

  agentPanel.classList.toggle('collapsed', !visible);
  agentList.classList.toggle('hidden', !visible);
  agentToggle.classList.toggle('is-off', !visible);
  agentToggle.textContent = visible ? 'On' : 'Off';
  agentToggle.setAttribute('aria-pressed', String(visible));
}

function syncAgentButtons() {
  agentButtons.forEach((button) => {
    const agentName = button.dataset.agent;
    const isDisabled = state.disabledAgents.includes(agentName);

    button.classList.toggle('off', isDisabled);
    button.setAttribute('aria-pressed', String(!isDisabled));
  });
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

async function loadHealth() {
  try {
    const response = await fetch('./api/health');
    const data = await response.json();
    setStatus(data.provider === 'openai' ? 'OpenAI ready' : 'Ollama ready', true);
  } catch (error) {
    setStatus('Demo mode', true);
  }
}

async function connectApiKey() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    connectionStatus.textContent = 'Please enter an API key';
    connectionStatus.className = 'connection-status error';
    return;
  }
  
  connectButton.disabled = true;
  connectionStatus.textContent = 'Connecting...';
  connectionStatus.className = 'connection-status connecting';
  
  try {
    console.log('Connecting with API key...');
    const response = await fetch('./api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello',
        history: [],
        disabledAgents: [],
        apiKey: apiKey
      })
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    if (response.ok) {
      state.apiKeyConnected = true;
      connectionStatus.textContent = '✓ Connected';
      connectionStatus.className = 'connection-status success';
      input.disabled = false;
      button.disabled = false;
      apiKeyInput.disabled = true;
      connectButton.style.display = 'none';
      setStatus('Ready to chat', true);
    } else {
      const errorMsg = data.error || 'Invalid API key or connection failed';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('Connection error:', error);
    state.apiKeyConnected = false;
    const errorMsg = error.message || 'Failed to connect';
    connectionStatus.textContent = `✗ ${errorMsg.substring(0, 40)}`;
    connectionStatus.className = 'connection-status error';
    connectButton.disabled = false;
    setStatus('Connection failed', false);
  }
}

connectButton.addEventListener('click', connectApiKey);
apiKeyInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectApiKey();
  }
});

async function sendMessage(event) {
  event.preventDefault();

  if (!state.apiKeyConnected) {
    setStatus('Please connect API key first', false);
    return;
  }

  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  addMessage('user', message);
  state.history.push({ role: 'user', content: message });

  button.disabled = true;
  input.disabled = true;
  setStatus('Thinking...', true);

  addMessage('system', 'Working on your answer...');

  try {
    const response = await fetch('./api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: state.history,
        disabledAgents: state.disabledAgents,
        apiKey: apiKeyInput.value.trim()
      })
    });

    const data = await response.json();

    const systemMessage = document.querySelector('.message.system:last-of-type');
    if (systemMessage) {
      systemMessage.remove();
    }

    if (!response.ok) {
      throw new Error(data.error || 'The model returned an error.');
    }

    const steps = Array.isArray(data.steps) && data.steps.length
      ? data.steps
      : [{ agent: data.agent, reply: data.reply }];

    steps.forEach(({ agent, reply }) => {
      const label = agent ? ` [${agent}]` : '';
      addMessage('bot', `${reply}${label}`);
    });

    const lastReply = steps[steps.length - 1]?.reply || data.reply || '';
    updateTrace(message, Array.isArray(data.agents) ? data.agents.join(' -> ') : (data.agent || 'unknown'));
    state.history.push({ role: 'assistant', content: lastReply });
    setStatus(`Ready: ${data.agent || 'assistant'}`, true);
  } catch (error) {
    addMessage('bot', `Error: ${error.message}`);
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

addMessage('bot', 'Hello! I am the orchestrator. I will route your prompt to the right specialist agent: comedian, scientist, or inspector.');
updateTrace('Waiting for first prompt', 'Orchestrator');
syncAgentPanel();

// Disable chat until API key is connected
input.disabled = true;
button.disabled = true;
syncAgentButtons();
loadHealth();
