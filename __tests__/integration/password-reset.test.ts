import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// lib/auth's email hooks use next-intl + next/headers cookies, which are
// unavailable outside a real request context — stub the email layer, keep
// everything else (Better Auth, bcrypt, Postgres) real. The template stubs
// echo the reset link so the test can pull the token back out of the "email";
// the real templates are covered by the unit tests.
vi.mock("@/lib/email", () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ success: true, data: { id: "test-email" } }),
  getPlatformName: () => "TNDRX Test",
  getPlatformUrl: (path = "") => `http://localhost:3000${path}`,
  getPasswordResetEmailSubject: () => "Reset your password - TNDRX Test",
  getPasswordResetEmailHtml: ({ resetLink }: { resetLink: string }) =>
    `<a href="${resetLink}">Reset Password</a>`,
}));

vi.mock("@/lib/email/i18n", () => {
  const translator = Object.assign((key: string) => key, {
    rich: (key: string) => key,
    raw: (key: string) => key,
  });
  return {
    getEmailLocale: vi.fn().mockResolvedValue("en"),
    getEmailTranslator: () => translator,
    emailDateLocale: () => "en-GB",
    strongTag: (chunks: unknown) => `<strong>${chunks}</strong>`,
  };
});

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account, session, verification } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { resetDb } from "../helpers/dbReset";

const EMAIL = "password-reset@example.com";
const OLD_PASSWORD = "old-correct-horse";
const NEW_PASSWORD = "new-battery-staple";
const REDIRECT_TO = "/auth/reset-password";

/** Pull the token out of the reset link the hook handed to sendEmail. */
function tokenFromLastEmail(): string {
  const calls = vi.mocked(sendEmail).mock.calls;
  const html = calls[calls.length - 1][0].html;
  const match = html.match(/reset-password\/([^?"]+)/);
  if (!match) throw new Error(`No reset token in email html: ${html}`);
  return match[1];
}

/** Better Auth throws APIError; normalise to a status code for assertions. */
async function expectRejection(fn: () => Promise<unknown>): Promise<number> {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn();
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? 0;
  } finally {
    errorSpy.mockRestore();
  }
  throw new Error("Expected the call to reject, but it resolved");
}

describe("Password reset flow (real database)", () => {
  let userId: string;
  let resetToken: string;

  beforeAll(async () => {
    await resetDb();
    const signUp = await auth.api.signUpEmail({
      body: { email: EMAIL, password: OLD_PASSWORD, name: "Reset Me" },
    });
    userId = signUp.user.id;

    // Establish a live session, so revocation on reset is observable.
    await auth.api.signInEmail({
      body: { email: EMAIL, password: OLD_PASSWORD },
    });
    const sessions = await db
      .select()
      .from(session)
      .where(eq(session.userId, userId));
    expect(sessions.length).toBeGreaterThan(0);

    vi.mocked(sendEmail).mockClear();
  });

  it("requestPasswordReset emails a reset link and stores a token", async () => {
    const result = await auth.api.requestPasswordReset({
      body: { email: EMAIL, redirectTo: REDIRECT_TO },
    });
    expect(result.status).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sent.to).toBe(EMAIL);
    expect(sent.html).toContain(encodeURIComponent(REDIRECT_TO));

    resetToken = tokenFromLastEmail();
    expect(resetToken).toBeTruthy();

    const rows = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, `reset-password:${resetToken}`));
    expect(rows).toHaveLength(1);
    // The token maps to the user; the password itself is never in the token row.
    expect(rows[0].value).toBe(userId);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not reveal whether an address has an account", async () => {
    vi.mocked(sendEmail).mockClear();
    const result = await auth.api.requestPasswordReset({
      body: { email: "nobody-here@example.com", redirectTo: REDIRECT_TO },
    });

    // Same success shape as the real-account case, and no email sent.
    expect(result.status).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("resetPassword sets a new bcrypt hash and consumes the token", async () => {
    const before = await db
      .select()
      .from(account)
      .where(eq(account.userId, userId));
    const oldHash = before[0].password;

    const result = await auth.api.resetPassword({
      body: { newPassword: NEW_PASSWORD, token: resetToken },
    });
    expect(result.status).toBe(true);

    const after = await db
      .select()
      .from(account)
      .where(eq(account.userId, userId));
    expect(after[0].password).toMatch(/^\$2[aby]\$10\$/);
    expect(after[0].password).not.toBe(oldHash);
    expect(after[0].password).not.toContain(NEW_PASSWORD);

    const tokenRows = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, `reset-password:${resetToken}`));
    expect(tokenRows).toHaveLength(0);
  });

  it("revokes every existing session", async () => {
    const rows = await db
      .select()
      .from(session)
      .where(eq(session.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("signs in with the new password and rejects the old one", async () => {
    const signedIn = await auth.api.signInEmail({
      body: { email: EMAIL, password: NEW_PASSWORD },
    });
    expect(signedIn.user.id).toBe(userId);
    expect(signedIn.token).toBeTruthy();

    const status = await expectRejection(() =>
      auth.api.signInEmail({ body: { email: EMAIL, password: OLD_PASSWORD } }),
    );
    expect(status).toBe(401);
  });

  it("rejects a replay of the already-used token", async () => {
    const status = await expectRejection(() =>
      auth.api.resetPassword({
        body: { newPassword: "another-password", token: resetToken },
      }),
    );
    expect(status).toBe(400);
  });
});
