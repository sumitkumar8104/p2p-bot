const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

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
  } catch (error) {
    console.error("❌ Logger Error:", error.message);
  }
}

module.exports = { auditLog };
