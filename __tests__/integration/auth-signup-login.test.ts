import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// Better Auth's sendVerificationEmail hook (lib/auth.ts) fires on signup and
// uses next-intl + next/headers cookies, which are unavailable outside a real
// request context — stub the email layer, keep everything else real.
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, data: { id: "test-email" } }),
  getPlatformName: () => "TNDRX Test",
  getPlatformUrl: (path = "") => `http://localhost:3000${path}`,
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
import { user, account } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { resetDb } from "../helpers/dbReset";

const EMAIL = "signup-login@example.com";
const PASSWORD = "correct-horse-battery";

describe("Better Auth signup + login (real database)", () => {
  beforeAll(async () => {
    await resetDb();
    vi.mocked(sendEmail).mockClear();
  });

  let userId: string;

  it("signUpEmail creates user and credential account rows", async () => {
    const result = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Signup Login" },
    });

    expect(result?.user).toBeTruthy();
    expect(result.user.email).toBe(EMAIL);
    userId = result.user.id;

    const userRows = await db.select().from(user).where(eq(user.email, EMAIL));
    expect(userRows).toHaveLength(1);
    expect(userRows[0].id).toBe(userId);
    expect(userRows[0].name).toBe("Signup Login");
    expect(userRows[0].emailVerified).toBe(false);

    const accountRows = await db
      .select()
      .from(account)
      .where(eq(account.userId, userId));
    expect(accountRows).toHaveLength(1);
    expect(accountRows[0].providerId).toBe("credential");
    // bcrypt hash, never the plaintext
    expect(accountRows[0].password).toMatch(/^\$2[aby]\$10\$/);
    expect(accountRows[0].password).not.toContain(PASSWORD);
  });

  it("fired the verification email hook (sendOnSignUp)", () => {
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = vi.mocked(sendEmail).mock.calls[0][0];
    expect(args.to).toBe(EMAIL);
    expect(args.html).toContain("verify-email");
  });

  it("signInEmail succeeds with the correct password and returns a session token", async () => {
    const result = await auth.api.signInEmail({
      body: { email: EMAIL, password: PASSWORD },
    });

    expect(result.user.id).toBe(userId);
    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe("string");
  });

  it("signInEmail rejects a wrong password with 401", async () => {
    // Better Auth logs the invalid-password attempt via console.error —
    // expected here, so keep it out of the test output.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let thrown: unknown;
    try {
      await auth.api.signInEmail({
        body: { email: EMAIL, password: "wrong-password" },
      });
    } catch (error) {
      thrown = error;
    } finally {
      errorSpy.mockRestore();
    }

    expect(thrown).toBeInstanceOf(Error);
    const apiError = thrown as { status?: string; statusCode?: number };
    expect(
      apiError.statusCode === 401 || apiError.status === "UNAUTHORIZED",
    ).toBe(true);
  });
});
