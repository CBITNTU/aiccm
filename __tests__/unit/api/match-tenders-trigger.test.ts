import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Partial mock: keep handleApiError (and the error classes) real so the route's
// catch block behaves as in production, but stub the auth/membership helpers.
vi.mock("@/lib/api/validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/validation")>();
  return {
    ...actual,
    requireAuth: vi.fn(),
    isCompanyMember: vi.fn(),
    getUserCompanyIds: vi.fn(),
  };
});

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/services/tenderMatchingService", () => ({
  batchScoreTendersForCompany: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(),
}));

// select().from().where() is chained with .limit(1) for the active-company check.
const dbMocks = vi.hoisted(() => ({
  where: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {
        where: (...args: unknown[]) => dbMocks.where(...args),
      };
      chain.from = vi.fn(() => chain);
      return chain;
    }),
  },
}));

import { POST } from "@/app/api/match-tenders/trigger/route";
import {
  requireAuth,
  isCompanyMember,
  getUserCompanyIds,
  AuthError,
} from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { batchScoreTendersForCompany } from "@/lib/services/tenderMatchingService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";

const requireAuthMock = vi.mocked(requireAuth);
const isCompanyMemberMock = vi.mocked(isCompanyMember);
const checkSuperadminRoleMock = vi.mocked(checkSuperadminRole);
const getUserCompanyIdsMock = vi.mocked(getUserCompanyIds);
const batchScoreMock = vi.mocked(batchScoreTendersForCompany);
const logApiEventMock = vi.mocked(logApiEvent);

const selectResults: unknown[][] = [];

function triggerRequest(json: unknown = {}) {
  return makeRequest("/api/match-tenders/trigger", { method: "POST", json });
}

const queuedResult = {
  jobCount: 2,
  batchId: "batch-1",
  matchingModel: "gpt-5-nano",
  skippedCount: 1,
  status: "queued" as const,
};

beforeEach(() => {
  selectResults.length = 0;
  dbMocks.where.mockReset();
  dbMocks.where.mockImplementation(() => {
    const result = selectResults.length > 0 ? selectResults.shift()! : [];
    const promise = Promise.resolve(result);
    return {
      limit: vi.fn(() => promise),
      then: promise.then.bind(promise),
    };
  });

  requireAuthMock.mockResolvedValue({ user: mockUser() } as never);
  isCompanyMemberMock.mockResolvedValue(true);
  checkSuperadminRoleMock.mockResolvedValue(false);
  getUserCompanyIdsMock.mockResolvedValue([TEST_COMPANY_ID]);
  batchScoreMock.mockResolvedValue(queuedResult);
  logApiEventMock.mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/match-tenders/trigger — auth and company resolution", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuthMock.mockRejectedValue(new AuthError("Unauthorized"));

    const { status, body } = await readJson(await POST(triggerRequest()));

    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(batchScoreMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the user is not a member of the requested company", async () => {
    isCompanyMemberMock.mockResolvedValue(false);

    const { status, body } = await readJson(
      await POST(triggerRequest({ companyId: TEST_COMPANY_ID, tenderIds: ["t1"] })),
    );

    expect(status).toBe(404);
    expect(body.error).toBe("Company not found or access denied");
    expect(isCompanyMemberMock).toHaveBeenCalledWith(TEST_USER_ID, TEST_COMPANY_ID);
    expect(batchScoreMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested company is not active", async () => {
    // Member, but the active-status lookup finds no row.
    selectResults.push([]);

    const { status, body } = await readJson(
      await POST(triggerRequest({ companyId: TEST_COMPANY_ID, tenderIds: ["t1"] })),
    );

    expect(status).toBe(404);
    expect(body.error).toBe("Company not found or not active");
    expect(batchScoreMock).not.toHaveBeenCalled();
  });

  it("returns 404 when no companyId is given and the user has no companies", async () => {
    getUserCompanyIdsMock.mockResolvedValue([]);

    const { status, body } = await readJson(
      await POST(triggerRequest({ tenderIds: ["t1"] })),
    );

    expect(status).toBe(404);
    expect(body.error).toBe("Company not found for user");
    expect(batchScoreMock).not.toHaveBeenCalled();
  });

  it("returns 400 when tenderIds is missing, empty, or not all strings", async () => {
    for (const json of [
      {},
      { tenderIds: [] },
      { tenderIds: "t1" },
      { tenderIds: ["t1", 2] },
    ]) {
      const { status, body } = await readJson(await POST(triggerRequest(json)));

      expect(status).toBe(400);
      expect(body.error).toBe("tenderIds must be a non-empty array of tender IDs");
    }
    expect(batchScoreMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/match-tenders/trigger — queueing", () => {
  it("queues matching for explicit tenderIds and logs a matching_triggered event", async () => {
    selectResults.push([{ id: TEST_COMPANY_ID }]); // active-company check

    const { status, body } = await readJson(
      await POST(
        triggerRequest({
          companyId: TEST_COMPANY_ID,
          tenderIds: ["t1", "t2"],
          force: true,
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: "queued",
      jobCount: 2,
      skippedCount: 1,
      companyId: TEST_COMPANY_ID,
      batchId: "batch-1",
      matchingModel: "gpt-5-nano",
    });
    expect(batchScoreMock).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
      ["t1", "t2"],
      TEST_USER_ID,
      { force: true },
    );
    expect(logApiEventMock).toHaveBeenCalledTimes(1);
    expect(logApiEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "matching_triggered",
        userId: TEST_USER_ID,
        userEmail: "test@example.com",
        entityType: "company",
        entityId: TEST_COMPANY_ID,
        details: {
          jobCount: 2,
          batchId: "batch-1",
          matchingModel: "gpt-5-nano",
          skippedCount: 1,
          tenderCount: 2,
          force: true,
        },
      }),
    );
  });

  it("resolves the user's first company when no companyId is given", async () => {
    const { status, body } = await readJson(
      await POST(triggerRequest({ tenderIds: ["t1", "t2", "t3"] })),
    );

    expect(status).toBe(200);
    expect(body.status).toBe("queued");
    expect(body.companyId).toBe(TEST_COMPANY_ID);
    expect(getUserCompanyIdsMock).toHaveBeenCalledWith(TEST_USER_ID);
    expect(isCompanyMemberMock).not.toHaveBeenCalled();
    expect(batchScoreMock).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
      ["t1", "t2", "t3"],
      TEST_USER_ID,
      { force: false },
    );
  });

  it("passes through all_cached results without logging an event", async () => {
    selectResults.push([{ id: TEST_COMPANY_ID }]);
    batchScoreMock.mockResolvedValue({
      jobCount: 0,
      batchId: null,
      matchingModel: "gpt-5-nano",
      skippedCount: 4,
      status: "all_cached",
    });

    const { status, body } = await readJson(
      await POST(triggerRequest({ companyId: TEST_COMPANY_ID, tenderIds: ["t1"] })),
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: "all_cached",
      jobCount: 0,
      skippedCount: 4,
      companyId: TEST_COMPANY_ID,
      batchId: null,
      matchingModel: "gpt-5-nano",
    });
    expect(logApiEventMock).not.toHaveBeenCalled();
  });
});
