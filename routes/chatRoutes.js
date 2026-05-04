const express = require("express");
const router = express.Router();
const { getChat } = require("../controllers/chatController");
const { restRateLimit } = require("../middleware/rateLimiter");

router.get("/:orderNo", restRateLimit, getChat);

module.exports = router;
