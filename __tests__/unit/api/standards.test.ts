import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/standards/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;

const MARKET_ID = "00000000-0000-4000-8000-0000000000b1";

// s2 is a child of s1, so it inherits s1's relevance; s3 matches nothing.
const STANDARDS = [
  { id: "s1", name: "Construction", parentId: null, sortOrder: 1 },
  { id: "s2", name: "ISO 9001", parentId: "s1", sortOrder: 2 },
  { id: "s3", name: "Healthcare", parentId: null, sortOrder: 3 },
];

const CONSTRUCTION_MARKET = {
  id: MARKET_ID,
  name: "Construction",
  parentId: null,
};

/**
 * The four sequential selects the companyId path makes: the company's market
 * links, those markets, the markets plus their parents, then the catalogue.
 */
function queueMarketAwareSelects() {
  return queueSelects(
    mockedSelect,
    [{ marketId: MARKET_ID }],
    [CONSTRUCTION_MARKET],
    [CONSTRUCTION_MARKET],
    STANDARDS,
  );
}

function get(searchParams?: Record<string, string>) {
  return GET(makeRequest("/api/standards", { searchParams }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
  mockedCheckSuperadminRole.mockResolvedValue(false);
});

describe("GET /api/standards", () => {
  it("returns 401 for a non-member who is not a superadmin", async () => {
    // Regression: this used to return 200 with `{ standards: [] }`, so the
    // caller saw an empty catalogue instead of an authorization failure.
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("lets a superadmin non-member read the catalogue with relevance flags", async () => {
    // The pre-approval console hit this: the standards tree in "Edit Standards
    // & Certifications" rendered "No standards available." for the admin.
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queueMarketAwareSelects();

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    expect(body.standards).toEqual([
      { ...STANDARDS[0], relevant: true },
      { ...STANDARDS[1], relevant: true },
      { ...STANDARDS[2], relevant: false },
    ]);
  });

  it("flags market-relevant standards for an ordinary member", async () => {
    queueMarketAwareSelects();

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    expect(body.standards).toEqual([
      { ...STANDARDS[0], relevant: true },
      { ...STANDARDS[1], relevant: true },
      { ...STANDARDS[2], relevant: false },
    ]);
    expect(mockedIsCompanyMember).toHaveBeenCalledWith(
      TEST_USER_ID,
      TEST_COMPANY_ID,
    );
  });

  it("returns the unflagged catalogue when the company has no markets", async () => {
    queueSelects(mockedSelect, [], STANDARDS);

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    expect(body.standards).toEqual(STANDARDS);
  });

  it("returns the unflagged catalogue without a companyId and skips the gate", async () => {
    queueSelects(mockedSelect, STANDARDS);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.standards).toEqual(STANDARDS);
    expect(mockedIsCompanyMember).not.toHaveBeenCalled();
  });
});
