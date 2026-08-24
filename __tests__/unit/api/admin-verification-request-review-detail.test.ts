import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/admin/verification-requests/[requestId]/review/route";
import { requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
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

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;

const REQUEST_ID = "00000000-0000-4000-8000-0000000000c1";
const LIVE_LOGO = "https://blob.example.com/company-logos/c/live.png";
const STAGED_LOGO = "https://blob.example.com/company-logos/c/pending/new.png";

/**
 * The route reads the request row, then six rows in parallel: company,
 * capabilities, markets, standards, previous requests, submitter.
 */
function queueReads({
  companySnapshot,
  liveCompany,
  scalarFields,
}: {
  companySnapshot: Record<string, unknown>;
  liveCompany: Record<string, unknown>;
  scalarFields: Record<string, { current: string | null; proposed: string | null }>;
}) {
  queueSelects(
    mockedSelect,
    [
      {
        id: REQUEST_ID,
        companyId: TEST_COMPANY_ID,
        submittedBy: "submitter-1",
        status: "pending",
        requestType: "change_review",
        companySnapshot,
        pendingChangesSnapshot: { scalarFields, lastSavedAt: "2026-08-01T00:00:00.000Z" },
      },
    ],
    [{ id: TEST_COMPANY_ID, companyName: "Test Construction Ltd", ...liveCompany }],
    [],
    [],
    [],
    [],
    [null],
  );
}

async function get() {
  return readJson(
    await GET(
      makeRequest(`/api/admin/verification-requests/${REQUEST_ID}/review`),
      routeParams({ requestId: REQUEST_ID }),
    ),
  );
}

type ScalarDiff = { current: string | null; proposed: string | null };

function scalars(body: unknown): Record<string, ScalarDiff> {
  return (body as { resolvedPendingChanges: { scalarFields: Record<string, ScalarDiff> } })
    .resolvedPendingChanges.scalarFields;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedCheckSuperadminRole.mockResolvedValue(true);
});

describe("GET /api/admin/verification-requests/[requestId]/review — scalar `current` resolution", () => {
  it("falls back to the live row for a field the snapshot never recorded", async () => {
    // logoUrl became reviewable after these snapshots started being written, so
    // requests already in the queue have no logoUrl key at all. Without the
    // fallback the admin diff renders the logo change as Empty → Empty and the
    // change is unreviewable.
    queueReads({
      companySnapshot: { companyName: "Test Construction Ltd", description: "Old" },
      liveCompany: { logoUrl: LIVE_LOGO, description: "Old" },
      scalarFields: { logoUrl: { current: null, proposed: STAGED_LOGO } },
    });

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(scalars(body).logoUrl).toEqual({ current: LIVE_LOGO, proposed: STAGED_LOGO });
  });

  it("keeps a null the snapshot recorded deliberately", async () => {
    // A company that genuinely had no logo when it submitted. The key is present
    // and null; the live row must not be allowed to backfill over it.
    queueReads({
      companySnapshot: { companyName: "Test Construction Ltd", logoUrl: null },
      liveCompany: { logoUrl: LIVE_LOGO },
      scalarFields: { logoUrl: { current: LIVE_LOGO, proposed: STAGED_LOGO } },
    });

    const { body } = await get();

    expect(scalars(body).logoUrl).toEqual({ current: null, proposed: STAGED_LOGO });
  });

  it("prefers the snapshot over the live row for fields it did record", async () => {
    // The snapshot is the approved state at submission time; the live row may
    // have moved on for non-reviewable reasons.
    queueReads({
      companySnapshot: { companyName: "Test Construction Ltd", description: "As submitted" },
      liveCompany: { description: "Drifted", logoUrl: LIVE_LOGO },
      scalarFields: { description: { current: null, proposed: "We build bridges" } },
    });

    const { body } = await get();

    expect(scalars(body).description.current).toBe("As submitted");
  });
});
