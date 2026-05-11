require("dotenv").config();

module.exports = {
  merchantId: process.env.PAYTM_MERCHANT_ID,
  merchantKey: process.env.PAYTM_MERCHANT_KEY,
  baseUrl: process.env.PAYTM_BASE_URL || "https://securegw.paytm.in",
  walletGuid: process.env.PAYTM_WALLET_GUID,
};
