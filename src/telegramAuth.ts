import crypto from "crypto";

/**
 * Verified Telegram user, derived only from a cryptographically validated
 * initData string. Never trust initDataUnsafe on the client for anything
 * that touches balance, trades, or credentials.
 */
export interface VerifiedTelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // reject initData older than 24h

/**
 * Validates a Telegram WebApp `initData` string using the bot token, per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns the verified user on success, or null if validation fails
 * (bad signature, missing fields, or expired auth_date).
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
): VerifiedTelegramUser | null {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    // Build the data-check-string: all fields sorted alphabetically, "key=value" joined by \n
    const dataCheckArr: string[] = [];
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join("\n");

    // secret_key = HMAC_SHA256(bot_token, key="WebAppData")
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();

    // computed_hash = HMAC_SHA256(data_check_string, key=secret_key), hex-encoded
    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    // Constant-time comparison to avoid timing attacks
    const hashBuf = Buffer.from(hash, "hex");
    const computedBuf = Buffer.from(computedHash, "hex");
    if (hashBuf.length !== computedBuf.length || !crypto.timingSafeEqual(hashBuf, computedBuf)) {
      return null;
    }

    const authDate = parseInt(params.get("auth_date") || "0", 10);
    if (!authDate) return null;
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > MAX_AUTH_AGE_SECONDS || ageSeconds < 0) {
      return null; // expired or clock-skew nonsense
    }

    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    if (!user.id) return null;

    return {
      id: user.id,
      firstName: user.first_name || "",
      lastName: user.last_name,
      username: user.username,
      photoUrl: user.photo_url,
      authDate
    };
  } catch (e) {
    return null;
  }
}
