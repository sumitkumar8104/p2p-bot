// ════════════════════════════════════════════════════════════════════
//  server.js — Binance P2P Merchant Dashboard  (v3 — Security Hardened)
// ════════════════════════════════════════════════════════════════════
//
//  Security features in this version:
//    • Human-like random delay before auto-replies (2-5 seconds)
//    • Per-order message rate limiting (max 5 msgs / 5 min per order)
//    • Global outbound rate limiter (max 30 msgs / minute)
//    • Message deduplication via UUID tracking
//    • WebSocket auto-reconnection with exponential backoff
//    • REST API rate limiting (max 10 req/min on /api/orders)
//    • Audit log to file for accountability
//    • Input sanitization on outbound messages
//    • Graceful shutdown handler
//
// ════════════════════════════════════════════════════════════════════

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const axios = require("axios");
const crypto = require("crypto");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

// ── Environment variables ────────────────────────────────────────
const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
const PORT = process.env.PORT || 3000;

// Auto-reply message template (customise as you wish).
// NOTE: Avoid mentioning PAN/bank/card/verification — Binance content
//       filter will reject it and store it as type "error".
const AUTO_REPLY_TEXT =
  "Hello! Thank you for placing an order with us. We will assist you shortly. Please wait a moment.";

if (!API_KEY || !API_SECRET) {
  console.error("❌  BINANCE_API_KEY and BINANCE_API_SECRET must be set in .env");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
//  SECURITY MODULE — Rate Limiters, Deduplication, Audit Log
// ═══════════════════════════════════════════════════════════════════

// ── Audit Logger ─────────────────────────────────────────────────
// Writes every bot action to a file for accountability & debugging.
const LOG_DIR = path.join(__dirname, "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function auditLog(event, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  const line = JSON.stringify(entry) + "\n";
  const fileName = `audit-${new Date().toISOString().slice(0, 10)}.log`;
  fs.appendFileSync(path.join(LOG_DIR, fileName), line);
}

// ── Message Deduplication ────────────────────────────────────────
// Tracks UUIDs of messages we've already processed to prevent
// double-handling if Binance delivers the same message twice.
const processedMessageIds = new Set();
const MAX_DEDUP_SIZE = 5000; // Prevent memory leak

function isDuplicate(uuid) {
  if (!uuid) return false;
  if (processedMessageIds.has(uuid)) return true;
  processedMessageIds.add(uuid);
  // Prune old entries if set gets too large
  if (processedMessageIds.size > MAX_DEDUP_SIZE) {
    const iter = processedMessageIds.values();
    for (let i = 0; i < 1000; i++) iter.next();
    // Delete oldest 1000
    let count = 0;
    for (const val of processedMessageIds) {
      if (count++ >= 1000) break;
      processedMessageIds.delete(val);
    }
  }
  return false;
}

// ── Per-Order Rate Limiter ───────────────────────────────────────
// Max 5 outbound messages per order within a 5-minute window.
// Prevents spam loops and keeps the bot looking human.
const orderMessageCounts = new Map(); // orderNo → { count, resetAt }
const ORDER_MSG_LIMIT = 5;
const ORDER_MSG_WINDOW = 5 * 60 * 1000; // 5 minutes

function canSendToOrder(orderNo) {
  const now = Date.now();
  const entry = orderMessageCounts.get(orderNo);
  if (!entry || now > entry.resetAt) {
    orderMessageCounts.set(orderNo, { count: 1, resetAt: now + ORDER_MSG_WINDOW });
    return true;
  }
  if (entry.count >= ORDER_MSG_LIMIT) {
    console.warn(`⚠️  Rate limit: order ${orderNo} hit ${ORDER_MSG_LIMIT} msgs in window`);
    auditLog("RATE_LIMIT_ORDER", { orderNo, count: entry.count });
    return false;
  }
  entry.count++;
  return true;
}

// ── Global Outbound Rate Limiter ─────────────────────────────────
// Max 30 messages per minute across ALL orders combined.
// Mirrors what a human merchant could realistically type.
const globalOutbound = { count: 0, resetAt: Date.now() + 60000 };
const GLOBAL_MSG_LIMIT = 30;

function canSendGlobally() {
  const now = Date.now();
  if (now > globalOutbound.resetAt) {
    globalOutbound.count = 1;
    globalOutbound.resetAt = now + 60000;
    return true;
  }
  if (globalOutbound.count >= GLOBAL_MSG_LIMIT) {
    console.warn("⚠️  Global rate limit reached (30/min)");
    auditLog("RATE_LIMIT_GLOBAL", { count: globalOutbound.count });
    return false;
  }
  globalOutbound.count++;
  return true;
}

// ── Human-Like Delay ─────────────────────────────────────────────
// Adds a random 2-5 second delay before auto-replies so the bot
// doesn't respond instantly (which looks suspicious to Binance).
function humanDelay() {
  const ms = 2000 + Math.random() * 3000; // 2–5 seconds
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Input Sanitization ───────────────────────────────────────────
// Strip any potentially dangerous characters from outbound messages.
function sanitize(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[<>]/g, "")         // strip HTML-like chars
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // strip control chars
    .trim()
    .slice(0, 500); // max 500 characters per message
}

// ── REST Rate Limiter (for /api/orders) ──────────────────────────
// Simple in-memory rate limiter: max 10 requests per minute per IP.
const restRateLimits = new Map(); // ip → { count, resetAt }

function restRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = restRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    restRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return next();
  }
  if (entry.count >= 10) {
    auditLog("REST_RATE_LIMIT", { ip, path: req.path });
    return res.status(429).json({ success: false, error: "Too many requests. Try again in a minute." });
  }
  entry.count++;
  next();
}

