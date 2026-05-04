require("dotenv").config();

module.exports = {
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  baseUrl: "https://api.binance.com",
  port: process.env.PORT || 3000,
  messages: {
    greeting: "Hello! Thank you for placing an order with us. We will assist you shortly. Please wait a moment.",
    verification: "For security and verification, please share your PAN Card and Payment Proof. This helps us process your order faster."
  }
};
