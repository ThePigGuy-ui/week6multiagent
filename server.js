const express = require('express');
const path = require('path');
const { routeMessage } = require('./agents/orchestrator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    provider: 'vibe-proxy',
    message: 'Vibe proxy is configured.'
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], disabledAgents = [], apiKey = '' } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'A non-empty message is required.' });
    }

    const { agent, agents, reply, steps } = await routeMessage(message.trim(), history, { disabledAgents, apiKey });

    return res.json({ agent, agents, reply, steps });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error.message || 'Something went wrong while generating the reply.'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Chat app listening on http://localhost:${port}`);
    console.log('Using Vibe proxy at https://vibe-proxy-gqv4.onrender.com/v1/chat/completions');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = Number(port) + 1;
      console.warn(`Port ${port} is busy. Trying ${nextPort} instead.`);
      startServer(nextPort);
      return;
    }

    throw error;
  });
}

startServer(PORT);
