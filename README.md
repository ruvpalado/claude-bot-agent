# Claude Bot Agent

A minimal, production-ready HTTP API that wraps Anthropic's Claude API behind
a small Express server — with conversation memory, an optional auth token,
and a health check endpoint. Built to deploy on **Railway** directly from a
**GitHub repository**.

## Endpoints

| Method | Path      | Body                                  | Description                          |
|--------|-----------|----------------------------------------|--------------------------------------|
| GET    | `/health` | —                                       | Health check (used by Railway)       |
| GET    | `/`       | —                                       | Basic service info                   |
| POST   | `/chat`   | `{ "message": "...", "conversationId": "optional" }` | Send a message, get Claude's reply   |
| POST   | `/reset`  | `{ "conversationId": "optional" }`     | Clear a conversation's history       |

Example request:

```bash
curl -X POST https://<your-app>.up.railway.app/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "conversationId": "user-123"}'
```

If you set `API_AUTH_TOKEN`, add a header to every request:

```bash
-H "Authorization: Bearer <API_AUTH_TOKEN>"
```

## Environment variables

See `.env.example`. Only `ANTHROPIC_API_KEY` is required.

| Variable            | Required | Default                          | Notes                                   |
|---------------------|----------|-----------------------------------|------------------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | —                                  | From console.anthropic.com                |
| `CLAUDE_MODEL`       | No       | `claude-sonnet-5`                 | Model name                                |
| `SYSTEM_PROMPT`      | No       | "You are a helpful, concise assistant." | Bot persona/instructions            |
| `MAX_TOKENS`         | No       | `1024`                            | Max reply length                          |
| `API_AUTH_TOKEN`     | No       | — (auth disabled)                 | If set, requires `Authorization: Bearer` |
| `PORT`               | No       | `3000`                             | Railway sets this automatically           |

Conversation history is kept **in memory** per `conversationId` and resets on
redeploy/restart. For durable history, swap the `Map` in `server.js` for
Postgres/Redis (Railway offers managed plugins for both).

## Run locally

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm start
```

Visit `http://localhost:3000/health` to confirm it's running.

## Deploy to Railway via GitHub

1. **Push this project to a GitHub repository.**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Claude bot agent"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Create the Railway project.**
   - Go to [railway.app](https://railway.app) and sign in (GitHub login is easiest).
   - Click **New Project → Deploy from GitHub repo**.
   - Authorize Railway's GitHub app if prompted, then select your repo.

3. **Set environment variables.**
   - In the Railway project, open your service → **Variables** tab.
   - Add `ANTHROPIC_API_KEY` (required), and optionally `CLAUDE_MODEL`,
     `SYSTEM_PROMPT`, `MAX_TOKENS`, `API_AUTH_TOKEN`.
   - Do **not** set `PORT` — Railway injects it automatically.

4. **Deploy.**
   - Railway auto-detects Node via Nixpacks, runs `npm install`, then
     `npm start` (from `railway.json`/`Procfile`).
   - Watch the **Deployments** tab for build/runtime logs.

5. **Get your public URL.**
   - Go to the service's **Settings → Networking** and click **Generate Domain**
     to get a public `*.up.railway.app` URL (or attach a custom domain).
   - Test it: `curl https://<your-app>.up.railway.app/health`

6. **Redeploys.**
   - Every push to `main` (or your configured branch) auto-triggers a new
     Railway deployment — no extra steps needed.

## Extending this bot

- **Slack/Discord/Telegram**: add a platform-specific webhook route (e.g.
  `POST /slack/events`) that parses the incoming payload and calls the same
  Claude logic used in `/chat`.
- **Streaming replies**: use `anthropic.messages.stream(...)` and pipe chunks
  over SSE or a WebSocket instead of a single JSON response.
- **Persistent memory**: add Railway's Postgres or Redis plugin and replace
  the in-memory `Map` with reads/writes to it.
- **Rate limiting**: add `express-rate-limit` in front of `/chat` if exposing
  this publicly without `API_AUTH_TOKEN`.
