import crypto from "crypto";

/**
 * Generate a cryptographically secure invitation token
 * Returns a 64-character hex string (32 bytes)
 */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Invite tokens are 64 hex characters (32 bytes). */
const INVITE_TOKEN_REGEX = /^[a-fA-F0-9]{64}$/;

/**
 * Sanitize and validate an invite token. Returns the token only if it is
 * exactly 64 hexadecimal characters (safe for hashing and parameterized queries).
 */
export function sanitizeHexToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return INVITE_TOKEN_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Hash a token for secure storage in the database
 * Uses SHA-256 to create a one-way hash
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Get expiry date for an invitation
 * @param days - Number of days until expiry (default: 7)
 */
export function getInviteExpiryDate(days: number = 7): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Check if a date has expired
 */
export function isExpired(expiresAt: Date | string): boolean {
  const expiry =
    typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return expiry < new Date();
}
