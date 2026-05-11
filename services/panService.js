const axios = require("axios");
const surepassConfig = require("../config/surepass");
const { getDb } = require("../config/database");
const { encrypt, decrypt, hash } = require("../utils/encryption");
const { auditLog } = require("../utils/logger");

// PAN Regex: 5 uppercase letters + 4 digits + 1 uppercase letter
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Validate PAN format using regex
 * @param {string} pan - Raw PAN input
 * @returns {{ valid: boolean, cleaned: string, error: string }}
 */
function validatePanFormat(pan) {
  if (!pan || typeof pan !== "string") {
    return { valid: false, cleaned: "", error: "Empty or invalid input" };
  }

  // Clean input: remove whitespace
  const cleaned = pan.trim().toUpperCase();

  // Reject if it contains multiple words (multiple PANs or extra text)
  if (cleaned.includes(" ") || cleaned.includes("\n")) {
    return { valid: false, cleaned, error: "Please send only the PAN number, no additional text" };
  }

  // Reject special characters
  if (/[^A-Z0-9]/.test(cleaned)) {
    return { valid: false, cleaned, error: "PAN number should not contain special characters" };
  }

  // Length check
  if (cleaned.length !== 10) {
    return { valid: false, cleaned, error: "PAN number must be exactly 10 characters" };
  }

  // Regex match
  if (!PAN_REGEX.test(cleaned)) {
    return { valid: false, cleaned, error: "Invalid PAN format" };
  }

  return { valid: true, cleaned, error: null };
}

/**
 * Check if PAN is already verified in local database
 * @param {string} pan - Cleaned PAN number
 * @returns {{ found: boolean, data: object|null }}
 */
function checkPanCache(pan) {
  try {
    const panHash = hash(pan);
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM pan_verifications WHERE pan_hash = ? AND verification_status = 'verified'")
      .get(panHash);

    if (row) {
      auditLog("PAN_CACHE_HIT", { panHash: panHash.slice(0, 8) + "..." });
      return {
        found: true,
        data: {
          verifiedName: row.verified_name,
          panStatus: row.pan_status,
          verificationStatus: row.verification_status,
          lastVerifiedAt: row.last_verified_at,
        },
      };
    }

    return { found: false, data: null };
  } catch (err) {
    console.error("❌ PAN cache check error:", err.message);
    return { found: false, data: null };
  }
}

/**
 * Verify PAN using Surepass API
 * @param {string} pan - Cleaned PAN number
 * @returns {{ success: boolean, name: string, status: string, error: string }}
 */
async function verifyPanWithSurepass(pan) {
  try {
    if (!surepassConfig.apiKey) {
      auditLog("PAN_API_NO_KEY", { message: "Surepass API key not configured" });
      return { success: false, name: null, status: null, error: "API not configured" };
    }

    const response = await axios.post(
      `${surepassConfig.baseUrl}/pan/pan`,
      { id_number: pan },
      {
        headers: {
          Authorization: `Bearer ${surepassConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const data = response.data;

    if (data.success || data.status_code === 200) {
      const panData = data.data || {};
      const fullName = panData.full_name || panData.name || "";
      const panStatus = panData.pan_status || panData.status || "valid";

      // Store in database cache
      storePanVerification(pan, fullName, panStatus, JSON.stringify(data));

      auditLog("PAN_VERIFIED_SUREPASS", {
        panHash: hash(pan).slice(0, 8) + "...",
        name: fullName,
        status: panStatus,
      });

      return { success: true, name: fullName, status: panStatus, error: null };
    }

    return {
      success: false,
      name: null,
      status: data.message || "verification_failed",
      error: data.message || "PAN verification failed",
    };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    auditLog("PAN_API_ERROR", { error: errMsg });
    console.error("❌ Surepass API Error:", errMsg);

    return { success: false, name: null, status: "api_error", error: errMsg };
  }
}

/**
 * Store verified PAN in database
 */
function storePanVerification(pan, name, status, surepassResponse) {
  try {
    const db = getDb();
    const panHash = hash(pan);
    const panEncrypted = encrypt(pan);

    db.prepare(`
      INSERT INTO pan_verifications (pan_hash, pan_number_encrypted, verified_name, verification_status, pan_status, surepass_response, last_verified_at)
      VALUES (?, ?, ?, 'verified', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(pan_hash) DO UPDATE SET
        verified_name = excluded.verified_name,
        verification_status = 'verified',
        pan_status = excluded.pan_status,
        surepass_response = excluded.surepass_response,
        last_verified_at = CURRENT_TIMESTAMP
    `).run(panHash, panEncrypted, name, status, surepassResponse);

    auditLog("PAN_STORED", { panHash: panHash.slice(0, 8) + "..." });
  } catch (err) {
    console.error("❌ Error storing PAN verification:", err.message);
  }
}

/**
 * Full PAN verification flow: regex → cache → API
 * @param {string} rawPan - Raw input from user
 * @returns {{ success: boolean, name: string, error: string, source: string }}
 */
async function verifyPan(rawPan) {
  // Step 1: Regex validation
  const format = validatePanFormat(rawPan);
  if (!format.valid) {
    return { success: false, name: null, error: format.error, source: "regex" };
  }

  const pan = format.cleaned;

  // Step 2: Check database cache
  const cached = checkPanCache(pan);
  if (cached.found) {
    return {
      success: true,
      name: cached.data.verifiedName,
      error: null,
      source: "cache",
    };
  }

  // Step 3: Verify via Surepass API
  const apiResult = await verifyPanWithSurepass(pan);
  if (apiResult.success) {
    return {
      success: true,
      name: apiResult.name,
      error: null,
      source: "surepass",
    };
  }

  return {
    success: false,
    name: null,
    error: apiResult.error,
    source: apiResult.status === "api_error" ? "api_error" : "invalid",
  };
}

module.exports = {
  validatePanFormat,
  checkPanCache,
  verifyPanWithSurepass,
  verifyPan,
};
