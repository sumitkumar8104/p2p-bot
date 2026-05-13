const { pool } = require("../config/mysql");

// Get the most recent bot configuration (returns null if none exists)
async function getBotConfig() {
  const [rows] = await pool.query("SELECT * FROM bot_config ORDER BY id DESC LIMIT 1");
  return rows[0] || null;
}

// Create bot configuration
async function createBotConfig(data) {
  const { bot_status, auto_payout, bot_name, logo } = data;
  const [result] = await pool.query(
    "INSERT INTO bot_config (bot_status, auto_payout, bot_name, logo) VALUES (?, ?, ?, ?)",
    [
      bot_status ? 1 : 0,
      auto_payout ? 1 : 0,
      bot_name || null,
      logo || null
    ]
  );
  const [rows] = await pool.query("SELECT * FROM bot_config WHERE id = ?", [result.insertId]);
  return rows[0];
}

// Update bot configuration. Returns null if id not found or no fields supplied.
async function updateBotConfig(id, data) {
  const fields = [];
  const values = [];

  if (data.bot_status !== undefined) {
    fields.push("bot_status = ?");
    values.push(data.bot_status ? 1 : 0);
  }
  if (data.auto_payout !== undefined) {
    fields.push("auto_payout = ?");
    values.push(data.auto_payout ? 1 : 0);
  }
  if (data.bot_name !== undefined) {
    fields.push("bot_name = ?");
    values.push(data.bot_name);
  }
  if (data.logo !== undefined) {
    fields.push("logo = ?");
    values.push(data.logo);
  }

  if (fields.length === 0) return null;

  values.push(id);
  const [result] = await pool.query(
    `UPDATE bot_config SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
  if (result.affectedRows === 0) return null;

  const [rows] = await pool.query("SELECT * FROM bot_config WHERE id = ?", [id]);
  return rows[0] || null;
}

// Delete bot configuration
async function deleteBotConfig(id) {
  const [result] = await pool.query("DELETE FROM bot_config WHERE id = ?", [id]);
  return result;
}

module.exports = {
  getBotConfig,
  createBotConfig,
  updateBotConfig,
  deleteBotConfig
};
