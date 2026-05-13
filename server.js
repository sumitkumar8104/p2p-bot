const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const path = require("path");
const binanceConfig = require("./config/binance");
const { getDb, closeDb } = require("./config/database");
const { initSocket } = require("./services/socketService");
const orderRoutes = require("./routes/orderRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");
const templateRoutes = require("./routes/templateRoutes");
const payoutRoutes = require("./routes/payoutRoutes");
const authRoutes = require("./routes/authRoutes");
const botConfigRoutes = require("./routes/botConfigRoutes");
const { initMysql } = require("./config/mysql");
const { auditLog } = require("./utils/logger");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:8080", "http://localhost:3000","http://192.168.1.69:8080", "http://192.168.1.69:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: ["http://localhost:8080", "http://localhost:3000","http://192.168.1.69:8080", "http://192.168.1.69:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// ── Initialize Database ──
getDb();
initMysql();

// ── Middleware ──
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ──
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/payouts", payoutRoutes);
app.use("/api/bot-config", botConfigRoutes);

// ── Socket Initialization ──
initSocket(io);

// ── Server Start ──
server.listen(binanceConfig.port, () => {
  auditLog("SERVER_STARTED", { port: binanceConfig.port });
  console.log(`
  🚀 P2P Payment Verification Bot
  🔗 Dashboard:  http://localhost:${binanceConfig.port}
  🔧 Admin:      http://localhost:${binanceConfig.port}/admin.html
  📊 API:        http://localhost:${binanceConfig.port}/api/admin/dashboard
  `);
});

// ── Graceful Shutdown ──
function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully…`);
  auditLog("SERVER_SHUTDOWN", { signal });
  
  // Close all Binance WebSockets
  const { closeAllConnections } = require("./services/socketService");
  closeAllConnections();

  // Close database
  closeDb();

  server.close(() => {
    console.log("✅ Server closed.");
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
  auditLog("UNCAUGHT_EXCEPTION", { error: err.message });
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  auditLog("UNHANDLED_REJECTION", { reason: String(reason) });
});
