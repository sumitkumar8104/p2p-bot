const express = require("express");
const router = express.Router();
const {
  getBotConfig,
  createBotConfig,
  updateBotConfig,
  deleteBotConfig
} = require("../controllers/botConfigController");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");

// All bot config routes are protected by admin auth
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @route GET /api/bot-config
 * @desc Get bot configuration
 */
router.get("/", getBotConfig);

/**
 * @route POST /api/bot-config
 * @desc Create bot configuration
 */
router.post("/", createBotConfig);

/**
 * @route PUT /api/bot-config/:id
 * @desc Update bot configuration
 */
router.put("/:id", updateBotConfig);

/**
 * @route DELETE /api/bot-config/:id
 * @desc Delete bot configuration
 */
router.delete("/:id", deleteBotConfig);

module.exports = router;
