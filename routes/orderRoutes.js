const express = require("express");
const router = express.Router();
const { getOrders, getUserAndPaymentDetails } = require("../controllers/orderController");
const { restRateLimit } = require("../middleware/rateLimiter");

router.get("/", restRateLimit, getOrders);
router.get("/:orderNo/details", restRateLimit, getUserAndPaymentDetails);

module.exports = router;
