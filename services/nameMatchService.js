const { auditLog } = require("../utils/logger");

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate Levenshtein similarity ratio (0 to 1)
 */
function levenshteinSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Normalize a name for comparison
 * - Uppercase
 * - Remove extra spaces
 * - Remove common prefixes/suffixes
 * - Remove special characters
 */
function normalizeName(name) {
  if (!name) return "";

  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")     // Remove non-alpha except spaces
    .replace(/\b(MR|MRS|MS|DR|SHRI|SMT|KUMAR|KUMARI)\b/g, "") // Remove honorifics
    .replace(/\s+/g, " ")          // Collapse multiple spaces
    .trim();
}

/**
 * Tokenize a name into sorted unique words
 */
function tokenize(name) {
  const normalized = normalizeName(name);
  return [...new Set(normalized.split(" ").filter(Boolean))].sort();
}

/**
 * Token-based matching — counts how many tokens overlap
 * Returns a score from 0 to 1
 */
function tokenMatchScore(name1, name2) {
  const tokens1 = tokenize(name1);
  const tokens2 = tokenize(name2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  let matchCount = 0;

  for (const t1 of tokens1) {
    for (const t2 of tokens2) {
      // Exact token match or high similarity
      if (t1 === t2 || levenshteinSimilarity(t1, t2) >= 0.85) {
        matchCount++;
        break;
      }
    }
  }

  // Score based on proportion of matching tokens vs total unique tokens
  const totalUnique = new Set([...tokens1, ...tokens2]).size;
  return matchCount / Math.min(tokens1.length, tokens2.length);
}

/**
 * Match two names with multiple strategies
 * @param {string} panName - Name from PAN verification
 * @param {string} beneficiaryName - Name from bank/UPI account
 * @returns {{ match: boolean, score: number, method: string, details: object }}
 */
function matchNames(panName, beneficiaryName) {
  if (!panName || !beneficiaryName) {
    return { match: false, score: 0, method: "none", details: { reason: "Missing name" } };
  }

  const norm1 = normalizeName(panName);
  const norm2 = normalizeName(beneficiaryName);

  // Strategy 1: Exact match after normalization
  if (norm1 === norm2) {
    auditLog("NAME_MATCH", { method: "exact", score: 1.0, panName, beneficiaryName });
    return { match: true, score: 1.0, method: "exact", details: { norm1, norm2 } };
  }

  // Strategy 2: One name contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    auditLog("NAME_MATCH", { method: "contains", score: 0.95, panName, beneficiaryName });
    return { match: true, score: 0.95, method: "contains", details: { norm1, norm2 } };
  }

  // Strategy 3: Token-based matching
  const tokenScore = tokenMatchScore(panName, beneficiaryName);
  if (tokenScore >= 0.6) {
    auditLog("NAME_MATCH", { method: "token", score: tokenScore, panName, beneficiaryName });
    return { match: true, score: tokenScore, method: "token", details: { norm1, norm2, tokenScore } };
  }

  // Strategy 4: Levenshtein similarity on full normalized names
  const levScore = levenshteinSimilarity(norm1, norm2);
  if (levScore >= 0.75) {
    auditLog("NAME_MATCH", { method: "levenshtein", score: levScore, panName, beneficiaryName });
    return { match: true, score: levScore, method: "levenshtein", details: { norm1, norm2, levScore } };
  }

  // No match
  auditLog("NAME_MISMATCH", {
    panName,
    beneficiaryName,
    tokenScore,
    levScore,
  });

  return {
    match: false,
    score: Math.max(tokenScore, levScore),
    method: "none",
    details: { norm1, norm2, tokenScore, levScore },
  };
}

module.exports = { matchNames, normalizeName, tokenize, levenshteinSimilarity };
