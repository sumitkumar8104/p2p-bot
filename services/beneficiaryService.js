const axios = require("axios");
const { auditLog } = require("../utils/logger");

/**
 * Fetch beneficiary name from bank account/UPI details.
 *
 * In production, this would call:
 * - Paytm beneficiary verification API
 * - Bank account verification API (via Surepass or similar)
 * - UPI handle verification API
 *
 * For now, we extract from the Binance order payment methods data.
 *
 * @param {object} orderData - Order data containing payment method info
 * @returns {{ success: boolean, name: string, bankName: string, method: string, error: string }}
 */
async function fetchBeneficiaryName(orderData) {
  try {
    // Extract from Binance order payment info if available
    if (orderData.paymentMethods && orderData.paymentMethods.length > 0) {
      const payMethod = orderData.paymentMethods[0];
      const fields = payMethod.fields || [];

      let accountName = "";
      let bankName = "";
      let accountNo = "";
      let upiId = "";

      for (const field of fields) {
        const fieldName = (field.fieldName || "").toLowerCase();
        const fieldValue = field.fieldValue || "";

        if (fieldName.includes("name") || fieldName.includes("account_holder")) {
          accountName = fieldValue;
        }
        if (fieldName.includes("bank")) {
          bankName = fieldValue;
        }
        if (fieldName.includes("account") && !fieldName.includes("name")) {
          accountNo = fieldValue;
        }
        if (fieldName.includes("upi") || fieldName.includes("vpa")) {
          upiId = fieldValue;
        }
      }

      if (accountName) {
        auditLog("BENEFICIARY_FOUND", {
          orderNo: orderData.orderNo,
          name: accountName,
          bankName,
          method: payMethod.tradeMethodName || "bank_transfer",
        });

        return {
          success: true,
          name: accountName,
          bankName: bankName,
          accountNo: accountNo,
          upiId: upiId,
          method: payMethod.tradeMethodName || "bank_transfer",
          error: null,
        };
      }
    }

    // Try counterparty real name from order details
    if (orderData.counterPartyRealName || orderData.realName) {
      const name = orderData.counterPartyRealName || orderData.realName;
      auditLog("BENEFICIARY_FROM_ORDER", {
        orderNo: orderData.orderNo,
        name,
      });

      return {
        success: true,
        name: name,
        bankName: "",
        method: "order_details",
        error: null,
      };
    }

    return {
      success: false,
      name: null,
      bankName: null,
      method: null,
      error: "Could not extract beneficiary name from order data",
    };
  } catch (err) {
    auditLog("BENEFICIARY_ERROR", { error: err.message, orderNo: orderData?.orderNo });
    console.error("❌ Beneficiary fetch error:", err.message);

    return {
      success: false,
      name: null,
      bankName: null,
      method: null,
      error: err.message,
    };
  }
}

/**
 * Verify a bank account via external API (placeholder for production)
 * @param {object} params - { accountNumber, ifsc, name }
 * @returns {{ success: boolean, verified: boolean, accountName: string }}
 */
async function verifyBankAccount(params) {
  try {
    // TODO: Integrate with actual bank verification API
    // Example: Surepass Bank Account Verification
    // const response = await axios.post(`${surepassConfig.baseUrl}/bank-verification`, {
    //   id_number: params.accountNumber,
    //   ifsc: params.ifsc,
    //   beneficiary_name: params.name,
    // }, {
    //   headers: { Authorization: `Bearer ${surepassConfig.apiKey}` },
    //   timeout: 15000,
    // });

    auditLog("BANK_VERIFICATION_PLACEHOLDER", { params });

    return {
      success: true,
      verified: true,
      accountName: params.name || "",
    };
  } catch (err) {
    return { success: false, verified: false, accountName: "", error: err.message };
  }
}

module.exports = { fetchBeneficiaryName, verifyBankAccount };
