const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const { getChatCredentials } = require("./binanceService");
const { handleIncomingMessage } = require("./botEngine");
const { auditLog } = require("../utils/logger");
const { isDuplicate, canSendToOrder, canSendGlobally, sanitize } = require("./securityService");
const binanceConfig = require("../config/binance");

let io;
const binanceConnections = new Map();
const sentUUIDs = new Set();
const processedOrders = new Set(); // Track orders that have already triggered the bot

// Reconnection state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let lastCredentials = null;

function initSocket(socketIoInstance) {
  io = socketIoInstance;
  io.on("connection", handleSocketConnection);
}

function handleSocketConnection(socket) {
  console.log(`🔗 Frontend connected: ${socket.id}`);
  auditLog("FRONTEND_CONNECTED", { socketId: socket.id });

  socket.on("connect-chat", async () => {
    try {
      const existing = binanceConnections.get(socket.id);
      if (existing && existing.readyState === WebSocket.OPEN) existing.close();

      reconnectAttempts = 0; // Reset on manual connect
      socket.emit("status", { type: "info", message: "Fetching chat credentials..." });
      const credentials = await getChatCredentials();
      connectToBinance(credentials, socket);
    } catch (err) {
      console.error("❌ Connection Failed:", err.message);
      socket.emit("status", { type: "error", message: `Connection failed: ${err.message}` });
    }
  });

  socket.on("send-message", (payload) => {
    const ws = binanceConnections.get(socket.id);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return socket.emit("status", { type: "error", message: "Not connected. Click 'Connect' first." });
    }

    if (!canSendToOrder(payload.orderNo) || !canSendGlobally()) {
      return socket.emit("status", { type: "error", message: "Rate limit reached." });
    }

    const cleanContent = sanitize(payload.content);
    if (!cleanContent) return socket.emit("status", { type: "error", message: "Invalid message." });

    const result = sendViaWS(ws, payload.orderNo, cleanContent);
    if (result.success) {
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
      socket.emit("status", { type: "error", message: `Send failed: ${result.error}` });
    }
  });

  socket.on("disconnect", () => {
    const ws = binanceConnections.get(socket.id);
    if (ws) {
      ws.close();
      binanceConnections.delete(socket.id);
    }
  });
}

function connectToBinance(credentials, socket) {
  const { chatWssUrl, listenKey, listenToken } = credentials;
  const wsUrl = `${chatWssUrl}/${listenKey}?token=${listenToken}&clientType=web`;

  lastCredentials = credentials;

  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("🟢 Binance WebSocket connected.");
    reconnectAttempts = 0;
    socket.emit("status", { type: "connected", message: "Connected to Binance P2P Chat." });
  });

  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      
      if (parsed.type === "statistics" || parsed.type === "pong") {
        io.emit("ws-stats", parsed);
        return;
      }

      const msg = normalizeMessage(parsed);
      if (!msg.orderNo && !msg.content && msg.type === "unknown") return;

      if (msg.uuid && isDuplicate(msg.uuid)) return;
      if (msg.uuid && sentUUIDs.has(msg.uuid)) {
        sentUUIDs.delete(msg.uuid);
        return;
      }

      io.emit("chat-message", msg);
      handleAutoReply(ws, msg);
    } catch (e) {
      console.error("❌ Message Parse Error:", e.message);
    }
  });

  ws.on("error", (err) => {
    console.error("🔴 Binance WS error:", err.message);
    socket.emit("status", { type: "error", message: `WebSocket error: ${err.message}` });
  });

  ws.on("close", (code, reason) => {
    console.log(`⚪ Binance WS closed (${code}): ${reason}`);
    binanceConnections.delete(socket.id);
    socket.emit("status", { type: "disconnected", message: "Binance WS closed. Reconnecting…" });

    // Exponential Backoff Reconnection
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && lastCredentials) {
      reconnectAttempts++;
      const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 60000);
      console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`);
      
      setTimeout(() => {
        getChatCredentials()
          .then((creds) => connectToBinance(creds, socket))
          .catch(() => connectToBinance(lastCredentials, socket));
      }, delay);
    }
  });

  binanceConnections.set(socket.id, ws);
}

function normalizeMessage(parsed) {
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

  if (!msg.orderNo && parsed.data) {
    msg.orderNo = parsed.data.orderNo || parsed.data.topicId || "";
    msg.content = msg.content || parsed.data.content || "";
    msg.self = msg.self ?? parsed.data.self;
  }
  return msg;
}

function sendViaWS(ws, orderNo, content) {
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
  sentUUIDs.add(msgUuid);
  ws.send(JSON.stringify(payload));
  return { success: true, id: msgUuid };
}

function humanDelay() {
  const ms = 2000 + Math.random() * 3000; // 2–5 seconds
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle auto-reply using the Bot Engine state machine.
 * Routes incoming peer messages through the verification flow.
 */
function handleAutoReply(ws, msg) {
  const { getOrder } = require("../utils/sharedCache");
  const orderData = getOrder(msg.orderNo);
  
  const isCorrectOrderType = orderData && orderData.tradeType === 'BUY';
  const isPeerTextMessage = msg.self === false && (msg.type === "text" || msg.type === "TEXT");
  
  if (!isCorrectOrderType || !isPeerTextMessage) return;

  // Rate limiting
  if (!canSendToOrder(msg.orderNo) || !canSendGlobally()) return;

  console.log(`🤖 Bot processing message for order ${msg.orderNo}: "${(msg.content || "").slice(0, 30)}..."`);

  // Process through bot engine asynchronously
  humanDelay().then(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const responses = await handleIncomingMessage(
        msg.orderNo,
        msg.content,
        msg,
        orderData
      );

      // Send each response with human-like delays
      for (const response of responses) {
        if (ws.readyState !== WebSocket.OPEN) break;
        if (!canSendToOrder(msg.orderNo) || !canSendGlobally()) break;

        await humanDelay();

        const result = sendViaWS(ws, msg.orderNo, response);
        if (result.success) {
          io.emit("chat-message", {
            type: "text",
            orderNo: msg.orderNo,
            content: response,
            uuid: result.id,
            self: true,
            createTime: Date.now(),
            _autoReply: true,
            _echoed: true,
          });
        }
      }
    } catch (err) {
      console.error(`❌ Bot engine error for ${msg.orderNo}:`, err.message);
      auditLog("BOT_ENGINE_ERROR", { orderNo: msg.orderNo, error: err.message });
    }
  });
}

function closeAllConnections() {
  for (const [id, ws] of binanceConnections) {
    ws.close();
    binanceConnections.delete(id);
  }
}

module.exports = { initSocket, closeAllConnections };
