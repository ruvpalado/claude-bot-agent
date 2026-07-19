require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful, concise assistant.";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "1024", 10);
const API_AUTH_TOKEN = process.env.API_AUTH_TOKEN; // optional shared secret to protect the API

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[warn] ANTHROPIC_API_KEY is not set. Set it in your environment / Railway variables."
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// In-memory conversation store: { [conversationId]: [{role, content}, ...] }
// NOTE: This resets whenever the server restarts/redeploys. For persistence
// across restarts, swap this for a database (Postgres/Redis on Railway).
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 20; // trim to keep prompt size sane

function requireAuth(req, res, next) {
  if (!API_AUTH_TOKEN) return next(); // auth disabled if no token configured
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token !== API_AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Health check — Railway uses this to confirm the service is alive
app.get("/health", (req, res) => {
  res.json({ status: "ok", model: MODEL, uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.json({
    name: "claude-bot-agent",
    endpoints: {
      health: "GET /health",
      chat: "POST /chat { message, conversationId? }",
      reset: "POST /reset { conversationId }",
    },
  });
});

// Main chat endpoint
app.post("/chat", requireAuth, async (req, res) => {
  try {
    const { message, conversationId = "default" } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "'message' (string) is required" });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY" });
    }

    const history = conversations.get(conversationId) || [];
    history.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const replyText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    history.push({ role: "assistant", content: replyText });

    // Trim history so it doesn't grow unbounded
    if (history.length > MAX_HISTORY_MESSAGES) {
      history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    }
    conversations.set(conversationId, history);

    res.json({
      reply: replyText,
      conversationId,
      usage: response.usage,
    });
  } catch (err) {
    console.error("Error in /chat:", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Internal server error" });
  }
});

// Clear a conversation's history
app.post("/reset", requireAuth, (req, res) => {
  const { conversationId = "default" } = req.body || {};
  conversations.delete(conversationId);
  res.json({ reset: true, conversationId });
});

app.listen(PORT, () => {
  console.log(`Claude bot agent listening on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
});
