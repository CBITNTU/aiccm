import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route statically imports @/lib/auth (signUpEmail), @/lib/db (rollback
// delete), @/lib/db/queries (createProfile/createUserRole) and the event
// logger — stub them all so no real auth/DB/network is touched.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("@/lib/db/queries", () => ({
  createProfile: vi.fn(),
  createUserRole: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(),
}));

import { POST } from "@/app/api/auth/signup/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createProfile, createUserRole } from "@/lib/db/queries";
import { logApiEvent } from "@/lib/services/eventLogger";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { TEST_USER_ID } from "@/__tests__/helpers/mocks";

const signUpEmailMock = vi.mocked(auth.api.signUpEmail);
const createProfileMock = vi.mocked(createProfile);
const createUserRoleMock = vi.mocked(createUserRole);
const logApiEventMock = vi.mocked(logApiEvent);

const VALID_BODY = { email: "new.user@example.com", password: "secret123" };

function signupRequest(json: unknown) {
  return makeRequest("/api/auth/signup", { method: "POST", json });
}

beforeEach(() => {
  signUpEmailMock.mockResolvedValue({
    user: { id: TEST_USER_ID, email: VALID_BODY.email },
  } as unknown as Awaited<ReturnType<typeof auth.api.signUpEmail>>);
  createProfileMock.mockResolvedValue(undefined as never);
  createUserRoleMock.mockResolvedValue(undefined as never);
  logApiEventMock.mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("POST /api/auth/signup — validation", () => {
  it.each([
    ["missing email", { password: "secret123" }],
    ["missing password", { email: "new.user@example.com" }],
    ["empty body", {}],
  ])("rejects %s with 400", async (_label, body) => {
    const { status, body: json } = await readJson(await POST(signupRequest(body)));

    expect(status).toBe(400);
    expect(json.error).toBe("Email and password are required");
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it.each(["not-an-email", "a@b", "a b@c.com", "user@domain"])(
    "rejects invalid email format %s with 400",
    async (email) => {
      const { status, body } = await readJson(
        await POST(signupRequest({ email, password: "secret123" })),
      );

      expect(status).toBe(400);
      expect(body.error).toBe("Invalid email address");
    },
  );

  it("rejects passwords shorter than 6 characters", async () => {
    const { status, body } = await readJson(
      await POST(signupRequest({ email: VALID_BODY.email, password: "12345" })),
    );

    expect(status).toBe(400);
    expect(body.error).toBe("Password must be at least 6 characters");
  });

  it("rejects passwords longer than 128 characters", async () => {
    const { status, body } = await readJson(
      await POST(
        signupRequest({ email: VALID_BODY.email, password: "x".repeat(129) }),
      ),
    );

    expect(status).toBe(400);
    expect(body.error).toBe("Password must be between 6 and 128 characters");
  });

  it("accepts a password of exactly 128 characters", async () => {
    const { status } = await readJson(
      await POST(
        signupRequest({ email: VALID_BODY.email, password: "x".repeat(128) }),
      ),
    );

    expect(status).toBe(201);
  });

  it("rejects passwords containing a null byte", async () => {
    const { status, body } = await readJson(
      await POST(
        signupRequest({ email: VALID_BODY.email, password: "abc\0def" }),
      ),
    );

    expect(status).toBe(400);
    expect(body.error).toBe("Invalid password");
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/signup — happy path", () => {
  it("creates the user, profile, role and event log, returning 201", async () => {
    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(201);
    expect(body).toEqual({
      success: true,
      userId: TEST_USER_ID,
      message:
        "Account created. Please check your email to verify your address.",
    });

    // name is derived from the email's local part
    expect(signUpEmailMock).toHaveBeenCalledWith({
      body: {
        email: VALID_BODY.email,
        password: VALID_BODY.password,
        name: "new.user",
      },
    });
    expect(createProfileMock).toHaveBeenCalledWith(TEST_USER_ID, VALID_BODY.email);
    expect(createUserRoleMock).toHaveBeenCalledWith(TEST_USER_ID, "user");
    expect(logApiEventMock).toHaveBeenCalledWith(expect.anything(), {
      actionType: "user_signup",
      userId: TEST_USER_ID,
      userEmail: VALID_BODY.email,
      details: { emailVerified: false },
    });
  });
});

describe("POST /api/auth/signup — failure modes", () => {
  it("returns 500 when signUpEmail yields no user", async () => {
    signUpEmailMock.mockResolvedValue(null as never);

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(500);
    expect(body.error).toBe("Failed to create user");
    expect(createProfileMock).not.toHaveBeenCalled();
  });

  it.each([
    "User already exists",
    "An account already registered",
    "email exists in the system",
  ])("maps duplicate-user error %s to a 400 with a friendly message", async (message) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signUpEmailMock.mockRejectedValue(new Error(message));

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(400);
    expect(body.error).toBe(
      "An account with this email already exists. Please sign in instead.",
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 500 with the error message for other signUpEmail failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signUpEmailMock.mockRejectedValue(new Error("auth service unavailable"));

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(500);
    expect(body.error).toBe("auth service unavailable");
  });

  it("returns 500 'Unknown error' for non-Error throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signUpEmailMock.mockRejectedValue("string failure");

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(500);
    expect(body.error).toBe("Unknown error");
  });

  it("returns 500 and rolls back the auth user when createProfile rejects", async () => {
    // signUpEmail can't share a transaction with createProfile/createUserRole
    // (Better Auth writes through its own adapter), so the route compensates by
    // deleting the user row — FK cascades clean up any dependents and the
    // email can be used to sign up again.
    vi.spyOn(console, "error").mockImplementation(() => {});
    createProfileMock.mockRejectedValue(new Error("profile insert failed"));

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(500);
    expect(body.error).toBe("profile insert failed");
    expect(signUpEmailMock).toHaveBeenCalledTimes(1); // user was created
    expect(createUserRoleMock).not.toHaveBeenCalled(); // role never assigned
    expect(logApiEventMock).not.toHaveBeenCalled();
    expect(vi.mocked(db.delete)).toHaveBeenCalledTimes(1); // user rolled back
  });

  it("rolls back the auth user when createUserRole rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createUserRoleMock.mockRejectedValue(new Error("role insert failed"));

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(500);
    expect(body.error).toBe("role insert failed");
    expect(vi.mocked(db.delete)).toHaveBeenCalledTimes(1);
    expect(logApiEventMock).not.toHaveBeenCalled();
  });

  it("still returns the original 500 when the rollback delete itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createProfileMock.mockRejectedValue(new Error("profile insert failed"));
    vi.mocked(db.delete).mockImplementationOnce(() => {
      throw new Error("delete failed");
    });

    const { status, body } = await readJson(await POST(signupRequest(VALID_BODY)));

    expect(status).toBe(500);
    expect(body.error).toBe("profile insert failed");
  });
});
