require("dotenv").config();

module.exports = {
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET || process.env.BINANCE_SECRET_KEY,
  baseUrl: "https://api.binance.com",
  port: process.env.PORT || 3000,

  // Bot configuration
  maxPanAttempts: parseInt(process.env.MAX_PAN_ATTEMPTS) || 3,
  orderExpiryMinutes: parseInt(process.env.ORDER_EXPIRY_MINUTES) || 30,

  // ── Bot Messages ──
  messages: {
    greeting:
      "Hello! Thank you for placing an order with us. We will assist you shortly. Please wait a moment.",

    panRequest:
      "For verification, please share your PAN card number.\n\nSend only the PAN number.\nExample: ABCDE1234F\n\nDo not send any additional text or symbols.",

    invalidPan:
      "❌ The PAN number format is invalid.\n\nPlease enter a valid PAN number.\nExample: ABCDE1234F",

    panLocked:
      "🔒 Multiple invalid attempts detected.\n\nFor security reasons, this order has been closed.\n\nPlease create a new order and try again.",

    panVerifying:
      "🔄 Verifying your PAN details. Please wait…",

    panVerified:
      "✅ PAN verified successfully. Proceeding with verification…",

    panVerificationFailed:
      "❌ The PAN number could not be verified.\n\nPlease check the PAN number and try again.",

    panApiError:
      "⚠️ We are unable to verify your PAN at the moment.\n\nPlease try again after some time.",

    nameMatched:
      "✅ Identity verified successfully. Processing your payment…",

    nameMismatch:
      "❌ The bank account holder name does not match your verified PAN details.\n\nFor security reasons, this transaction cannot continue.",

    checkingBalance:
      "🔄 Checking payment availability…",

    insufficientBalance:
      "⚠️ Payment is temporarily unavailable due to insufficient system balance.\n\nPlease try again later.",

    paymentProcessing:
      "🔄 Processing your payment. Please wait…",

    paymentSuccess:
      "✅ Payment has been successfully sent to your account.\n\nPlease check your bank account or UPI app and confirm receipt.\n\nOnce confirmed, kindly release the USDT.\n\nThank you.",

    paymentFailed:
      "❌ We were unable to process the payment at the moment.\n\nPlease wait while we retry automatically or contact support if the issue continues.",

    orderExpired:
      "⏰ This order session has expired due to inactivity.\n\nPlease create a new order to continue.",

    orderCompleted:
      "🎉 Order completed successfully. Thank you for trading with us!",

    unexpectedInput:
      "⚠️ Please follow the instructions above. If you need help, create a new order.",

    fetchingBeneficiary:
      "🔄 Verifying your bank account details…",
  },
};