// ═══════════════════════════════════════════════════════════════════
//  Express + Socket.io Setup
// ═══════════════════════════════════════════════════════════════════

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

// ═══════════════════════════════════════════════════════════════════
//  HMAC-SHA256 Signature Generator
// ═══════════════════════════════════════════════════════════════════
//
//  Binance SAPI endpoints require a signature computed as follows:
//
//    1. Build a "query string" from ALL request parameters
//       (including `timestamp`).
//       Example: "recvWindow=5000&timestamp=1699999999999"
//
//    2. Compute HMAC-SHA256 of that query string using your
//       API Secret as the key.
//
//    3. Append the hex-encoded result as `&signature=<hex>` to
//       the query string you send with the request.
//
// ═══════════════════════════════════════════════════════════════════

function signRequest(params) {
  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(queryString)
    .digest("hex");

  return { queryString, signature };
}

// ═══════════════════════════════════════════════════════════════════
//  GET /api/orders — Fetch P2P orders from Binance
// ═══════════════════════════════════════════════════════════════════
//
//  Uses POST /sapi/v1/c2c/orderMatch/listUserOrderHistory
//  This is the documented public SAPI endpoint for C2C order history.
//
// ═══════════════════════════════════════════════════════════════════

app.get("/api/orders", restRateLimit, async (req, res) => {
  try {
    async function fetchSide(tradeType) {
      const params = {
        tradeType,
        page: 1,
        rows: 50,
        recvWindow: 10000,
        timestamp: Date.now(),
      };
      const { queryString, signature } = signRequest(params);
      const url = `https://api.binance.com/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryString}&signature=${signature}`;

      console.log(`    → Calling listUserOrderHistory (${tradeType})…`);

      const response = await axios.get(url, {
        headers: { "X-MBX-APIKEY": API_KEY },
      });
      return response.data?.data ?? response.data ?? [];
    }

    console.log("📋  Fetching P2P orders (BUY + SELL)…");
    auditLog("FETCH_ORDERS");

    const errors = [];

    const [sellOrders, buyOrders] = await Promise.all([
      fetchSide("SELL").catch((e) => {
        const detail = e.response?.data || e.message;
        console.warn("⚠️  SELL orders fetch failed:", JSON.stringify(detail));
        errors.push(`SELL: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`);
        return [];
      }),
      fetchSide("BUY").catch((e) => {
        const detail = e.response?.data || e.message;
        console.warn("⚠️  BUY orders fetch failed:", JSON.stringify(detail));
        errors.push(`BUY: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`);
        return [];
      }),
    ]);

    const orders = [...sellOrders, ...buyOrders];
    console.log(`✅  Received ${orders.length} orders.`);
    auditLog("ORDERS_RECEIVED", { count: orders.length });

    res.json({ success: true, orders, errors });
  } catch (err) {
    console.error("❌  Failed to fetch orders:", err.response?.data || err.message);
    auditLog("FETCH_ORDERS_ERROR", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.response?.data?.msg || err.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  GET /api/chat/:orderNo — Fetch chat history for an order
// ═══════════════════════════════════════════════════════════════════

app.get("/api/chat/:orderNo", restRateLimit, async (req, res) => {
  try {
    const { orderNo } = req.params;
    const params = {
      orderNo,
      page: 1,
      rows: 100,
      recvWindow: 10000,
      timestamp: Date.now(),
    };
    const { queryString, signature } = signRequest(params);
    const url = `https://api.binance.com/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?${queryString}&signature=${signature}`;

    console.log(`💬  Fetching chat history for order ${orderNo}…`);

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": API_KEY, clientType: "WEB" },
    });

    const messages = response.data?.data ?? response.data ?? [];
    console.log(`✅  Got ${Array.isArray(messages) ? messages.length : '?'} messages for ${orderNo}`);

    res.json({ success: true, messages });
  } catch (err) {
    // If chat endpoint doesn't exist, try alternative
    console.warn("⚠️  Chat history fetch failed:", err.response?.data || err.message);
    res.json({ success: false, messages: [], error: err.response?.data?.msg || err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  Binance Chat Credential Retrieval
// ═══════════════════════════════════════════════════════════════════

async function getChatCredentials() {
  const params = { recvWindow: 5000, timestamp: Date.now() };
  const { queryString, signature } = signRequest(params);
  const url = `https://api.binance.com/sapi/v1/c2c/chat/retrieveChatCredential?${queryString}&signature=${signature}`;

  console.log("🔑  Requesting chat credentials from Binance…");
  auditLog("FETCH_CHAT_CREDENTIALS");

  const response = await axios.get(url, {
    headers: { "X-MBX-APIKEY": API_KEY, clientType: "WEB" },
  });

  const data = response.data?.data ?? response.data;
  console.log("✅  Chat credentials received.");
  return data;
}
// ═══════════════════════════════════════════════════════════════════
//  Send Chat Message via WebSocket (flat format — matches Binance WS)
// ═══════════════════════════════════════════════════════════════════
//
//  Binance WS messages use this flat structure:
//
//    {
//      "type": "text",
//      "content": "...",
//      "topicId": "<orderNo>",      ← KEY: uses topicId, not orderNo!
//      "topicType": "ORDER",
//      "orderNo": "<orderNo>",      ← also include for compatibility
//      "sourceType": "contact",
//      "uuid": "<unique-id>",
//      "clientType": "web"
//    }
//
//  The method/params wrapper (chat.send) is completely ignored.
//  This flat format was confirmed to store AND deliver messages.
//
// ═══════════════════════════════════════════════════════════════════

function sendChatMessageViaWS(ws, orderNo, content) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: "WebSocket not connected" };
  }

  const msgUuid = uuidv4();

  const payload = {
    type: "text",
    content: content,
    topicId: orderNo,
    topicType: "ORDER",
    orderNo: orderNo,
    sourceType: "contact",
    uuid: msgUuid,
    clientType: "web",
  };

  console.log("📤  Sending via WS (flat):", JSON.stringify(payload).slice(0, 250));
  auditLog("WS_MSG_SENDING", { orderNo, uuid: msgUuid });

  sentUUIDs.add(msgUuid); // Track so we skip the Binance echo
  ws.send(JSON.stringify(payload));
  return { success: true, id: msgUuid };
}

// ═══════════════════════════════════════════════════════════════════
//  Sent UUID Tracking + Auto-Reply Throttle
// ═══════════════════════════════════════════════════════════════════

// Track UUIDs of messages WE sent — so we can skip Binance echoes
const sentUUIDs = new Set();
const autoReplyCounts = new Map(); // orderNo → count

// ═══════════════════════════════════════════════════════════════════
//  WebSocket Connection Manager + Auto-Reconnection
// ═══════════════════════════════════════════════════════════════════

const binanceConnections = new Map(); // socketId → WebSocket

// Auto-reconnection state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let lastCredentials = null;
let lastIoSocket = null;

function connectToBinanceChat(credentials, ioSocket) {
  const { chatWssUrl, listenKey, listenToken } = credentials;
  const wsUrl = `${chatWssUrl}/${listenKey}?token=${listenToken}&clientType=web`;

  // Store for reconnection
  lastCredentials = credentials;
  lastIoSocket = ioSocket;

  console.log(`🔌  Connecting to Binance WebSocket…`);
  auditLog("WS_CONNECTING", { url: wsUrl.slice(0, 60) });

  const ws = new WebSocket(wsUrl);

  // ── Connection opened ──────────────────────────────────────────
  ws.on("open", () => {
    console.log("🟢  Binance WebSocket connected.");
    reconnectAttempts = 0; // Reset backoff on successful connect
    auditLog("WS_CONNECTED");
    ioSocket.emit("status", {
      type: "connected",
      message: "Connected to Binance P2P Chat WebSocket.",
    });
  });

  // ── Incoming message from Binance ──────────────────────────────
  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());

      // ── Handle responses to our send calls ─────────────────────
      if (parsed.id && (parsed.result !== undefined || parsed.error)) {
        if (parsed.error) {
          console.error("❌  WS Error for id", parsed.id, ":", JSON.stringify(parsed.error));
          io.emit("status", { type: "error", message: `Send error: ${JSON.stringify(parsed.error)}` });
        } else {
          console.log("✅  WS OK for id", parsed.id);
        }
        return;
      }

      // ── Handle statistics/pong ─────────────────────────────────
      if (parsed.type === "statistics" || parsed.type === "pong") {
        // Suppress verbose stats logging (too noisy)
        io.emit("ws-stats", parsed);
        return;
      }

      // ── Normalize fields ────────────────────────────────────────
      //    Binance WS uses topicId (not orderNo!) for the order number.
      //    fromNickname has lowercase 'n' (not fromNickName).
      const msg = {
        type:      parsed.type || parsed.msgType || parsed.messageType || "unknown",
        orderNo:   parsed.orderNo || parsed.topicId || parsed.order_no || parsed.orderNumber || "",
        content:   parsed.content || parsed.message || parsed.msg || parsed.text || "",
        self:      parsed.self ?? parsed.isSelf ?? null,
        uuid:      parsed.uuid || "",
        createTime: parsed.createTime || parsed.timestamp || Date.now(),
        fromNickName: parsed.fromNickname || parsed.fromNickName || parsed.nickName || "",
        groupId:   parsed.groupId || "",
      };

      // Fallback: check nested data object
      if (!msg.orderNo && parsed.data) {
        msg.orderNo = parsed.data.orderNo || parsed.data.topicId || "";
        msg.content = msg.content || parsed.data.content || "";
        msg.self = msg.self ?? parsed.data.self;
      }

      console.log(`📩  [${msg.orderNo?.slice(-6)||'???'}] ${msg.self?'→':'←'} "${(msg.content||'').slice(0,50)}" (type=${msg.type})`);

      // ── Skip if no meaningful content ──────────────────────────
      if (!msg.orderNo && !msg.content && msg.type === "unknown") {
        console.log("⏭  Skipping (no orderNo, no content)");
        return;
      }

      // ── Deduplication ─────────────────────────────────────────
      if (msg.uuid && isDuplicate(msg.uuid)) {
        console.log("🔁  Skipping duplicate:", msg.uuid);
        return;
      }

      // ── Skip Binance echoes of OUR sent messages ──────────────
      //    When we send via WS, Binance echoes it back.
      //    We already showed it locally, so skip the echo.
      if (msg.uuid && sentUUIDs.has(msg.uuid)) {
        console.log("🔁  Skipping our own echo:", msg.uuid);
        sentUUIDs.delete(msg.uuid); // cleanup
        return;
      }

      auditLog("MSG_RECEIVED", {
        orderNo: msg.orderNo,
        self: msg.self,
        type: msg.type,
        contentPreview: (msg.content || "").slice(0, 50),
      });

      // ── Broadcast normalized message to frontends ─────────────
      io.emit("chat-message", msg);

      // ── Auto-reply logic — ONLY for actual text messages ─────────
      //    Uses normalized msg object (handles different field names)
      const currentCount = autoReplyCounts.get(msg.orderNo) || 0;
      if (
        msg.self === false &&
        msg.orderNo &&
        (msg.type === "text" || msg.type === "TEXT") &&
        currentCount < 3
      ) {
        autoReplyCounts.set(msg.orderNo, currentCount + 1);
        // Check rate limits before sending
        if (!canSendToOrder(msg.orderNo) || !canSendGlobally()) {
          console.warn("⚠️  Auto-reply blocked by rate limiter for", msg.orderNo);
          return;
        }

        // Human-like delay before responding
        humanDelay().then(() => {
          if (ws.readyState !== WebSocket.OPEN) return;

          console.log("🤖  Auto-replying to order", msg.orderNo, "via WS chat.send…");
          auditLog("AUTO_REPLY_SENDING", {
            orderNo: msg.orderNo,
            content: AUTO_REPLY_TEXT.slice(0, 50),
          });

          const result = sendChatMessageViaWS(ws, msg.orderNo, AUTO_REPLY_TEXT);

          if (result.success) {
            console.log("✅  Auto-reply sent for order", msg.orderNo, "(id:", result.id, ")");
            auditLog("AUTO_REPLY_SENT", { orderNo: msg.orderNo, id: result.id });

            io.emit("chat-message", {
              type: "text",
              orderNo: msg.orderNo,
              content: AUTO_REPLY_TEXT,
              uuid: result.id,
              self: true,
              createTime: Date.now(),
              _autoReply: true,
              _echoed: true,
            });
          } else {
            console.error("❌  Auto-reply FAILED:", result.error);
            const count = autoReplyCounts.get(msg.orderNo) || 1;
            autoReplyCounts.set(msg.orderNo, Math.max(0, count - 1));
          }
        });
      }
    } catch {
      io.emit("chat-message", { raw: raw.toString() });
    }
  });

  // ── WebSocket error ────────────────────────────────────────────
  ws.on("error", (err) => {
    console.error("🔴  Binance WS error:", err.message);
    auditLog("WS_ERROR", { error: err.message });
    ioSocket.emit("status", {
      type: "error",
      message: `WebSocket error: ${err.message}`,
    });
  });

  // ── WebSocket closed — auto-reconnect with exponential backoff ─
  ws.on("close", (code, reason) => {
    console.log(`⚪  Binance WS closed (${code}): ${reason}`);
    auditLog("WS_CLOSED", { code, reason: reason?.toString() });
    binanceConnections.delete(ioSocket.id);

    ioSocket.emit("status", {
      type: "disconnected",
      message: `WebSocket closed (${code}). Attempting reconnection…`,
    });

    // ── Exponential backoff reconnection ─────────────────────────
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && lastCredentials) {
      reconnectAttempts++;
      // Backoff: 2s, 4s, 8s, 16s … capped at 60s
      const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 60000);

      console.log(`🔄  Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`);
      auditLog("WS_RECONNECTING", { attempt: reconnectAttempts, delayMs: delay });

      ioSocket.emit("status", {
        type: "info",
        message: `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})…`,
      });

      setTimeout(() => {
        // Try fresh credentials first, fall back to cached
        getChatCredentials()
          .then((creds) => connectToBinanceChat(creds, ioSocket))
          .catch(() => connectToBinanceChat(lastCredentials, ioSocket));
      }, delay);
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error("❌  Max reconnection attempts reached. Giving up.");
      auditLog("WS_RECONNECT_FAILED", { attempts: reconnectAttempts });
      ioSocket.emit("status", {
        type: "error",
        message: "Max reconnection attempts reached. Please reconnect manually.",
      });
    }
  });

  binanceConnections.set(ioSocket.id, ws);
}

