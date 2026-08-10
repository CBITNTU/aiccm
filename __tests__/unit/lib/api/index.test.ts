import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// index.ts dynamically imports @/lib/auth and @/lib/db/queries — stub both.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/queries", () => ({
  userHasRole: vi.fn(),
}));

import {
  apiError,
  apiResponse,
  checkSuperadminRole,
  getAuthenticatedUser,
} from "@/lib/api";
import { auth } from "@/lib/auth";
import { userHasRole } from "@/lib/db/queries";

const getSession = vi.mocked(auth.api.getSession);
const req = { headers: new Headers() } as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiResponse", () => {
  it("returns JSON with a 200 default status", async () => {
    const res = apiResponse({ ok: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("honours a custom status and headers", async () => {
    const res = apiResponse({ created: true }, 201, { "x-test": "1" });
    expect(res.status).toBe(201);
    expect(res.headers.get("x-test")).toBe("1");
  });
});

describe("apiError", () => {
  it("defaults to a 500 with the error envelope", async () => {
    const res = apiError("Something broke");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something broke" });
  });

  it("includes details only when provided", async () => {
    const withDetails = apiError("Bad request", 400, "field X is required");
    expect(withDetails.status).toBe(400);
    expect(await withDetails.json()).toEqual({
      error: "Bad request",
      details: "field X is required",
    });

    const without = apiError("Bad request", 400);
    expect(await without.json()).toEqual({ error: "Bad request" });
  });
});

describe("getAuthenticatedUser", () => {
  it("returns the session user with null error", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "u1", email: "u1@example.com", emailVerified: true },
    } as never);

    const result = await getAuthenticatedUser(req);

    expect(result).toEqual({
      user: { id: "u1", email: "u1@example.com", emailVerified: true },
      error: null,
    });
  });

  it("coalesces a missing emailVerified flag to null", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "u1", email: "u1@example.com" },
    } as never);

    const { user } = await getAuthenticatedUser(req);
    expect(user!.emailVerified).toBeNull();
  });

  it("returns {user: null, error} when there is no session", async () => {
    getSession.mockResolvedValueOnce(null as never);

    expect(await getAuthenticatedUser(req)).toEqual({
      user: null,
      error: "Unauthorized",
    });
  });

  it("swallows session-lookup failures instead of throwing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    getSession.mockRejectedValueOnce(new Error("auth service down"));

    expect(await getAuthenticatedUser(req)).toEqual({
      user: null,
      error: "Unauthorized",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("checkSuperadminRole", () => {
  it("delegates to userHasRole with the superadmin role", async () => {
    vi.mocked(userHasRole).mockResolvedValueOnce(true);
    expect(await checkSuperadminRole("u1")).toBe(true);
    expect(userHasRole).toHaveBeenCalledWith("u1", "superadmin");

    vi.mocked(userHasRole).mockResolvedValueOnce(false);
    expect(await checkSuperadminRole("u2")).toBe(false);
  });
});
