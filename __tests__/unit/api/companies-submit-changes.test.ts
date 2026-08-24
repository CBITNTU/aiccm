import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/companies/[companyId]/submit-changes/route";
import { requireAuth, isCompanyMember } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedInsert = db.insert as unknown as Mock;

const LIVE_LOGO = "https://blob.example.com/company-logos/c/live.png";
const STAGED_LOGO = "https://blob.example.com/company-logos/c/pending/new.png";

function company(overrides: Record<string, unknown> = {}) {
  return {
    verificationStatus: "verified",
    companyName: "Test Construction Ltd",
    description: "Old",
    contactEmail: "hello@example.com",
    contactPhone: "0123",
    postcode: "SW1",
    address: "1 Test St",
    websiteUrl: "https://example.com",
    companiesHouseNumber: "12345678",
    keyCapabilities: "Groundworks",
    certifications: null,
    equipment: null,
    pastProjects: null,
    logoUrl: LIVE_LOGO,
    pendingChanges: {
      scalarFields: { logoUrl: { current: LIVE_LOGO, proposed: STAGED_LOGO } },
      lastSavedAt: "2026-08-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

/** Captures the row handed to `db.insert(...).values(...)`. */
function captureInsert(): { row?: Record<string, unknown> } {
  const captured: { row?: Record<string, unknown> } = {};
  mockedInsert.mockImplementation(() => {
    const chain = makeChain(() => [{ id: "req-1" }]);
    chain.values.mockImplementation((row: Record<string, unknown>) => {
      captured.row = row;
      return chain;
    });
    return chain;
  });
  return captured;
}

async function post() {
  return readJson(
    await POST(
      makeRequest(`/api/companies/${TEST_COMPANY_ID}/submit-changes`, {
        method: "POST",
        json: {},
      }),
      routeParams({ companyId: TEST_COMPANY_ID }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
});

describe("POST /api/companies/[companyId]/submit-changes", () => {
  it("records logoUrl in the companySnapshot", async () => {
    // The admin diff re-derives every scalar's "current" side from this
    // snapshot. A missing key resolves to null, so omitting logoUrl renders the
    // logo change as Empty → Empty in the review sheet.
    const captured = captureInsert();
    queueSelects(mockedSelect, [company()], []);

    const { status } = await post();

    expect(status).toBe(200);
    expect(captured.row?.companySnapshot).toMatchObject({ logoUrl: LIVE_LOGO });
  });

  it("records a null logoUrl for a company that has no logo yet", async () => {
    // Distinct from a missing key: null is the approved state, and the review
    // sheet must show it as such rather than fall back to the live row.
    const captured = captureInsert();
    queueSelects(mockedSelect, [company({ logoUrl: null })], []);

    await post();

    expect(captured.row?.companySnapshot).toHaveProperty("logoUrl", null);
  });

  it("refuses to submit while a change review is already pending", async () => {
    captureInsert();
    queueSelects(mockedSelect, [company()], [{ id: "existing-req" }]);

    const { status } = await post();

    expect(status).toBe(400);
    expect(mockedInsert).not.toHaveBeenCalled();
  });
});
