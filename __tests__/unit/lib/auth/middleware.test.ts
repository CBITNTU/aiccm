import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// updateSession dynamically imports @/lib/auth (for getSession) and statically
// imports @/lib/db/queries — stub both so no real auth/DB is touched.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/queries", () => ({
  getProfileByUserId: vi.fn(),
  getUserRoleByUserId: vi.fn(),
}));

import { updateSession } from "@/lib/auth/middleware";
import { auth } from "@/lib/auth";
import { getProfileByUserId, getUserRoleByUserId } from "@/lib/db/queries";
import { makeRequest } from "@/__tests__/helpers/request";
import { mockProfile, mockSession, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";

const getSessionMock = vi.mocked(auth.api.getSession);
const getProfileMock = vi.mocked(getProfileByUserId);
const getRoleMock = vi.mocked(getUserRoleByUserId);

const SESSION_COOKIE = { "better-auth.session_token": "test-token" };

function authedRequest(
  url: string,
  searchParams?: Record<string, string>,
) {
  return makeRequest(url, { cookies: SESSION_COOKIE, searchParams });
}

/** Asserts a 307 redirect and returns the parsed Location URL. */
function expectRedirect(response: Response, pathname: string): URL {
  expect(response.status).toBe(307);
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  const url = new URL(location!);
  expect(url.pathname).toBe(pathname);
  return url;
}

/** Asserts the NextResponse.next() pass-through shape. */
function expectPassThrough(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(
    mockSession() as unknown as Awaited<ReturnType<typeof auth.api.getSession>>,
  );
  getProfileMock.mockResolvedValue(
    mockProfile() as unknown as Awaited<ReturnType<typeof getProfileByUserId>>,
  );
  getRoleMock.mockResolvedValue({ role: "user" } as unknown as Awaited<
    ReturnType<typeof getUserRoleByUserId>
  >);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("updateSession — unauthenticated (no session cookie)", () => {
  it("redirects a protected path to /auth with redirectTo", async () => {
    const response = await updateSession(makeRequest("/dashboard"));

    const url = expectRedirect(response, "/auth");
    expect(url.searchParams.get("redirectTo")).toBe("/dashboard");
    // No cookie → getSession is never consulted
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("passes through public paths", async () => {
    const response = await updateSession(makeRequest("/"));

    expectPassThrough(response);
  });

  it("passes through non-protected app paths like /companies/[id]", async () => {
    const response = await updateSession(makeRequest(`/companies/${TEST_COMPANY_ID}`));

    expectPassThrough(response);
  });

  it("redirects /directory/<uuid> to the public /companies/<uuid> page", async () => {
    const response = await updateSession(makeRequest(`/directory/${TEST_COMPANY_ID}`));

    const url = expectRedirect(response, `/companies/${TEST_COMPANY_ID}`);
    expect(url.searchParams.get("redirectTo")).toBeNull();
  });

  it("redirects /directory (no uuid) to /auth like any protected path", async () => {
    const response = await updateSession(makeRequest("/directory"));

    const url = expectRedirect(response, "/auth");
    expect(url.searchParams.get("redirectTo")).toBe("/directory");
  });

  it("treats a session cookie with getSession → null as anonymous", async () => {
    getSessionMock.mockResolvedValue(null);

    const response = await updateSession(authedRequest("/dashboard"));

    const url = expectRedirect(response, "/auth");
    expect(url.searchParams.get("redirectTo")).toBe("/dashboard");
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("treats a session cookie with getSession throwing as anonymous", async () => {
    getSessionMock.mockRejectedValue(new Error("session expired"));

    const response = await updateSession(authedRequest("/dashboard"));

    expectRedirect(response, "/auth");
  });

  it("accepts the __Secure- prefixed session cookie variant", async () => {
    const response = await updateSession(
      makeRequest("/dashboard", {
        cookies: { "__Secure-better-auth.session_token": "test-token" },
      }),
    );

    // Session resolves → approved profile → pass through
    expectPassThrough(response);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateSession — authenticated, onboarding gate", () => {
  it("redirects to /onboarding when onboarding is incomplete on a non-allowed path", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ onboardingCompletedAt: null }) as never,
    );

    const response = await updateSession(authedRequest("/dashboard"));

    const url = expectRedirect(response, "/onboarding");
    expect(url.searchParams.get("redirectTo")).toBeNull();
    expect(getProfileMock).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it.each(["/onboarding", "/tenders", "/directory"])(
    "allows %s while onboarding is incomplete",
    async (path) => {
      getProfileMock.mockResolvedValue(
        mockProfile({ onboardingCompletedAt: null }) as never,
      );

      const response = await updateSession(authedRequest(path));

      expectPassThrough(response);
    },
  );
});

describe("updateSession — authenticated, approval gate", () => {
  it("redirects pending users on approval-required paths to /pending-approval", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ approvalStatus: "pending" }) as never,
    );

    const response = await updateSession(authedRequest("/dashboard"));

    expectRedirect(response, "/pending-approval");
  });

  it("allows pending users on protected paths that do not require approval", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ approvalStatus: "pending" }) as never,
    );

    const response = await updateSession(authedRequest("/tenders"));

    expectPassThrough(response);
  });

  it("redirects rejected users to /auth?rejected=true", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ approvalStatus: "rejected" }) as never,
    );

    const response = await updateSession(authedRequest("/dashboard"));

    const url = expectRedirect(response, "/auth");
    expect(url.searchParams.get("rejected")).toBe("true");
  });

  it("lets approved users through on protected paths", async () => {
    const response = await updateSession(authedRequest("/dashboard"));

    expectPassThrough(response);
  });

  it("passes through when no profile row exists", async () => {
    getProfileMock.mockResolvedValue(undefined as never);

    const response = await updateSession(authedRequest("/dashboard"));

    expectPassThrough(response);
  });

  it("fails open (pass through) when the profile lookup throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getProfileMock.mockRejectedValue(new Error("db down"));

    const response = await updateSession(authedRequest("/dashboard"));

    expectPassThrough(response);
    expect(errorSpy).toHaveBeenCalledWith(
      "Middleware: Error checking status:",
      expect.any(Error),
    );
  });
});

