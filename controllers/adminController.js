const { getDb } = require("../config/database");
const { getActiveSessions, getSessionStatus, STATES } = require("../services/botEngine");
const { auditLog } = require("../utils/logger");

/**
 * GET /api/admin/dashboard
 * Returns overview stats for the admin dashboard
 */
const getDashboard = async (req, res) => {
  try {
    const db = getDb();

    // Order stats
    const orderStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM orders GROUP BY status
    `).all();

    const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get();
    const activeOrders = db.prepare(`
      SELECT COUNT(*) as count FROM orders 
      WHERE status NOT IN ('COMPLETED', 'REJECTED', 'EXPIRED')
    `).get();

    // Payment stats
    const paymentStats = db.prepare(`
      SELECT payment_status, COUNT(*) as count, SUM(amount) as total_amount 
      FROM payments GROUP BY payment_status
    `).all();

    // PAN verification stats
    const panStats = db.prepare(`
      SELECT verification_status, COUNT(*) as count 
      FROM pan_verifications GROUP BY verification_status
    `).all();

    // Recent failures
    const recentFailures = db.prepare(`
      SELECT * FROM orders 
      WHERE status IN ('REJECTED', 'PAYMENT_FAILED') 
      ORDER BY updated_at DESC LIMIT 10
    `).all();

    // Recent audit events
    const recentEvents = db.prepare(`
      SELECT * FROM audit_log 
      ORDER BY created_at DESC LIMIT 50
    `).all();

    // Active sessions (in-memory)
    const activeSessions = getActiveSessions();

    // Fraud alerts (multiple PAN attempts)
    const fraudAlerts = db.prepare(`
      SELECT order_no, pan_attempts, status, updated_at 
      FROM orders 
      WHERE pan_attempts >= 2 
      ORDER BY updated_at DESC LIMIT 20
    `).all();

    const dashboardData = {
      overview: {
        totalOrders: totalOrders?.count || 0,
        activeOrders: activeOrders?.count || 0,
        activeSessions: activeSessions.length,
      },
      orderStats,
      paymentStats,
      panStats,
      recentFailures,
      recentEvents,
      activeSessions,
      fraudAlerts,
    };

    res.json({
      success: true,
      message: "Dashboard data retrieved successfully",
      data: dashboardData
    });
  } catch (err) {
    console.error("❌ Admin dashboard error:", err.message);
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

/**
 * GET /api/admin/orders
 * Returns all orders with filters
 */
const getOrders = async (req, res) => {
  try {
    const db = getDb();
    const { status, limit = 50, offset = 0 } = req.query;

    let query = "SELECT * FROM orders";
    const params = [];

    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }

    query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const orders = db.prepare(query).all(...params);
    const total = db.prepare(
      status
        ? "SELECT COUNT(*) as count FROM orders WHERE status = ?"
        : "SELECT COUNT(*) as count FROM orders"
    ).get(...(status ? [status] : []));

    res.json({ 
      success: true, 
      message: "Orders retrieved successfully",
      data: { orders, total: total?.count || 0 } 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

/**
 * GET /api/admin/orders/:orderNo
 * Returns detailed info for a specific order
 */
const getOrderDetail = async (req, res) => {
  try {
    const { orderNo } = req.params;
    const db = getDb();

    const order = db.prepare("SELECT * FROM orders WHERE order_no = ?").get(orderNo);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found", 
        data: null 
      });
    }

    const payments = db.prepare(
      "SELECT * FROM payments WHERE order_no = ? ORDER BY created_at DESC"
    ).all(orderNo);

    const auditEvents = db.prepare(
      "SELECT * FROM audit_log WHERE order_no = ? ORDER BY created_at DESC LIMIT 50"
    ).all(orderNo);

    // Session status
    const sessionStatus = getSessionStatus(orderNo);

    res.json({
      success: true,
      message: "Order details retrieved successfully",
      data: {
        order,
        payments,
        auditEvents,
        sessionStatus,
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

/**
 * GET /api/admin/payments
 * Returns all payments
 */
const getPayments = async (req, res) => {
  try {
    const db = getDb();
    const { status, limit = 50 } = req.query;

    let query = "SELECT * FROM payments";
    const params = [];

    if (status) {
      query += " WHERE payment_status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(parseInt(limit));

    const payments = db.prepare(query).all(...params);
    res.json({ 
      success: true, 
      message: "Payments retrieved successfully", 
      data: payments 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

/**
 * GET /api/admin/audit
 * Returns audit log entries
 */
const getAuditLog = async (req, res) => {
  try {
    const db = getDb();
    const { event, limit = 100 } = req.query;

    let query = "SELECT * FROM audit_log";
    const params = [];

    if (event) {
      query += " WHERE event = ?";
      params.push(event);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(parseInt(limit));

    const logs = db.prepare(query).all(...params);
    res.json({ 
      success: true, 
      message: "Audit logs retrieved successfully", 
      data: logs 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

/**
 * GET /api/admin/stats
 * Returns API health and system stats
 */
const getStats = async (req, res) => {
  try {
    const db = getDb();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const todayOrders = db.prepare(
      "SELECT COUNT(*) as count FROM orders WHERE created_at >= ?"
    ).get(todayStart);

    const todayPayments = db.prepare(
      "SELECT COUNT(*) as count, SUM(amount) as total FROM payments WHERE created_at >= ?"
    ).get(todayStart);

    const todayPanVerifications = db.prepare(
      "SELECT COUNT(*) as count FROM pan_verifications WHERE created_at >= ?"
    ).get(todayStart);

    const retryCounts = db.prepare(`
      SELECT SUM(pan_attempts) as total_attempts, 
             AVG(pan_attempts) as avg_attempts,
             MAX(pan_attempts) as max_attempts
      FROM orders WHERE created_at >= ?
    `).get(todayStart);

    const statsData = {
      today: {
        orders: todayOrders?.count || 0,
        payments: todayPayments?.count || 0,
        paymentVolume: todayPayments?.total || 0,
        panVerifications: todayPanVerifications?.count || 0,
      },
      retries: {
        totalAttempts: retryCounts?.total_attempts || 0,
        avgAttempts: Math.round((retryCounts?.avg_attempts || 0) * 100) / 100,
        maxAttempts: retryCounts?.max_attempts || 0,
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };

    res.json({
      success: true,
      message: "System stats retrieved successfully",
      data: statsData
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

module.exports = {
  getDashboard,
  getOrders,
  getOrderDetail,
  getPayments,
  getAuditLog,
  getStats,
};
