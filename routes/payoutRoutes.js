const express = require("express");
const router = express.Router();
const { seedPayouts, exportPayouts } = require("../controllers/payoutController");

router.post("/seed", seedPayouts);
router.get("/export", exportPayouts);

module.exports = router;
