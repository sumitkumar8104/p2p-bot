const { auditLog } = require("../utils/logger");

// ── Message Deduplication ──
const processedMessageIds = new Set();
const MAX_DEDUP_SIZE = 5000;

function isDuplicate(uuid) {
  if (!uuid) return false;
  if (processedMessageIds.has(uuid)) return true;
  processedMessageIds.add(uuid);
  
  if (processedMessageIds.size > MAX_DEDUP_SIZE) {
    const iter = processedMessageIds.values();
    for (let i = 0; i < 1000; i++) {
        const val = iter.next().value;
        processedMessageIds.delete(val);
    }
  }
  return false;
}

// ── Rate Limiting Logic ──
const orderMessageCounts = new Map();
const ORDER_MSG_LIMIT = 5;
const ORDER_MSG_WINDOW = 5 * 60 * 1000;

const globalOutbound = { count: 0, resetAt: Date.now() + 60000 };
const GLOBAL_MSG_LIMIT = 30;

function canSendToOrder(orderNo) {
  const now = Date.now();
  const entry = orderMessageCounts.get(orderNo);
  if (!entry || now > entry.resetAt) {
    orderMessageCounts.set(orderNo, { count: 1, resetAt: now + ORDER_MSG_WINDOW });
    return true;
  }
  if (entry.count >= ORDER_MSG_LIMIT) {
    auditLog("RATE_LIMIT_ORDER", { orderNo, count: entry.count });
    return false;
  }
  entry.count++;
  return true;
}

function canSendGlobally() {
  const now = Date.now();
  if (now > globalOutbound.resetAt) {
    globalOutbound.count = 1;
    globalOutbound.resetAt = now + 60000;
    return true;
  }
  if (globalOutbound.count >= GLOBAL_MSG_LIMIT) {
    auditLog("RATE_LIMIT_GLOBAL", { count: globalOutbound.count });
    return false;
  }
  globalOutbound.count++;
  return true;
}

// ── Sanitization ──
function sanitize(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .slice(0, 500);
}

module.exports = {
  isDuplicate,
  canSendToOrder,
  canSendGlobally,
  sanitize
};
