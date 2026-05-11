const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Falls back to a derived key from BINANCE_API_SECRET if ENCRYPTION_KEY is not set.
 */
function getKey() {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 64) {
    return Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  }
  // Fallback: derive from API secret
  return crypto
    .createHash("sha256")
    .update(process.env.BINANCE_API_SECRET || process.env.BINANCE_SECRET_KEY || "default-secret-change-me")
    .digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param {string} plaintext
 * @returns {string} base64-encoded ciphertext (iv + tag + encrypted)
 */
function encrypt(plaintext) {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv (16) + tag (16) + ciphertext
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext
 * @param {string} ciphertext - base64 encoded
 * @returns {string} plaintext
 */
function decrypt(ciphertext) {
  if (!ciphertext) return "";
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Create a SHA-256 hash of the input (used for PAN cache lookups)
 * @param {string} input
 * @returns {string} hex hash
 */
function hash(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

module.exports = { encrypt, decrypt, hash };
