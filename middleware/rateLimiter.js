const { auditLog } = require("../utils/logger");

const restRateLimits = new Map(); // ip → { count, resetAt }

function restRateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  const entry = restRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    restRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return next();
  }
  
  if (entry.count >= 15) { // Increased slightly for usability
    auditLog("REST_RATE_LIMIT", { ip, path: req.path });
    return res.status(429).json({ success: false, error: "Too many requests. Try again in a minute." });
  }
  
  entry.count++;
  next();
}

module.exports = { restRateLimit };
