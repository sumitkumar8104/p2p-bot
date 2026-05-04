const orderCache = new Map(); // orderNo → { tradeType, ... }

module.exports = {
  setOrder: (orderNo, data) => orderCache.set(orderNo, data),
  getOrder: (orderNo) => orderCache.get(orderNo),
  getAllOrders: () => Array.from(orderCache.values()),
};