describe("updateSession — approved user on /onboarding", () => {
  it("redirects to a validated redirectTo target, preserving its query string", async () => {
    const response = await updateSession(
      authedRequest("/onboarding", { redirectTo: "/tenders?tab=matched" }),
    );

    const url = expectRedirect(response, "/tenders");
    expect(url.searchParams.get("tab")).toBe("matched");
    expect(url.searchParams.get("redirectTo")).toBeNull();
  });

  it("falls back to /dashboard without a redirectTo", async () => {
    const response = await updateSession(authedRequest("/onboarding"));

    const url = expectRedirect(response, "/dashboard");
    expect(url.searchParams.get("redirectTo")).toBeNull();
  });

  it.each(["//evil.com", "/auth", "https://evil.com"])(
    "ignores unsafe redirectTo %s and goes to /dashboard",
    async (redirectTo) => {
      const response = await updateSession(
        authedRequest("/onboarding", { redirectTo }),
      );

      expectRedirect(response, "/dashboard");
    },
  );
});

describe("updateSession — authenticated user hitting /auth", () => {
  it("sends users with incomplete onboarding to /onboarding, carrying a valid redirectTo", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ onboardingCompletedAt: null }) as never,
    );

    const response = await updateSession(
      authedRequest("/auth", { redirectTo: "/tenders" }),
    );

    const url = expectRedirect(response, "/onboarding");
    expect(url.searchParams.get("redirectTo")).toBe("/tenders");
  });

  it("sends users with incomplete onboarding to /onboarding, dropping an invalid redirectTo", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ onboardingCompletedAt: null }) as never,
    );

    const response = await updateSession(
      authedRequest("/auth", { redirectTo: "//evil.com" }),
    );

    const url = expectRedirect(response, "/onboarding");
    expect(url.searchParams.get("redirectTo")).toBeNull();
  });

  it("sends pending users to /pending-approval", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ approvalStatus: "pending" }) as never,
    );

    const response = await updateSession(authedRequest("/auth"));

    expectRedirect(response, "/pending-approval");
  });

  it("lets rejected users stay on /auth (pass through)", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ approvalStatus: "rejected" }) as never,
    );

    const response = await updateSession(authedRequest("/auth"));

    expectPassThrough(response);
  });

  it("follows a valid redirectTo for approved users", async () => {
    const response = await updateSession(
      authedRequest("/auth", { redirectTo: "/tenders?tab=all" }),
    );

    const url = expectRedirect(response, "/tenders");
    expect(url.searchParams.get("tab")).toBe("all");
  });

  it("routes approved regular users to /dashboard", async () => {
    const response = await updateSession(authedRequest("/auth"));

    expectRedirect(response, "/dashboard");
    expect(getRoleMock).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it("routes superadmins to /admin", async () => {
    getRoleMock.mockResolvedValue({ role: "superadmin" } as never);

    const response = await updateSession(authedRequest("/auth"));

    expectRedirect(response, "/admin");
  });

  it("falls back to /dashboard when the role lookup throws", async () => {
    getRoleMock.mockRejectedValue(new Error("db down"));

    const response = await updateSession(authedRequest("/auth"));

    expectRedirect(response, "/dashboard");
  });

  it("still redirects to a role-based page when the profile lookup throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getProfileMock.mockRejectedValue(new Error("db down"));

    const response = await updateSession(authedRequest("/auth"));

    expectRedirect(response, "/dashboard");
    expect(errorSpy).toHaveBeenCalledWith(
      "Middleware: Error checking profile for auth redirect:",
      expect.any(Error),
    );
  });
});

describe("updateSession — /pending-approval bounce", () => {
  it("bounces approved regular users to /dashboard", async () => {
    const response = await updateSession(authedRequest("/pending-approval"));

    expectRedirect(response, "/dashboard");
  });

  it("bounces approved superadmins to /admin", async () => {
    getRoleMock.mockResolvedValue({ role: "superadmin" } as never);

    const response = await updateSession(authedRequest("/pending-approval"));

    expectRedirect(response, "/admin");
  });

  it("bounces approved users to a valid redirectTo instead of /dashboard", async () => {
    const response = await updateSession(
      authedRequest("/pending-approval", { redirectTo: "/tenders?tab=saved" }),
    );

    const url = expectRedirect(response, "/tenders");
    expect(url.searchParams.get("tab")).toBe("saved");
  });

  it("lets pending users stay on /pending-approval", async () => {
    getProfileMock.mockResolvedValue(
      mockProfile({ approvalStatus: "pending" }) as never,
    );

    const response = await updateSession(authedRequest("/pending-approval"));

    expectPassThrough(response);
  });
});
