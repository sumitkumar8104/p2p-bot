const axios = require("axios");
const crypto = require("crypto");
const paytmConfig = require("../config/paytm");
const { getDb } = require("../config/database");
const { auditLog } = require("../utils/logger");

/**
 * Check Paytm wallet balance
 * @returns {{ success: boolean, balance: number, error: string }}
 */
async function checkWalletBalance() {
  try {
    if (!paytmConfig.merchantId || !paytmConfig.merchantKey) {
      auditLog("WALLET_CHECK_NO_KEYS", { message: "Paytm keys not configured" });
      // In development, return a mock balance
      return { success: true, balance: 50000, error: null };
    }

    // Paytm wallet balance check API
    const orderId = `BAL_${Date.now()}`;
    const body = {
      mid: paytmConfig.merchantId,
      orderId: orderId,
      requestType: "BALANCE_CHECK",
    };

    const checksum = generatePaytmChecksum(body);

    const response = await axios.post(
      `${paytmConfig.baseUrl}/v3/order/status`,
      { ...body, signature: checksum },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    const data = response.data;
    if (data && data.body && data.body.resultInfo) {
      return {
        success: true,
        balance: parseFloat(data.body.txnAmount || 0),
        error: null,
      };
    }

    return { success: true, balance: 50000, error: null }; // Fallback
  } catch (err) {
    auditLog("WALLET_CHECK_ERROR", { error: err.message });
    console.error("❌ Wallet balance check error:", err.message);
    return { success: false, balance: 0, error: err.message };
  }
}

/**
 * Process payment via Paytm
 * @param {object} params
 * @param {string} params.orderNo - Order number
 * @param {number} params.amount - Amount in INR
 * @param {string} params.beneficiaryName - Recipient name
 * @param {string} params.bankName - Bank name
 * @param {string} params.accountNo - Bank account number
 * @param {string} params.ifscCode - IFSC code
 * @param {string} params.upiId - UPI ID (alternative to bank details)
 * @returns {{ success: boolean, transactionId: string, error: string }}
 */
async function processPayment(params) {
  const {
    orderNo,
    amount,
    beneficiaryName,
    bankName,
    accountNo,
    ifscCode,
    upiId,
  } = params;

  const transactionId = `TXN_${orderNo}_${Date.now()}`;

  try {
    auditLog("PAYMENT_INITIATED", {
      orderNo,
      transactionId,
      amount,
      beneficiaryName,
      method: upiId ? "UPI" : "BANK_TRANSFER",
    });

    // Store payment record as PROCESSING
    storePayment({
      transactionId,
      orderNo,
      status: "processing",
      amount,
      bankName,
      beneficiaryName,
      method: upiId ? "UPI" : "BANK_TRANSFER",
      ifscCode,
      accountNo,
      upiId,
    });

    if (!paytmConfig.merchantId || !paytmConfig.merchantKey) {
      // Development mode — simulate payment
      auditLog("PAYMENT_SIMULATED", { transactionId, orderNo, amount });

      updatePaymentStatus(transactionId, "success", JSON.stringify({ simulated: true }));

      return {
        success: true,
        transactionId,
        error: null,
      };
    }

    // Production: Paytm payout API
    const payoutBody = {
      subwalletGuid: paytmConfig.walletGuid,
      orderId: transactionId,
      beneficiaryAccount: accountNo,
      beneficiaryIFSC: ifscCode,
      beneficiaryName: beneficiaryName,
      amount: String(amount),
      purpose: "P2P_PAYMENT",
      ...(upiId && { beneficiaryVPA: upiId }),
    };

    const checksum = generatePaytmChecksum(payoutBody);

    const response = await axios.post(
      `${paytmConfig.baseUrl}/v2/disburse`,
      { ...payoutBody, signature: checksum },
      {
        headers: {
          "Content-Type": "application/json",
          "x-mid": paytmConfig.merchantId,
        },
        timeout: 30000,
      }
    );

    const data = response.data;

    if (data.status === "SUCCESS" || data.statusCode === "200") {
      updatePaymentStatus(transactionId, "success", JSON.stringify(data));
      auditLog("PAYMENT_SUCCESS", { transactionId, orderNo, amount });

      return { success: true, transactionId, error: null };
    }

    updatePaymentStatus(transactionId, "failed", JSON.stringify(data), data.statusMessage);
    auditLog("PAYMENT_FAILED", { transactionId, orderNo, response: data });

    return {
      success: false,
      transactionId,
      error: data.statusMessage || "Payment processing failed",
    };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    updatePaymentStatus(transactionId, "failed", null, errMsg);
    auditLog("PAYMENT_ERROR", { transactionId, orderNo, error: errMsg });
    console.error("❌ Payment error:", errMsg);

    return { success: false, transactionId, error: errMsg };
  }
}

/**
 * Store payment record in database
 */
function storePayment(data) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO payments (transaction_id, order_no, payment_status, amount, bank_name, beneficiary_name, payment_method, ifsc_code, upi_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.transactionId,
      data.orderNo,
      data.status,
      data.amount,
      data.bankName || null,
      data.beneficiaryName || null,
      data.method || null,
      data.ifscCode || null,
      data.upiId || null
    );
  } catch (err) {
    console.error("❌ Store payment error:", err.message);
  }
}

/**
 * Update payment status
 */
function updatePaymentStatus(transactionId, status, responsePayload, errorMsg) {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE payments SET payment_status = ?, response_payload = ?, error_message = ?
      WHERE transaction_id = ?
    `).run(status, responsePayload || null, errorMsg || null, transactionId);
  } catch (err) {
    console.error("❌ Update payment error:", err.message);
  }
}

/**
 * Generate Paytm checksum (simplified — production should use PaytmChecksum library)
 */
function generatePaytmChecksum(body) {
  const data = JSON.stringify(body);
  return crypto
    .createHmac("sha256", paytmConfig.merchantKey || "dummy-key")
    .update(data)
    .digest("hex");
}

module.exports = { checkWalletBalance, processPayment };
