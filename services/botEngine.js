/**
 * Bot Engine — Core State Machine for P2P Payment Verification
 *
 * Manages the full lifecycle of each order:
 *   CREATED → WAITING_FOR_PAN → PAN_VALIDATING → PAN_VERIFIED
 *   → FETCHING_BENEFICIARY → NAME_MATCHING → NAME_MATCHED
 *   → CHECKING_BALANCE → PAYMENT_PROCESSING → PAYMENT_SUCCESS → COMPLETED
 *
 * Each order maintains isolated state to support concurrent sessions.
 */

const { getDb } = require("../config/database");
const binanceConfig = require("../config/binance");
const { verifyPan, validatePanFormat } = require("./panService");
const { matchNames } = require("./nameMatchService");
const { fetchBeneficiaryName } = require("./beneficiaryService");
const { checkWalletBalance, processPayment } = require("./paymentService");
const { fetchUserOrderDetails } = require("./binanceService");
const { hash } = require("../utils/encryption");
const { auditLog } = require("../utils/logger");

// ── Order States ──
const STATES = {
  CREATED: "CREATED",
  WAITING_FOR_PAN: "WAITING_FOR_PAN",
  PAN_VALIDATING: "PAN_VALIDATING",
  PAN_VERIFIED: "PAN_VERIFIED",
  FETCHING_BENEFICIARY: "FETCHING_BENEFICIARY",
  NAME_MATCHING: "NAME_MATCHING",
  NAME_MATCHED: "NAME_MATCHED",
  CHECKING_BALANCE: "CHECKING_BALANCE",
  PAYMENT_PROCESSING: "PAYMENT_PROCESSING",
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
};

// ── In-memory order sessions (for fast access, backed by DB) ──
const orderSessions = new Map();

/**
 * Get or create an order session
 * @param {string} orderNo
 * @param {object} [orderData] - Optional Binance order data
 * @returns {object} session
 */
