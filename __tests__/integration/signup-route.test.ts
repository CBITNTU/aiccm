import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// Stub only the email layer — Better Auth's sendOnSignUp hook runs during the
// route and reads request cookies via next/headers, unavailable in tests.
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

import { POST } from "@/app/api/auth/signup/route";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { profiles, userRoles, events } from "@/lib/db/schema/app";
import { makeRequest, readJson } from "../helpers/request";
import { resetDb } from "../helpers/dbReset";

const EMAIL = "signup-route@example.com";
const PASSWORD = "password123";

describe("POST /api/auth/signup (real database)", () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("creates user, profile, role, and event rows and returns 201", async () => {
    const response = await POST(
      makeRequest("/api/auth/signup", {
        method: "POST",
        json: { email: EMAIL, password: PASSWORD },
      }),
    );
    const { status, body } = await readJson(response);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.userId).toBeTruthy();
    const userId = body.userId as string;

    const userRows = await db.select().from(user).where(eq(user.email, EMAIL));
    expect(userRows).toHaveLength(1);
    expect(userRows[0].id).toBe(userId);
    // name defaults to the email local part
    expect(userRows[0].name).toBe("signup-route");

    const profileRows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    expect(profileRows).toHaveLength(1);
    expect(profileRows[0].email).toBe(EMAIL);
    expect(profileRows[0].approvalStatus).toBe("pending");
    expect(profileRows[0].onboardingStep).toBe(1);

    const roleRows = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    expect(roleRows).toHaveLength(1);
    expect(roleRows[0].role).toBe("user");

    // logApiEvent writes to the real events table
    const eventRows = await db
      .select()
      .from(events)
      .where(eq(events.userId, userId));
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].actionType).toBe("user_signup");
    expect(eventRows[0].userEmail).toBe(EMAIL);
    expect(eventRows[0].requestPath).toBe("/api/auth/signup");
    expect(eventRows[0].requestMethod).toBe("POST");
  });

  it("rejects a duplicate email with 400", async () => {
    // The route logs the expected duplicate-email failure via console.error —
    // silence it here so the test output stays clean.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let response: Response;
    try {
      response = await POST(
        makeRequest("/api/auth/signup", {
          method: "POST",
          json: { email: EMAIL, password: PASSWORD },
        }),
      );
      expect(errorSpy).toHaveBeenCalledWith("Signup error:", expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
    const { status, body } = await readJson(response);

    expect(status).toBe(400);
    expect(body.error).toContain("already exists");

    // No second user was created
    const userRows = await db.select().from(user).where(eq(user.email, EMAIL));
    expect(userRows).toHaveLength(1);
  });

  it("rejects invalid payloads without touching the database", async () => {
    const missing = await readJson(
      await POST(
        makeRequest("/api/auth/signup", {
          method: "POST",
          json: { email: "no-password@example.com" },
        }),
      ),
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("Email and password are required");

    const shortPassword = await readJson(
      await POST(
        makeRequest("/api/auth/signup", {
          method: "POST",
          json: { email: "short-pass@example.com", password: "12345" },
        }),
      ),
    );
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body.error).toBe(
      "Password must be at least 6 characters",
    );

    const badEmail = await readJson(
      await POST(
        makeRequest("/api/auth/signup", {
          method: "POST",
          json: { email: "not-an-email", password: PASSWORD },
        }),
      ),
    );
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error).toBe("Invalid email address");

    const allUsers = await db.select({ id: user.id }).from(user);
    expect(allUsers).toHaveLength(1);
  });
});