// ═══════════════════════════════════════════════════════════════════
//  Socket.io Event Handlers
// ═══════════════════════════════════════════════════════════════════

io.on("connection", (ioSocket) => {
  console.log(`🔗  Frontend connected: ${ioSocket.id}`);
  auditLog("FRONTEND_CONNECTED", { socketId: ioSocket.id });

  // ── "connect-chat" ─────────────────────────────────────────────
  ioSocket.on("connect-chat", async () => {
    try {
      const existing = binanceConnections.get(ioSocket.id);
      if (existing && existing.readyState === WebSocket.OPEN) {
        existing.close();
      }

      reconnectAttempts = 0; // Reset on manual connect
      ioSocket.emit("status", { type: "info", message: "Fetching chat credentials…" });

      const credentials = await getChatCredentials();
      connectToBinanceChat(credentials, ioSocket);
    } catch (err) {
      console.error("❌  Failed to connect:", err.response?.data || err.message);
      auditLog("CONNECT_FAILED", { error: err.message });
      ioSocket.emit("status", {
        type: "error",
        message: `Connection failed: ${err.response?.data?.msg || err.message}`,
      });
    }
  });

  // ── "send-message" — manual message from dashboard (via REST) ───
  ioSocket.on("send-message", (payload) => {
    const ws = binanceConnections.get(ioSocket.id);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ioSocket.emit("status", {
        type: "error",
        message: "Not connected. Click 'Connect' first.",
      });
      return;
    }

    // ── Security: rate-limit manual messages too ─────────────────
    if (!canSendToOrder(payload.orderNo) || !canSendGlobally()) {
      ioSocket.emit("status", {
        type: "error",
        message: "Rate limit reached. Wait before sending more messages.",
      });
      return;
    }

    // ── Security: sanitize content ───────────────────────────────
    const cleanContent = sanitize(payload.content);
    if (!cleanContent) {
      ioSocket.emit("status", { type: "error", message: "Message is empty or invalid." });
      return;
    }

    console.log("📤  Manual send via WS →", payload.orderNo, cleanContent.slice(0, 50));
    auditLog("MANUAL_MSG_SENDING", {
      orderNo: payload.orderNo,
      content: cleanContent.slice(0, 50),
    });

    // Send via WebSocket (chat.send method)
    const result = sendChatMessageViaWS(ws, payload.orderNo, cleanContent);

    if (result.success) {
      console.log("✅  Manual message sent (id:", result.id, ")");

      io.emit("chat-message", {
        type: "text",
        orderNo: payload.orderNo,
        content: cleanContent,
        uuid: result.id,
        self: true,
        createTime: Date.now(),
        _echoed: true,
      });
    } else {
      console.error("❌  Manual send FAILED:", result.error);
      ioSocket.emit("status", {
        type: "error",
        message: `Send failed: ${result.error}`,
      });
    }
  });

  // ── Cleanup on frontend disconnect ─────────────────────────────
  ioSocket.on("disconnect", () => {
    console.log(`🔗  Frontend disconnected: ${ioSocket.id}`);
    auditLog("FRONTEND_DISCONNECTED", { socketId: ioSocket.id });
    const ws = binanceConnections.get(ioSocket.id);
    if (ws) {
      ws.close();
      binanceConnections.delete(ioSocket.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════

function gracefulShutdown(signal) {
  console.log(`\n🛑  ${signal} received. Shutting down gracefully…`);
  auditLog("SERVER_SHUTDOWN", { signal });

  // Close all Binance WebSockets
  for (const [id, ws] of binanceConnections) {
    ws.close();
    binanceConnections.delete(id);
  }

  server.close(() => {
    console.log("✅  Server closed.");
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ── Start the server ─────────────────────────────────────────────
server.listen(PORT, () => {
  auditLog("SERVER_STARTED", { port: PORT });
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║  Binance P2P Merchant Dashboard v3 — Security Hardened  ║
  ║  http://localhost:${PORT}                                  ║
  ║                                                          ║
  ║  Security:                                               ║
  ║    ✓ Human-like delay on auto-replies (2-5s)             ║
  ║    ✓ Per-order rate limit (5 msgs / 5 min)               ║
  ║    ✓ Global rate limit (30 msgs / min)                   ║
  ║    ✓ Message deduplication                               ║
  ║    ✓ Auto-reconnect with exponential backoff             ║
  ║    ✓ Audit logging to /logs                              ║
  ║    ✓ Input sanitization                                  ║
  ║    ✓ Graceful shutdown                                   ║
  ╚══════════════════════════════════════════════════════════╝
  `);
});
