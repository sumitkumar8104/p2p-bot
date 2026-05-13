const { pool } = require("../config/mysql");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
        data: null
      });
    }

    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null
      });
    }

    // Check if user is already logged in
    if (user.is_login) {
      return res.status(403).json({
        success: false,
        message: "You need to logout from other device where you are logged in",
        data: null
      });
    }

    // Set is_login to true
    await pool.query("UPDATE users SET is_login = TRUE WHERE id = ?", [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null
    });
  }
};

const logout = async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query("UPDATE users SET is_login = FALSE WHERE id = ?", [userId]);

    res.json({
      success: true,
      message: "Logged out successfully",
      data: null
    });
  } catch (err) {
    console.error("❌ Logout error:", err.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide old and new password",
        data: null
      });
    }

    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    const user = users[0];

    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Incorrect old password",
        data: null
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, userId]);

    res.json({
      success: true,
      message: "Password updated successfully",
      data: null
    });
  } catch (err) {
    console.error("❌ Change password error:", err.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null
    });
  }
};

module.exports = { login, logout, changePassword };
