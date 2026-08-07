import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DELETE, POST } from "@/app/api/admin/impersonate/route";
import { requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logApiEvent } from "@/lib/services/eventLogger";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      impersonateUser: vi.fn(),
      stopImpersonating: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(),
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedGetSession = auth.api.getSession as unknown as Mock;
const mockedImpersonate = auth.api.impersonateUser as unknown as Mock;
const mockedStopImpersonating = auth.api.stopImpersonating as unknown as Mock;
const mockedLogApiEvent = logApiEvent as unknown as Mock;

const TARGET_USER_ID = "00000000-0000-4000-8000-0000000000c1";

/**
 * What Better Auth actually emits on a session swap: the current session is
 * cleared first, then the admin cookie and the new session token are written.
 */
const SESSION_DELETION =
  "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
const ADMIN_COOKIE =
  "better-auth.admin_session=admin-token; Path=/; HttpOnly; SameSite=Lax";
const NEW_SESSION =
  "better-auth.session_token=new-impersonated-token; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax";

function authHeaders(...cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

function post(userId: string = TARGET_USER_ID) {
  return POST(
    makeRequest("/api/admin/impersonate", { method: "POST", json: { userId } }),
  );
}

function del() {
  return DELETE(makeRequest("/api/admin/impersonate", { method: "DELETE" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedCheckSuperadminRole.mockResolvedValue(true);
  // The target is not a superadmin.
  queueSelects(mockedSelect, []);
  mockedImpersonate.mockResolvedValue({
    headers: authHeaders(SESSION_DELETION, ADMIN_COOKIE, NEW_SESSION),
  });
});

describe("POST /api/admin/impersonate", () => {
  it("forwards each Set-Cookie separately so the new session survives", async () => {
    // Collapsing them into one comma-joined header made the browser read only
    // the leading deletion — the admin was logged out instead of impersonating.
    const response = await post();

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      SESSION_DELETION,
      ADMIN_COOKIE,
      NEW_SESSION,
    ]);
  });

  it("leaves the session token set to the impersonated value", async () => {
    const response = await post();

    const sessionCookies = response.headers
      .getSetCookie()
      .filter((cookie) => cookie.startsWith("better-auth.session_token="));
    expect(sessionCookies.at(-1)).toBe(NEW_SESSION);
  });

  it("audits the swap as the admin before it happens", async () => {
    await post();

    expect(mockedLogApiEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "admin_impersonation_started",
        userId: TEST_USER_ID,
        entityId: TARGET_USER_ID,
      }),
    );
    expect(mockedLogApiEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockedImpersonate.mock.invocationCallOrder[0],
    );
  });

  it("rejects a caller who is not a superadmin", async () => {
    mockedCheckSuperadminRole.mockResolvedValue(false);

    const { status } = await readJson(await post());

    expect(status).toBe(403);
    expect(mockedImpersonate).not.toHaveBeenCalled();
  });

  it("rejects self-impersonation", async () => {
    const { status } = await readJson(await post(TEST_USER_ID));

    expect(status).toBe(400);
    expect(mockedImpersonate).not.toHaveBeenCalled();
  });

  it("rejects impersonating another superadmin", async () => {
    // `user_roles` is this app's source of truth, independent of `user.role`.
    queueSelects(mockedSelect, [{ role: "superadmin" }]);

    const { status } = await readJson(await post());

    expect(status).toBe(403);
    expect(mockedImpersonate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/impersonate", () => {
  const RESTORED_SESSION =
    "better-auth.session_token=admin-token; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax";

  beforeEach(() => {
    mockedGetSession.mockResolvedValue({
      user: { id: TARGET_USER_ID, email: "target@example.com" },
      session: { id: "session-2", impersonatedBy: TEST_USER_ID },
    });
    mockedStopImpersonating.mockResolvedValue({
      headers: authHeaders(SESSION_DELETION, RESTORED_SESSION),
    });
  });

  it("forwards each Set-Cookie separately so the admin session is restored", async () => {
    const response = await del();

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      SESSION_DELETION,
      RESTORED_SESSION,
    ]);
  });

  it("audits the stop against the admin, not the impersonated user", async () => {
    await del();

    expect(mockedLogApiEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "admin_impersonation_stopped",
        userId: TEST_USER_ID,
        entityId: TARGET_USER_ID,
      }),
    );
  });

  it("rejects an unauthenticated caller", async () => {
    mockedGetSession.mockResolvedValue(null);

    const { status } = await readJson(await del());

    expect(status).toBe(401);
    expect(mockedStopImpersonating).not.toHaveBeenCalled();
  });

  it("rejects a session that is not impersonating", async () => {
    // Better Auth would otherwise fail with a 500 on the missing admin cookie.
    mockedGetSession.mockResolvedValue({
      user: mockUser(),
      session: { id: "session-1" },
    });

    const { status } = await readJson(await del());

    expect(status).toBe(400);
    expect(mockedStopImpersonating).not.toHaveBeenCalled();
  });
});
