const { fetchChatMessages } = require("../services/binanceService");

const getChat = async (req, res) => {
  try {
    const { orderNo } = req.params;
    console.log(`💬 Fetching chat history for order ${orderNo}...`);
    
    const messages = await fetchChatMessages(orderNo);
    res.json({ 
      success: true, 
      message: "Chat history retrieved successfully", 
      data: messages 
    });
  } catch (err) {
    res.json({ 
      success: false, 
      message: err.message, 
      data: [] 
    });
  }
};

module.exports = { getChat };
