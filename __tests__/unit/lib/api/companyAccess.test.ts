import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { update: vi.fn(), select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/lib/services/eventLogger", () => ({ logEvent: vi.fn() }));

import { checkSuperadminRole } from "@/lib/api";
import { isCompanyMember, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  getCompanyAccess,
  requireCompanyAccess,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { isEmailSuppressed } from "@/lib/email/suppression";
import { logEvent } from "@/lib/services/eventLogger";
import { TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

const memberMock = vi.mocked(isCompanyMember);
const superadminMock = vi.mocked(checkSuperadminRole);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCompanyAccess", () => {
  it("grants member access without consulting the superadmin role", async () => {
    memberMock.mockResolvedValue(true);

    const access = await getCompanyAccess(TEST_USER_ID, TEST_COMPANY_ID);

    expect(access).toEqual({
      isMember: true,
      adminOverride: false,
      hasAccess: true,
    });
    // Short-circuit: the common path must not pay for an extra role lookup.
    expect(superadminMock).not.toHaveBeenCalled();
  });

  it("falls back to the superadmin role for a non-member", async () => {
    memberMock.mockResolvedValue(false);
    superadminMock.mockResolvedValue(true);

    const access = await getCompanyAccess(TEST_USER_ID, TEST_COMPANY_ID);

    expect(access).toEqual({
      isMember: false,
      adminOverride: true,
      hasAccess: true,
    });
  });

  it("denies a non-member who is not a superadmin", async () => {
    memberMock.mockResolvedValue(false);
    superadminMock.mockResolvedValue(false);

    const access = await getCompanyAccess(TEST_USER_ID, TEST_COMPANY_ID);

    expect(access.hasAccess).toBe(false);
    expect(access.adminOverride).toBe(false);
  });

  it("treats a superadmin who is a member as an ordinary member", async () => {
    // Acting on their own company, so the normal review rules must apply.
    memberMock.mockResolvedValue(true);
    superadminMock.mockResolvedValue(true);

    const access = await getCompanyAccess(TEST_USER_ID, TEST_COMPANY_ID);

    expect(access.adminOverride).toBe(false);
  });
});

describe("requireCompanyAccess", () => {
  it("throws AuthError when access is denied", async () => {
    memberMock.mockResolvedValue(false);
    superadminMock.mockResolvedValue(false);

    await expect(
      requireCompanyAccess(TEST_USER_ID, TEST_COMPANY_ID),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("does not itself enable suppression", async () => {
    // AsyncLocalStorage.enterWith cannot propagate out of an awaited helper, so
    // suppressing here would silently fail open. Routes opt in themselves.
    memberMock.mockResolvedValue(false);
    superadminMock.mockResolvedValue(true);

    await (async () => {
      const access = await requireCompanyAccess(TEST_USER_ID, TEST_COMPANY_ID);
      expect(access.adminOverride).toBe(true);
      expect(isEmailSuppressed()).toBe(false);
    })();
  });
});

describe("suppressEmailForAdminOverride", () => {
  it("suppresses the rest of the caller's frame on admin override", async () => {
    await (async () => {
      expect(isEmailSuppressed()).toBe(false);
      suppressEmailForAdminOverride(
        { isMember: false, adminOverride: true, hasAccess: true },
        TEST_USER_ID,
      );
      expect(isEmailSuppressed()).toBe(true);

      // Still suppressed after further awaits, as a route handler would do.
      await Promise.resolve();
      expect(isEmailSuppressed()).toBe(true);
    })();
  });

  it("is a no-op for an ordinary member", async () => {
    await (async () => {
      suppressEmailForAdminOverride(
        { isMember: true, adminOverride: false, hasAccess: true },
        TEST_USER_ID,
      );
      expect(isEmailSuppressed()).toBe(false);
    })();
  });
});

describe("markCompanyAdminPrepared", () => {
  /** Prior state of the company row the marker is being stamped onto. */
  function mockPriorState(preparedAt: Date | null) {
    vi.mocked(db.select).mockImplementation(
      () => makeChain(() => [{ preparedAt }]) as never,
    );
  }

  it("stamps the preparing admin and timestamp on the company", async () => {
    mockPriorState(null);
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);

    await markCompanyAdminPrepared(TEST_COMPANY_ID, TEST_USER_ID);

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        adminPreparedAt: expect.any(Date),
        adminPreparedBy: TEST_USER_ID,
      }),
    );
    expect(where).toHaveBeenCalled();
  });

  it("audits the first on-behalf edit, so it is attributable to the admin", async () => {
    mockPriorState(null);
    const where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({ set: () => ({ where }) } as never);

    await markCompanyAdminPrepared(TEST_COMPANY_ID, TEST_USER_ID);

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "admin_company_prepared",
        userId: TEST_USER_ID,
        entityId: TEST_COMPANY_ID,
      }),
    );
  });

  it("does not re-log once the company is already marked", async () => {
    mockPriorState(new Date());
    const where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({ set: () => ({ where }) } as never);

    await markCompanyAdminPrepared(TEST_COMPANY_ID, TEST_USER_ID);

    expect(where).toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("never throws — a marker failure must not break the admin's save", async () => {
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error("db down");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      markCompanyAdminPrepared(TEST_COMPANY_ID, TEST_USER_ID),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
