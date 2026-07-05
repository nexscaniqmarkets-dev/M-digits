import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV, recommended for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a fixed-length 256-bit key from whatever secret string is provided
 * (e.g. an env var), so the operator doesn't need to generate/format a raw
 * key themselves — any reasonably random passphrase works.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Encrypts a plaintext string (e.g. a Deriv API token) for storage at rest.
 * Returns a single base64 string packing [iv][authTag][ciphertext] together,
 * safe to store as one JSON field.
 */
export function encryptSecret(plaintext: string, keySecret: string): string {
  const key = deriveKey(keySecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Reverses encryptSecret. Returns null (rather than throwing) on any
 * failure — wrong key, corrupted data, or a value that was never encrypted
 * — so callers can fall back gracefully instead of crashing a session load.
 */
export function decryptSecret(encoded: string, keySecret: string): string | null {
  try {
    const key = deriveKey(keySecret);
    const data = Buffer.from(encoded, "base64");
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    return null;
  }
}
