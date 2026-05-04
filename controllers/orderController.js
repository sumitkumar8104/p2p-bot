const { fetchOrders } = require("../services/binanceService");
const { auditLog } = require("../utils/logger");

const getOrders = async (req, res) => {
  try {
    console.log("📋 Fetching P2P orders...");
    auditLog("FETCH_ORDERS");

    const errors = [];
    const [sellOrders, buyOrders] = await Promise.all([
      fetchOrders("SELL").catch((e) => {
        const detail = e.response?.data || e.message;
        errors.push(`SELL: ${JSON.stringify(detail)}`);
        return [];
      }),
      fetchOrders("BUY").catch((e) => {
        const detail = e.response?.data || e.message;
        errors.push(`BUY: ${JSON.stringify(detail)}`);
        return [];
      }),
    ]);

    const orders = [...sellOrders, ...buyOrders];
    
    // Populate shared cache for socket service
    const { setOrder } = require("../utils/sharedCache");
    orders.forEach(o => {
      const no = o.orderNumber || o.orderNo;
      if (no) {
        setOrder(no, { 
          orderNo: no, 
          tradeType: o.tradeType, 
          asset: o.asset, 
          fiat: o.fiat,
          price: o.unitPrice
        });
      }
    });

    console.log(`✅ Received ${orders.length} orders.`);
    auditLog("ORDERS_RECEIVED", { count: orders.length });

    res.json({ success: true, orders, errors });
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getUserAndPaymentDetails = async (req, res) => {
  try {
    const { orderNo } = req.params;
    const { fetchUserOrderDetails } = require("../services/binanceService");
    const { getOrder } = require("../utils/sharedCache");

    console.log(`🔍 Fetching details for #${orderNo}...`);
    
    // 1. Try to get details from API
    const details = await fetchUserOrderDetails(orderNo);
    
    // 2. Get basic info from cache
    const basic = getOrder(orderNo);

    if (!details && !basic) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Combine data
    const response = {
      success: true,
      orderNo,
      user: {
        nickName: details?.counterPartyNickName || details?.nickName || "Unknown",
        realName: details?.counterPartyRealName || details?.realName || "Unknown",
      },
      payment: details?.payMethods || details?.paymentMethods || [],
      basic: basic || {}
    };

    res.json(response);
  } catch (err) {
    console.error("❌ Failed to fetch order details:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getOrders, getUserAndPaymentDetails };
