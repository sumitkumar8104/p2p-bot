require("dotenv").config();

module.exports = {
  apiKey: process.env.SUREPASS_API_KEY,
  baseUrl: process.env.SUREPASS_BASE_URL || "https://kyc-api.surepass.io/api/v1",
};
