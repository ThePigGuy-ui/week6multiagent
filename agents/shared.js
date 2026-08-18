function buildConversationHistory(history = []) {
  return history
    .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim())
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content.trim()
    }));
}

async function callVibeProxy({ message, history = [], systemPrompt = '', apiKey = '' } = {}) {
  const endpoint = 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions';
  
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...buildConversationHistory(history),
    { role: 'user', content: message }
  ];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'class-chat-model',
      messages
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const details = data?.error?.message || data?.detail || 'Vibe proxy request failed';
    throw new Error(details);
  }

  return data.choices?.[0]?.message?.content?.trim() || 'No response returned by the model.';
}

async function callOllama({ message, history = [], systemPrompt = '' } = {}) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...buildConversationHistory(history),
    { role: 'user', content: message }
  ];

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3.2',
      messages,
      stream: false
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Ollama request failed');
  }

  return data.message?.content?.trim() || 'No response returned by Ollama.';
}

async function generateAgentReply({ message, history = [], systemPrompt = '', agentName = 'assistant', apiKey = '' } = {}) {
  if (apiKey) {
    try {
      return await callVibeProxy({ message, history, systemPrompt, apiKey });
    } catch (vibeError) {
      console.error(`${agentName} - Vibe proxy error:`, vibeError.message);
      try {
        return await callOllama({ message, history, systemPrompt, apiKey });
      } catch (ollamaError) {
        console.error(`${agentName} - Ollama error:`, ollamaError.message);
        return `Demo mode: ${agentName} is available, but no live model response is currently reachable. Error: ${vibeError.message}`;
      }
    }
  }

  try {
    return await callOllama({ message, history, systemPrompt, apiKey });
  } catch (ollamaError) {
    console.error(`${agentName} - Ollama fallback error:`, ollamaError.message);
    return `Demo mode: ${agentName} is available, but no live model response is currently reachable. Add a Vibe proxy key or start Ollama to enable live responses.`;
  }
}

module.exports = {
  buildConversationHistory,
  callVibeProxy,
  callOllama,
  generateAgentReply
};
