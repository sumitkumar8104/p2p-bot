const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, "p2p-bot.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Better concurrency
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      binance_uid TEXT UNIQUE,
      chat_id TEXT,
      nickname TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- PAN verifications cache
    CREATE TABLE IF NOT EXISTS pan_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pan_hash TEXT UNIQUE NOT NULL,
      pan_number_encrypted TEXT NOT NULL,
      verified_name TEXT,
      verification_status TEXT DEFAULT 'pending',
      pan_status TEXT,
      surepass_response TEXT,
      last_verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      binance_uid TEXT,
      seller_nickname TEXT,
      status TEXT DEFAULT 'CREATED',
      amount REAL,
      asset TEXT,
      fiat TEXT,
      pan_attempts INTEGER DEFAULT 0,
      pan_hash TEXT,
      verified_pan_name TEXT,
      beneficiary_name TEXT,
      payment_method TEXT,
      payment_account_info TEXT,
      name_match_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT UNIQUE,
      order_no TEXT NOT NULL,
      payment_status TEXT DEFAULT 'pending',
      amount REAL,
      bank_name TEXT,
      beneficiary_name TEXT,
      payment_method TEXT,
      ifsc_code TEXT,
      account_number_encrypted TEXT,
      upi_id TEXT,
      response_payload TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_no) REFERENCES orders(order_no)
    );

    -- Audit trail (DB-backed for admin dashboard)
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      order_no TEXT,
      data TEXT,
      severity TEXT DEFAULT 'info',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Bot Configuration table
    CREATE TABLE IF NOT EXISTS bot_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_status INTEGER DEFAULT 0,
      auto_payout INTEGER DEFAULT 0,
      bot_name TEXT,
      logo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
    CREATE INDEX IF NOT EXISTS idx_pan_hash ON pan_verifications(pan_hash);
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_no);
    CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
    CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_log(order_no);
    CREATE INDEX IF NOT EXISTS idx_bot_config_id ON bot_config(id);
  `);

  console.log("✅ Database schema initialized.");
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
