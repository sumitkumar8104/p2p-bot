const { fetchChatMessages } = require("../services/binanceService");

const getChat = async (req, res) => {
  try {
    const { orderNo } = req.params;
    console.log(`💬 Fetching chat history for order ${orderNo}...`);
    
    const messages = await fetchChatMessages(orderNo);
    res.json({ success: true, messages });
  } catch (err) {
    res.json({ success: false, messages: [], error: err.message });
  }
};

module.exports = { getChat };
