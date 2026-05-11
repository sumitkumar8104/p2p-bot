const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Write an audit log entry to both file and database.
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function auditLog(event, data = {}) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...data,
    };
    const line = JSON.stringify(entry) + "\n";
    const fileName = `audit-${new Date().toISOString().slice(0, 10)}.log`;
    fs.appendFileSync(path.join(LOG_DIR, fileName), line);

    // Also write to database (lazy-load to avoid circular dependency)
    try {
      const { getDb } = require("../config/database");
      const db = getDb();
      const orderNo = data.orderNo || null;
      const severity = data.severity || "info";
      const dataStr = JSON.stringify(data);

      db.prepare(
        "INSERT INTO audit_log (event, order_no, data, severity) VALUES (?, ?, ?, ?)"
      ).run(event, orderNo, dataStr, severity);
    } catch {
      // DB not initialized yet or error — file log is sufficient
    }
  } catch (error) {
    console.error("❌ Logger Error:", error.message);
  }
}

module.exports = { auditLog };
