import { describe, expect, it } from "vitest";
import {
  generateInviteToken,
  getInviteExpiryDate,
  hashToken,
  isExpired,
  sanitizeHexToken,
} from "@/lib/utils/invite-token";

describe("generateInviteToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns a different token every time", () => {
    const tokens = new Set(
      Array.from({ length: 20 }, () => generateInviteToken()),
    );
    expect(tokens.size).toBe(20);
  });
});

describe("sanitizeHexToken", () => {
  it("accepts exactly 64 hex characters, trimming whitespace", () => {
    const token = "A".repeat(32) + "b".repeat(32);
    expect(sanitizeHexToken(token)).toBe(token);
    expect(sanitizeHexToken(`  ${token}  `)).toBe(token);
  });

  it("rejects wrong lengths, non-hex characters, and non-strings", () => {
    expect(sanitizeHexToken("a".repeat(63))).toBeNull();
    expect(sanitizeHexToken("a".repeat(65))).toBeNull();
    expect(sanitizeHexToken("z".repeat(64))).toBeNull();
    expect(sanitizeHexToken("g" + "a".repeat(63))).toBeNull();
    expect(sanitizeHexToken(42)).toBeNull();
    expect(sanitizeHexToken(null)).toBeNull();
    expect(sanitizeHexToken(undefined)).toBeNull();
    expect(sanitizeHexToken("")).toBeNull();
    // SQL-injection-shaped input is rejected, not passed through.
    expect(sanitizeHexToken("' OR 1=1 --" + "a".repeat(53))).toBeNull();
  });
});

describe("hashToken", () => {
  it("is deterministic and never equals the raw token", () => {
    const token = generateInviteToken();
    const hash = hashToken(token);

    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("a".repeat(64))).not.toBe(hashToken("b".repeat(64)));
  });

  it("matches the known SHA-256 test vector", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("getInviteExpiryDate", () => {
  it("defaults to 7 days from now", () => {
    const before = new Date();
    before.setDate(before.getDate() + 7);

    const expiry = getInviteExpiryDate();

    // Within a second of "now + 7 days".
    expect(Math.abs(expiry.getTime() - before.getTime())).toBeLessThan(1000);
  });

  it("honours a custom day count", () => {
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    expect(
      Math.abs(getInviteExpiryDate(30).getTime() - expected.getTime()),
    ).toBeLessThan(1000);
  });
});

describe("isExpired", () => {
  it("accepts both Date and ISO-string inputs", () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);

    expect(isExpired(past)).toBe(true);
    expect(isExpired(past.toISOString())).toBe(true);
    expect(isExpired(future)).toBe(false);
    expect(isExpired(future.toISOString())).toBe(false);
  });
});
