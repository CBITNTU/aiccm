import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/companies/[companyId]/matching-usage/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { getMatchingRunsThisMonth } from "@/lib/matchingUsage";
import { getPlatformMatchingSettings } from "@/lib/platformMatchingSettings";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

vi.mock("@/lib/matchingUsage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/matchingUsage")>()),
  getMatchingRunsThisMonth: vi.fn(),
}));

vi.mock("@/lib/platformMatchingSettings", () => ({
  getPlatformMatchingSettings: vi.fn(),
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;

function get() {
  return GET(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/matching-usage`),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
  mockedCheckSuperadminRole.mockResolvedValue(false);
  vi.mocked(getMatchingRunsThisMonth).mockResolvedValue(3);
  vi.mocked(getPlatformMatchingSettings).mockResolvedValue({
    unverifiedMatchingLimit: 10,
    verifiedMatchingLimit: 10,
  } as never);
  mockedSelect.mockImplementation(() =>
    makeChain(() => [
      {
        verificationStatus: "unverified",
        matchingRunsLimit: 10,
        usageResetAt: null,
      },
    ]),
  );
});

describe("GET /api/companies/[companyId]/matching-usage", () => {
  it("returns 404 (not 401) for a non-member who is not a superadmin", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await get());

    expect(status).toBe(404);
    expect(body.error).toBe("Company not found or access denied");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("returns usage to a superadmin non-member preparing the account", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.used).toBe(3);
    expect(body.remaining).toBe(7);
  });

  it("returns usage to an ordinary member", async () => {
    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.used).toBe(3);
  });
});
