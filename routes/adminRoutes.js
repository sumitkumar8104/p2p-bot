const express = require("express");
const router = express.Router();
const {
  getDashboard,
  getOrders,
  getOrderDetail,
  getPayments,
  getAuditLog,
  getStats,
} = require("../controllers/adminController");
const { restRateLimit } = require("../middleware/rateLimiter");

router.get("/dashboard", restRateLimit, getDashboard);
router.get("/orders", restRateLimit, getOrders);
router.get("/orders/:orderNo", restRateLimit, getOrderDetail);
router.get("/payments", restRateLimit, getPayments);
router.get("/audit", restRateLimit, getAuditLog);
router.get("/stats", restRateLimit, getStats);

module.exports = router;
