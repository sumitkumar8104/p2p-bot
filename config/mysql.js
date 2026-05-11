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

    // Initialize the message_templates table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id CHAR(36) PRIMARY KEY,
        template_key VARCHAR(100) UNIQUE NOT NULL,
        message_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

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
    
    connection.release();
    console.log("✅ MySQL schema initialized.");
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err.message);
  }
}

module.exports = { pool, initMysql };