function getSession(orderNo, orderData) {
  if (orderSessions.has(orderNo)) {
    return orderSessions.get(orderNo);
  }

  // Check database
  const db = getDb();
  const dbOrder = db.prepare("SELECT * FROM orders WHERE order_no = ?").get(orderNo);

  if (dbOrder) {
    const session = {
      orderNo,
      status: dbOrder.status,
      panAttempts: dbOrder.pan_attempts || 0,
      panHash: dbOrder.pan_hash,
      verifiedPanName: dbOrder.verified_pan_name,
      beneficiaryName: dbOrder.beneficiary_name,
      nameMatchScore: dbOrder.name_match_score,
      amount: dbOrder.amount,
      asset: dbOrder.asset,
      fiat: dbOrder.fiat,
      createdAt: dbOrder.created_at,
      updatedAt: dbOrder.updated_at,
      processing: false,
      orderData: orderData || {},
    };
    orderSessions.set(orderNo, session);
    return session;
  }

  // Create new session
  const session = {
    orderNo,
    status: STATES.CREATED,
    panAttempts: 0,
    panHash: null,
    verifiedPanName: null,
    beneficiaryName: null,
    nameMatchScore: null,
    amount: orderData?.amount || null,
    asset: orderData?.asset || null,
    fiat: orderData?.fiat || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    processing: false,
    orderData: orderData || {},
  };

  orderSessions.set(orderNo, session);

  // Persist to DB
  try {
    db.prepare(`
      INSERT OR IGNORE INTO orders (order_no, status, amount, asset, fiat, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(orderNo, STATES.CREATED, session.amount, session.asset, session.fiat);
  } catch (err) {
    console.error("❌ Error creating order in DB:", err.message);
  }

  auditLog("ORDER_SESSION_CREATED", { orderNo });
  return session;
}

/**
 * Update session state and persist to DB
 */
function updateSessionState(session, newStatus, extraFields = {}) {
  session.status = newStatus;
  session.updatedAt = new Date().toISOString();
  Object.assign(session, extraFields);

  try {
    const db = getDb();
    const fields = {
      status: newStatus,
      pan_attempts: session.panAttempts,
      pan_hash: session.panHash,
      verified_pan_name: session.verifiedPanName,
      beneficiary_name: session.beneficiaryName,
      name_match_score: session.nameMatchScore,
      updated_at: session.updatedAt,
    };

    db.prepare(`
      UPDATE orders SET
        status = ?, pan_attempts = ?, pan_hash = ?,
        verified_pan_name = ?, beneficiary_name = ?,
        name_match_score = ?, updated_at = ?
      WHERE order_no = ?
    `).run(
      fields.status, fields.pan_attempts, fields.pan_hash,
      fields.verified_pan_name, fields.beneficiary_name,
      fields.name_match_score, fields.updated_at,
      session.orderNo
    );
  } catch (err) {
    console.error("❌ Error updating order state:", err.message);
  }

  auditLog("ORDER_STATE_CHANGE", { orderNo: session.orderNo, newStatus });
}

/**
 * Main message handler — routes to appropriate state handler
 *
 * @param {string} orderNo - The order number
 * @param {string} messageContent - The user's message
 * @param {object} messageData - Full message data
 * @param {object} orderData - Cached order data from Binance
 * @returns {string[]} Array of bot response messages to send
 */
async function handleIncomingMessage(orderNo, messageContent, messageData, orderData) {
  const session = getSession(orderNo, orderData);

  // Prevent concurrent processing of the same order
  if (session.processing) {
    return []; // Skip — another handler is active
  }

  session.processing = true;

  try {
    // Check for terminal states
    if ([STATES.COMPLETED, STATES.REJECTED, STATES.EXPIRED].includes(session.status)) {
      return []; // No more responses for terminal orders
    }

    // Check expiry
    const ageMinutes = (Date.now() - new Date(session.createdAt).getTime()) / 60000;
    if (ageMinutes > binanceConfig.orderExpiryMinutes) {
      updateSessionState(session, STATES.EXPIRED);
      return [binanceConfig.messages.orderExpired];
    }

    const content = (messageContent || "").trim();

    switch (session.status) {
      case STATES.CREATED:
        return handleCreated(session, content);

      case STATES.WAITING_FOR_PAN:
        return await handleWaitingForPan(session, content);

      case STATES.PAN_VERIFIED:
      case STATES.FETCHING_BENEFICIARY:
      case STATES.NAME_MATCHING:
      case STATES.NAME_MATCHED:
      case STATES.CHECKING_BALANCE:
      case STATES.PAYMENT_PROCESSING:
        // These states are automated — user shouldn't need to send messages
        return [binanceConfig.messages.paymentProcessing];

      case STATES.PAYMENT_SUCCESS:
        return [binanceConfig.messages.paymentSuccess];

      case STATES.PAYMENT_FAILED:
        // Allow retry
        return await handlePaymentRetry(session);

      default:
        return [binanceConfig.messages.unexpectedInput];
    }
  } finally {
    session.processing = false;
  }
}

/**
 * Handle CREATED state — first message from user
 * Send greeting + PAN request
 */
function handleCreated(session, content) {
  updateSessionState(session, STATES.WAITING_FOR_PAN);

  return [
    binanceConfig.messages.greeting,
    binanceConfig.messages.panRequest,
  ];
}

/**
 * Handle WAITING_FOR_PAN state — user submits PAN
 */
async function handleWaitingForPan(session, content) {
  // Check retry limit
  if (session.panAttempts >= binanceConfig.maxPanAttempts) {
    updateSessionState(session, STATES.REJECTED);
    return [binanceConfig.messages.panLocked];
  }

  // Quick format check first
  const formatResult = validatePanFormat(content);
  if (!formatResult.valid) {
    session.panAttempts++;
    updateSessionState(session, STATES.WAITING_FOR_PAN);

    const remaining = binanceConfig.maxPanAttempts - session.panAttempts;
    if (remaining <= 0) {
      updateSessionState(session, STATES.REJECTED);
      return [binanceConfig.messages.panLocked];
    }

    return [
      binanceConfig.messages.invalidPan +
        `\n\nAttempts remaining: ${remaining}`,
    ];
  }

  // PAN format is valid — start verification
  updateSessionState(session, STATES.PAN_VALIDATING);

  const responses = [binanceConfig.messages.panVerifying];

  // Verify PAN (cache → API)
  const panResult = await verifyPan(content);

  if (panResult.success) {
    session.panHash = hash(formatResult.cleaned);
    session.verifiedPanName = panResult.name;
    updateSessionState(session, STATES.PAN_VERIFIED, {
      panHash: session.panHash,
      verifiedPanName: panResult.name,
    });

    responses.push(binanceConfig.messages.panVerified);

    // Automatically proceed to beneficiary check
    const nextResponses = await proceedToBeneficiaryCheck(session);
    responses.push(...nextResponses);
  } else if (panResult.source === "api_error") {
    // API failure — allow retry without counting as attempt
    updateSessionState(session, STATES.WAITING_FOR_PAN);
    responses.push(binanceConfig.messages.panApiError);
  } else {
    // Invalid PAN from API
    session.panAttempts++;
    updateSessionState(session, STATES.WAITING_FOR_PAN);

    const remaining = binanceConfig.maxPanAttempts - session.panAttempts;
    if (remaining <= 0) {
      updateSessionState(session, STATES.REJECTED);
      responses.push(binanceConfig.messages.panLocked);
    } else {
      responses.push(
        binanceConfig.messages.panVerificationFailed +
          `\n\nAttempts remaining: ${remaining}`
      );
    }
  }

  return responses;
}

/**
 * Proceed to fetch beneficiary name and match
 */
async function proceedToBeneficiaryCheck(session) {
  const responses = [];

  updateSessionState(session, STATES.FETCHING_BENEFICIARY);
  responses.push(binanceConfig.messages.fetchingBeneficiary);

  // Fetch order details from Binance for payment info
  let orderDetails = session.orderData;
  try {
    const apiDetails = await fetchUserOrderDetails(session.orderNo);
    if (apiDetails) {
      orderDetails = { ...orderDetails, ...apiDetails };
      session.orderData = orderDetails;
    }
  } catch (err) {
    console.error("⚠️ Could not fetch fresh order details:", err.message);
  }

  // Extract beneficiary name
  const beneficiary = await fetchBeneficiaryName(orderDetails);

  if (!beneficiary.success || !beneficiary.name) {
    // Can't get beneficiary name — proceed with caution
    auditLog("BENEFICIARY_NOT_FOUND", { orderNo: session.orderNo });
    // Still proceed to payment if PAN is verified (relaxed mode)
    responses.push(...(await proceedToPayment(session)));
    return responses;
  }

  session.beneficiaryName = beneficiary.name;

  // Name matching
  updateSessionState(session, STATES.NAME_MATCHING);

  const nameResult = matchNames(session.verifiedPanName, beneficiary.name);
  session.nameMatchScore = nameResult.score;

  if (nameResult.match) {
    updateSessionState(session, STATES.NAME_MATCHED, {
      beneficiaryName: beneficiary.name,
      nameMatchScore: nameResult.score,
    });
    responses.push(binanceConfig.messages.nameMatched);

    // Proceed to payment
    const paymentResponses = await proceedToPayment(session);
    responses.push(...paymentResponses);
  } else {
    updateSessionState(session, STATES.REJECTED, {
      beneficiaryName: beneficiary.name,
      nameMatchScore: nameResult.score,
    });
    responses.push(binanceConfig.messages.nameMismatch);

    auditLog("NAME_MISMATCH_REJECTED", {
      orderNo: session.orderNo,
      panName: session.verifiedPanName,
      beneficiaryName: beneficiary.name,
      score: nameResult.score,
    });
  }

  return responses;
}

/**
 * Proceed to balance check and payment
 */
async function proceedToPayment(session) {
  const responses = [];

  // Check wallet balance
  updateSessionState(session, STATES.CHECKING_BALANCE);
  responses.push(binanceConfig.messages.checkingBalance);

  const balanceCheck = await checkWalletBalance();

  if (!balanceCheck.success || balanceCheck.balance < (session.amount || 0)) {
    updateSessionState(session, STATES.PAYMENT_FAILED);
    responses.push(binanceConfig.messages.insufficientBalance);
    return responses;
  }

  // Process payment
  updateSessionState(session, STATES.PAYMENT_PROCESSING);
  responses.push(binanceConfig.messages.paymentProcessing);

  const paymentResult = await processPayment({
    orderNo: session.orderNo,
    amount: session.amount || 0,
    beneficiaryName: session.beneficiaryName || session.verifiedPanName || "",
    bankName: session.orderData?.bankName || "",
    accountNo: session.orderData?.accountNo || "",
    ifscCode: session.orderData?.ifscCode || "",
    upiId: session.orderData?.upiId || "",
  });

  if (paymentResult.success) {
    updateSessionState(session, STATES.PAYMENT_SUCCESS);
    responses.push(binanceConfig.messages.paymentSuccess);

    auditLog("PAYMENT_COMPLETE", {
      orderNo: session.orderNo,
      transactionId: paymentResult.transactionId,
    });
  } else {
    updateSessionState(session, STATES.PAYMENT_FAILED);
    responses.push(binanceConfig.messages.paymentFailed);

    auditLog("PAYMENT_FAILED_FINAL", {
      orderNo: session.orderNo,
      error: paymentResult.error,
    });
  }

  return responses;
}

/**
 * Handle payment retry
 */
async function handlePaymentRetry(session) {
  return await proceedToPayment(session);
}

/**
 * Get all active sessions (for admin monitoring)
 */
function getActiveSessions() {
  const sessions = [];
  for (const [orderNo, session] of orderSessions) {
    sessions.push({
      orderNo,
      status: session.status,
      panAttempts: session.panAttempts,
      verifiedPanName: session.verifiedPanName,
      beneficiaryName: session.beneficiaryName,
      nameMatchScore: session.nameMatchScore,
      amount: session.amount,
      asset: session.asset,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  }
  return sessions;
}

/**
 * Get session status for a specific order
 */
function getSessionStatus(orderNo) {
  const session = orderSessions.get(orderNo);
  if (!session) {
    // Check DB
    const db = getDb();
    const dbOrder = db.prepare("SELECT * FROM orders WHERE order_no = ?").get(orderNo);
    return dbOrder || null;
  }
  return {
    orderNo: session.orderNo,
    status: session.status,
    panAttempts: session.panAttempts,
    verifiedPanName: session.verifiedPanName,
    beneficiaryName: session.beneficiaryName,
    nameMatchScore: session.nameMatchScore,
    amount: session.amount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Expire stale sessions
 */
function expireStaleOrders() {
  const expiryMs = binanceConfig.orderExpiryMinutes * 60 * 1000;
  const now = Date.now();

  for (const [orderNo, session] of orderSessions) {
    if ([STATES.COMPLETED, STATES.REJECTED, STATES.EXPIRED].includes(session.status)) {
      continue;
    }

    const age = now - new Date(session.createdAt).getTime();
    if (age > expiryMs) {
      updateSessionState(session, STATES.EXPIRED);
      auditLog("ORDER_EXPIRED", { orderNo, ageMinutes: Math.round(age / 60000) });
    }
  }
}

// Run expiry check every 5 minutes
setInterval(expireStaleOrders, 5 * 60 * 1000);

module.exports = {
  STATES,
  handleIncomingMessage,
  getSession,
  getActiveSessions,
  getSessionStatus,
  expireStaleOrders,
};
