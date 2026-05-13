const express = require("express");
const router = express.Router();
const { login, logout, changePassword } = require("../controllers/authController");
const { authMiddleware } = require("../middleware/authMiddleware");

router.post("/login", login);
router.post("/logout", authMiddleware, logout);
router.post("/change-password", authMiddleware, changePassword);

module.exports = router;
