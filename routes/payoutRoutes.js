const express = require("express");
const router = express.Router();
const { getPayouts, seedPayouts, exportPayouts } = require("../controllers/payoutController");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/", getPayouts);
router.post("/seed", seedPayouts);
router.get("/export", exportPayouts);

module.exports = router;
