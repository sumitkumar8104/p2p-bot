const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "p2p",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initMysql() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL connected successfully.");

    // Initialize the users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        is_login BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Insert default admin
    const [adminExists] = await connection.query("SELECT * FROM users WHERE email = 'admin@gmail.com'");
    if (adminExists.length === 0) {
      await connection.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        ['admin@gmail.com', '$2b$10$TwoLwC0AVW7STw9MKVdyb.ccuXHCzqcxWhN1uwm7E9n5eBTrVyTLu', 'admin']
      );
      console.log("✅ Default admin user created.");
    }

    // Initialize the template_groups table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS template_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_key VARCHAR(100) UNIQUE NOT NULL,
        small_description VARCHAR(255) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Migration: add small_description column to existing template_groups tables
    const [smallDescCol] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'template_groups' AND COLUMN_NAME = 'small_description'`
    );
    if (smallDescCol.length === 0) {
      await connection.query(
        "ALTER TABLE template_groups ADD COLUMN small_description VARCHAR(255) NULL AFTER template_key"
      );
      console.log("✅ Added small_description column to template_groups.");
    }

    // Migration: add sort_order column to existing template_groups tables
    const [sortOrderCol] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'template_groups' AND COLUMN_NAME = 'sort_order'`
    );
    if (sortOrderCol.length === 0) {
      await connection.query(
        "ALTER TABLE template_groups ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER small_description"
      );
      console.log("✅ Added sort_order column to template_groups.");
    }

    // Initialize the template_messages table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS template_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_id INT NOT NULL,
        message_text TEXT NOT NULL,
        step_order INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES template_groups(id) ON DELETE CASCADE
      )
    `);

    // Migrate from old message_templates if exists
    try {
      const [tables] = await connection.query("SHOW TABLES LIKE 'message_templates'");
      const [oldTables] = await connection.query("SHOW TABLES LIKE 'message_templates_old'");
      
      if (tables.length > 0 && oldTables.length === 0) {
        console.log("🔄 Migrating old templates...");
        const [oldTemplates] = await connection.query("SELECT * FROM message_templates");
        for (const old of oldTemplates) {
          const [res] = await connection.query("INSERT IGNORE INTO template_groups (template_key) VALUES (?)", [old.template_key]);
          let groupId = res.insertId;
          if (!groupId) {
            const [existing] = await connection.query("SELECT id FROM template_groups WHERE template_key = ?", [old.template_key]);
            groupId = existing[0].id;
          }
          await connection.query(
            "INSERT INTO template_messages (template_id, message_text, step_order) VALUES (?, ?, ?)",
            [groupId, old.message_text, 1]
          );
        }
        await connection.query("RENAME TABLE message_templates TO message_templates_old");
        console.log("✅ Migrated old templates and renamed old table to message_templates_old.");
      }
    } catch (err) {
      console.warn("⚠️ Migration warning:", err.message);
    }

    // Seed default bot message templates (idempotent: only seeds keys not already present)
    const seedTemplates = [
      {
        key: "starting_message",
        description: "Welcome and onboarding intro messages",
        sort_order: 1,
        messages: [
          {
            order: 1,
            text: "👋 *Hello and welcome to P2P Trade Bot!*\n\nI'm here to help you complete your order quickly, safely and securely. 🤝",
          },
          {
            order: 2,
            text: "📋 Before we begin, please keep your *PAN Card* details ready — we need it for KYC verification as per government norms.",
          },
          {
            order: 3,
            text: "🔒 All transactions are end-to-end secured. Applicable *1% TDS* will be deducted automatically as per Income Tax rules.",
          },
          {
            order: 4,
            text: "✅ Let's get started! Please follow the steps carefully and reply to each message as prompted.",
          },
        ],
      },
      {
        key: "pan_card_want",
        description: "Ask user for PAN number",
        sort_order: 2,
        messages: [
          {
            order: 1,
            text: "📝 Please share your *10-digit PAN Card number* (format: ABCDE1234F) to proceed with the order.",
          },
        ],
      },
      {
        key: "pan_card_verifying",
        description: "PAN verification in progress notice",
        sort_order: 3,
        messages: [
          {
            order: 1,
            text: "⏳ Verifying your PAN card details with the records... please wait a moment. 🔄",
          },
        ],
      },
      {
        key: "pan_card_error",
        description: "Invalid or unverified PAN response",
        sort_order: 4,
        messages: [
          {
            order: 1,
            text: "❌ *PAN verification failed.*\n\nThe PAN number you entered could not be verified. Please check the number and re-enter it in the correct format (e.g. ABCDE1234F).",
          },
        ],
      },
      {
        key: "pan_card_success",
        description: "PAN verified successfully confirmation message",
        sort_order: 5,
        messages: [
          {
            order: 1,
            text: "✅ *PAN verified successfully!*\n\nName on PAN: *{pan_name}*\nPAN: *{seller_pan}*\n\nYou can now proceed with the order. 🚀",
          },
        ],
      },
      {
        key: "tds_minus",
        description: "TDS deduction breakdown and notice",
        sort_order: 6,
        messages: [
          {
            order: 1,
            text: "📉 *TDS Deduction Notice*\n\nAs per Income Tax regulations, *1% TDS* has been deducted from your order amount.\n\n• Order Amount: ₹{total_order_amount}\n• TDS Deducted: ₹{tds_amount}\n• Net Payable: ₹{amount}\n\nA TDS certificate will be issued at the end of the financial year. 🧾",
          },
        ],
      },
      {
        key: "payment_success",
        description: "Successful payout confirmation with details",
        sort_order: 7,
        messages: [
          {
            order: 1,
            text: "🎉 *Payment Successful!*\n\nYour transaction has been completed successfully. Sit back and relax — funds are on the way. 💸",
          },
          {
            order: 2,
            text: "🧾 *Transaction Details*\n\n• Order ID: `{order_id}`\n• Beneficiary: {pan_name}\n• PAN: {seller_pan}",
          },
          {
            order: 3,
            text: "💰 *Amount Breakdown*\n\n• Order Amount: ₹{total_order_amount}\n• TDS (1%): ₹{tds_amount}\n• Amount Credited: ₹{amount}",
          },
          {
            order: 4,
            text: "🏦 *Bank Reference*\n\n• UTR Number: `{utr_number}`\n• Status: ✅ SUCCESS\n\nPlease verify the credit in your bank account. Funds usually reflect within a few minutes via IMPS.",
          },
          {
            order: 5,
            text: "🙏 Thank you for trading with us!\n\nIf you face any issue, reply with your *Order ID* and our support team will assist you. We hope to see you again soon! ⭐",
          },
        ],
      },
      {
        key: "payment_failed",
        description: "Failed payout notice and refund",
        sort_order: 8,
        messages: [
          {
            order: 1,
            text: "❌ *Payment Failed*\n\nUnfortunately, we could not process your payout for Order ID `{order_id}` at this time.\n\nOur team has been notified and will reach out shortly. If any amount was debited, it will be auto-refunded within *5–7 working days*. 🙏",
          },
        ],
      },
    ];

    try {
      for (const tpl of seedTemplates) {
        const [existing] = await connection.query(
          "SELECT id, small_description, sort_order FROM template_groups WHERE template_key = ?",
          [tpl.key]
        );

        if (existing.length === 0) {
          const [groupRes] = await connection.query(
            "INSERT INTO template_groups (template_key, small_description, sort_order) VALUES (?, ?, ?)",
            [tpl.key, tpl.description, tpl.sort_order]
          );
          const groupId = groupRes.insertId;

          for (const msg of tpl.messages) {
            await connection.query(
              "INSERT INTO template_messages (template_id, message_text, step_order) VALUES (?, ?, ?)",
              [groupId, msg.text, msg.order]
            );
          }
          console.log(`✅ Seeded template '${tpl.key}' with ${tpl.messages.length} message(s).`);
        } else {
          // Back-fill description and sort_order for previously-seeded rows that haven't been set yet
          const row = existing[0];
          const updates = [];
          const values = [];
          if (!row.small_description) {
            updates.push("small_description = ?");
            values.push(tpl.description);
          }
          if (!row.sort_order) {
            updates.push("sort_order = ?");
            values.push(tpl.sort_order);
          }
          if (updates.length > 0) {
            values.push(row.id);
            await connection.query(
              `UPDATE template_groups SET ${updates.join(", ")} WHERE id = ?`,
              values
            );
            console.log(`✅ Back-filled ${updates.length} field(s) for template '${tpl.key}'.`);
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Template seed warning:", err.message);
    }

    // Initialize the payouts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        pan_name VARCHAR(100),
        seller_pan VARCHAR(20),
        total_order_amount DECIMAL(15, 2),
        tds_amount DECIMAL(15, 2),
        amount DECIMAL(15, 2),
        utr_number VARCHAR(50),
        status VARCHAR(20) DEFAULT 'SUCCESS',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize the bot_config table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bot_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bot_status TINYINT(1) NOT NULL DEFAULT 0,
        auto_payout TINYINT(1) NOT NULL DEFAULT 0,
        bot_name VARCHAR(100) NULL,
        logo VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Seed default bot_config row if the table is empty
    const [botCfgRows] = await connection.query("SELECT id FROM bot_config LIMIT 1");
    if (botCfgRows.length === 0) {
      await connection.query(
        "INSERT INTO bot_config (bot_status, auto_payout, bot_name, logo) VALUES (?, ?, ?, ?)",
        [0, 0, "P2P Trade Bot", null]
      );
      console.log("✅ Seeded default bot_config row.");
    }

    connection.release();
    console.log("✅ MySQL schema initialized.");
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err.message);
  }
}

module.exports = { pool, initMysql };
