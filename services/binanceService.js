const axios = require("axios");
const crypto = require("crypto");
const binanceConfig = require("../config/binance");
const { auditLog } = require("../utils/logger");

function signRequest(params) {
  const queryString = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const signature = crypto
    .createHmac("sha256", binanceConfig.apiSecret)
    .update(queryString)
    .digest("hex");

  return { queryString, signature };
}

async function fetchOrders(tradeType) {
  try {
    const params = {
      tradeType,
      page: 1,
      rows: 50,
      recvWindow: 10000,
      timestamp: Date.now(),
    };
    const { queryString, signature } = signRequest(params);
    const url = `${binanceConfig.baseUrl}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": binanceConfig.apiKey },
    });
    
    return response.data?.data ?? response.data ?? [];
  } catch (error) {
    console.error(`❌ Binance API Error (${tradeType}):`, error.response?.data || error.message);
    throw error;
  }
}

async function fetchChatMessages(orderNo) {
  try {
    const params = {
      orderNo,
      page: 1,
      rows: 100,
      recvWindow: 10000,
      timestamp: Date.now(),
    };
    const { queryString, signature } = signRequest(params);
    const url = `${binanceConfig.baseUrl}/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": binanceConfig.apiKey, clientType: "WEB" },
    });

    return response.data?.data ?? response.data ?? [];
  } catch (error) {
    console.error(`❌ Chat Fetch Error (${orderNo}):`, error.response?.data || error.message);
    throw error;
  }
}

async function getChatCredentials() {
  try {
    const params = { recvWindow: 5000, timestamp: Date.now() };
    const { queryString, signature } = signRequest(params);
    const url = `${binanceConfig.baseUrl}/sapi/v1/c2c/chat/retrieveChatCredential?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": binanceConfig.apiKey, clientType: "WEB" },
    });

    return response.data?.data ?? response.data;
  } catch (error) {
    console.error("❌ Credential Fetch Error:", error.response?.data || error.message);
    throw error;
  }
}

async function fetchUserOrderDetails(orderNo) {
  try {
    const params = { orderNo, recvWindow: 10000, timestamp: Date.now() };
    const { queryString, signature } = signRequest(params);
    // Note: This is a probable endpoint for merchants. 
    // If it fails, we fall back to searching the history list.
    const url = `${binanceConfig.baseUrl}/sapi/v1/c2c/orderMatch/getUserOrderDetails?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": binanceConfig.apiKey },
    });

    return response.data?.data ?? response.data;
  } catch (error) {
    console.warn(`⚠️ Detail fetch for ${orderNo} failed or restricted.`, error.message);
    return null;
  }
}

module.exports = {
  fetchOrders,
  fetchChatMessages,
  getChatCredentials,
  fetchUserOrderDetails
};
