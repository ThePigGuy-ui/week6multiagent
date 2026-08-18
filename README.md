# Multi-Agent Chat Orchestrator

This project is a small Express-based chat app that now routes user prompts through a top-level orchestrator to one of three specialist agents:

- Comedian
- Scientist
- Inspector

Each agent has its own file and uses the same Vibe proxy/Ollama call pattern as the original app, while the orchestrator decides which persona should respond based on the user prompt.

## Project structure

- `server.js` — Express server and main `/api/chat` route
- `agents/shared.js` — shared LLM call logic for conversation history and provider fallback
- `agents/orchestrator.js` — picks the correct agent based on prompt intent
- `agents/comedian.js` — humorous, witty responder
- `agents/scientist.js` — structured, evidence-based scientific responder
- `agents/inspector.js` — detective-style investigator responder
- `public/` — browser front end
- `tests/orchestrator.test.js` — routing validation tests

## How the app works

1. The browser sends a message to `/api/chat`.
2. The server passes the prompt to the orchestrator.
3. The orchestrator inspects the message text and selects the best agent.
4. The selected agent calls the same underlying Vibe proxy/Ollama logic and returns its reply.
5. The frontend displays the message and the selected agent label.

## Environment setup

Create a `.env` file from `.env.example` and configure your provider values if needed:

```bash
PORT=3000
OLLAMA_BASE_URL=http://localhost:11434
```

The Vibe proxy API token is hardcoded in `server.js` (`VIBE_API_KEY`) rather than read from `.env`.

The app keeps the same fallback behavior as before:
- It tries the Vibe proxy first, using the token defined in `server.js`.
- If that fails, it falls back to Ollama.
- If neither is available, it returns a demo-mode fallback response.

## Run locally

```bash
npm install
npm start
```

The app will start on the first available port, which may shift if 3000 is occupied.

## Deploy the frontend to GitHub Pages

GitHub Pages hosts static files only; it cannot run `server.js` or provide the `/api/chat` route. Deploy the Node/Express server separately on a service such as Render, then set its public URL in `public/config.js`:

```js
window.APP_API_BASE_URL = 'https://your-express-server.example.com';
```

Set `FRONTEND_ORIGINS=https://thepigguy-ui.github.io` on the server deployment so browser requests from GitHub Pages are accepted. The GitHub Pages URL can then call the deployed backend instead of trying to call `/api/chat` on the static site.

## Verify routing

A routing test file is included:

```bash
node --test tests/orchestrator.test.js
```

This checks:
- science prompts route to the scientist
- detective prompts route to the inspector
- joke prompts route to the comedian
- the orchestrator returns an agent name and reply

## Notes

This version keeps the original app’s live LLM behavior while layering in the multi-agent orchestration pattern requested for the assignment.
