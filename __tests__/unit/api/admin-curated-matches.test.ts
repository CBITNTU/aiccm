import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, POST } from "@/app/api/admin/curated-matches/route";
import { POST as publish } from "@/app/api/admin/curated-matches/[id]/publish/route";
import { PATCH } from "@/app/api/admin/curated-matches/[id]/route";
import { requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { isEmailSuppressed } from "@/lib/email/suppression";
import { batchScoreTendersForCompany, scoreTenderMatch } from "@/lib/services/tenderMatchingService";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/services/tenderMatchingService", () => ({
  batchScoreTendersForCompany: vi.fn(),
  scoreTenderMatch: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({ logApiEvent: vi.fn() }));

const mockedSelect = db.select as unknown as Mock;
const mockedInsert = db.insert as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const mockedBatch = vi.mocked(batchScoreTendersForCompany);
const mockedScore = vi.mocked(scoreTenderMatch);

const CURATION_ID = "00000000-0000-4000-8000-0000000000c1";
const TENDER_ID = "00000000-0000-4000-8000-0000000000b1";
const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: mockUser() } as never);
  vi.mocked(checkSuperadminRole).mockResolvedValue(true);
  mockedBatch.mockResolvedValue({
    jobCount: 1,
    batchId: "b1",
    matchingModel: "m",
    skippedCount: 0,
    status: "queued",
  });
});

describe("admin curated-matches authorization", () => {
  it("refuses a non-superadmin on the list route", async () => {
    vi.mocked(checkSuperadminRole).mockResolvedValue(false);

    const { status } = await readJson(
      await GET(
        makeRequest("/api/admin/curated-matches", {
          searchParams: { companyId: TEST_COMPANY_ID },
        }),
      ),
    );

    expect(status).toBe(403);
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("refuses a non-superadmin on the create route", async () => {
    vi.mocked(checkSuperadminRole).mockResolvedValue(false);

    const { status } = await readJson(
      await POST(
        makeRequest("/api/admin/curated-matches", {
          method: "POST",
          json: { companyId: TEST_COMPANY_ID, tenderIds: [TENDER_ID] },
        }),
      ),
    );

    expect(status).toBe(403);
    expect(mockedInsert).not.toHaveBeenCalled();
  });

  it("refuses a non-superadmin on the publish route", async () => {
    vi.mocked(checkSuperadminRole).mockResolvedValue(false);

    const { status } = await readJson(
      await publish(
        makeRequest(`/api/admin/curated-matches/${CURATION_ID}/publish`, {
          method: "POST",
          json: {},
        }),
        routeParams({ id: CURATION_ID }),
      ),
    );

    expect(status).toBe(403);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/curated-matches", () => {
  function create(body: Record<string, unknown>) {
    return POST(
      makeRequest("/api/admin/curated-matches", { method: "POST", json: body }),
    );
  }

  it("creates a draft, defaults expiry to the deadline and queues research", async () => {
    queueSelects(
      mockedSelect,
      [{ id: TEST_COMPANY_ID }], // company lookup
      [{ id: TENDER_ID, deadline: FUTURE }], // tender lookup
      [], // no existing deep row
    );
    const insertChain = makeChain(() => [{ id: CURATION_ID }]);
    mockedInsert.mockImplementation(() => insertChain);

    const { status, body } = await readJson(
      await create({ companyId: TEST_COMPANY_ID, tenderIds: [TENDER_ID] }),
    );

    expect(status).toBe(200);
    expect(insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "draft",
        // Expiry is a default, not an opt-in: a pinned dead tender is how this
        // gets noticed.
        expiresAt: FUTURE,
        createdBy: TEST_USER_ID,
      }),
    ]);
    // Deep research runs first so the published card carries genuine reasoning.
    expect(mockedBatch).toHaveBeenCalledWith(TEST_COMPANY_ID, [TENDER_ID], TEST_USER_ID);
    expect(body.queuedDeepResearch).toBe(1);
  });

  it("skips research when the tender was already analysed", async () => {
    queueSelects(
      mockedSelect,
      [{ id: TEST_COMPANY_ID }],
      [{ id: TENDER_ID, deadline: FUTURE }],
      [{ tenderId: TENDER_ID }],
    );
    mockedInsert.mockImplementation(() => makeChain(() => [{ id: CURATION_ID }]));

    const { body } = await readJson(
      await create({ companyId: TEST_COMPANY_ID, tenderIds: [TENDER_ID] }),
    );

    expect(mockedBatch).not.toHaveBeenCalled();
    expect(body.queuedDeepResearch).toBe(0);
  });

  it("suppresses email for the whole request", async () => {
    let suppressedInside: boolean | null = null;
    queueSelects(
      mockedSelect,
      [{ id: TEST_COMPANY_ID }],
      [{ id: TENDER_ID, deadline: FUTURE }],
      [],
    );
    mockedInsert.mockImplementation(() => {
      // Asserted from inside the handler frame — AsyncLocalStorage.enterWith
      // does not survive out to the caller.
      suppressedInside = isEmailSuppressed();
      return makeChain(() => [{ id: CURATION_ID }]);
    });

    await create({ companyId: TEST_COMPANY_ID, tenderIds: [TENDER_ID] });

    expect(suppressedInside).toBe(true);
  });

  it("rejects a request with no tender", async () => {
    const { status } = await readJson(await create({ companyId: TEST_COMPANY_ID }));
    expect(status).toBe(400);
  });
});

describe("PATCH /api/admin/curated-matches/[id]", () => {
  function patch(body: Record<string, unknown>) {
    return PATCH(
      makeRequest(`/api/admin/curated-matches/${CURATION_ID}`, {
        method: "PATCH",
        json: body,
      }),
      routeParams({ id: CURATION_ID }),
    );
  }

  beforeEach(() => {
    queueSelects(mockedSelect, [
      {
        id: CURATION_ID,
        companyId: TEST_COMPANY_ID,
        tenderId: TENDER_ID,
        evidenceNote: null,
      },
    ]);
    mockedUpdate.mockImplementation(() =>
      makeChain(() => [{ id: CURATION_ID, curatedScore: 90, pinned: false }]),
    );
  });

  it("forces a re-run so the evidence actually reaches the model", async () => {
    mockedScore.mockResolvedValue({ overallScore: 76 } as never);

    const { status, body } = await readJson(
      await patch({ evidenceNote: "Holds an unlisted ISO 14001.", rerun: true }),
    );

    expect(status).toBe(200);
    // Without `force` the cached row short-circuits scoreTenderMatch and the
    // evidence is silently discarded.
    expect(mockedScore).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
      TENDER_ID,
      expect.objectContaining({
        force: true,
        evidenceNote: "Holds an unlisted ISO 14001.",
      }),
    );
    expect(body.rerunScore).toBe(76);
  });

  it("does not re-run when only fields changed", async () => {
    await patch({ internalNote: "sales-led onboarding" });
    expect(mockedScore).not.toHaveBeenCalled();
  });

  it("clamps a curated score into the visible range", async () => {
    const updateChain = makeChain(() => [{ id: CURATION_ID }]);
    mockedUpdate.mockImplementation(() => updateChain);

    await patch({ curatedScore: 0 });

    // 0 would be swallowed by the feed's own 0% floor and silently reclassify
    // the tender as ruled out.
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ curatedScore: 1 }),
    );
  });
});

describe("POST /api/admin/curated-matches/[id]/publish", () => {
  function doPublish(searchParams: Record<string, string> = {}) {
    return publish(
      makeRequest(`/api/admin/curated-matches/${CURATION_ID}/publish`, {
        method: "POST",
        json: {},
        searchParams,
      }),
      routeParams({ id: CURATION_ID }),
    );
  }

  function curationRow(overrides: Record<string, unknown> = {}) {
    return {
      curation: {
        id: CURATION_ID,
        companyId: TEST_COMPANY_ID,
        tenderId: TENDER_ID,
        curatedScore: 88,
        pinned: false,
        internalNote: null,
        ...overrides,
      },
      tenderDeadline: FUTURE,
      tenderStatus: "open",
      realScore: 60,
      realCapability: 70,
      realExperience: 55,
      realLocation: 50,
      realCertification: 65,
    };
  }

  it("freezes a breakdown that reproduces the shown score exactly", async () => {
    queueSelects(mockedSelect, [curationRow()], []);
    const updateChain = makeChain(() => [{ id: CURATION_ID }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status, body } = await readJson(await doPublish());

    expect(status).toBe(200);
    expect(body.published).toBe(true);
    // The console shows this back to the admin: it is the card's own arithmetic
    // replayed against the frozen sub-scores.
    expect(body.verifiedOverall).toBe(88);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        curatedCapabilityScore: expect.any(Number),
        curatedCertificationScore: expect.any(Number),
      }),
    );
  });

  it("blocks publishing a tender whose deadline has passed", async () => {
    queueSelects(
      mockedSelect,
      [{ ...curationRow(), tenderDeadline: PAST }],
      [],
    );

    const { status, body } = await readJson(await doPublish());

    expect(status).toBe(409);
    expect(body.published).toBe(false);
    expect(
      (body.issues as Array<{ code: string }>).map((i) => i.code),
    ).toContain("deadlinePassed");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("blocks a closed tender even with force", async () => {
    queueSelects(
      mockedSelect,
      [{ ...curationRow(), tenderStatus: "closed" }],
      [],
    );

    const { status } = await readJson(await doPublish({ force: "1" }));

    // Blocking issues are never overridable — force only acknowledges warnings.
    expect(status).toBe(409);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("holds a warning back until the admin acknowledges it", async () => {
    queueSelects(mockedSelect, [curationRow({ curatedScore: 99 })], []);

    const { status, body } = await readJson(await doPublish());

    expect(status).toBe(409);
    expect(body.needsAcknowledgement).toBe(true);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("publishes through a warning when forced", async () => {
    queueSelects(mockedSelect, [curationRow({ curatedScore: 99 })], []);
    mockedUpdate.mockImplementation(() => makeChain(() => [{ id: CURATION_ID }]));

    const { status, body } = await readJson(await doPublish({ force: "1" }));

    expect(status).toBe(200);
    expect(body.published).toBe(true);
  });

  it("leaves the model's own numbers alone for an evidence-only curation", async () => {
    queueSelects(mockedSelect, [curationRow({ curatedScore: null })], []);
    const updateChain = makeChain(() => [{ id: CURATION_ID }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status } = await readJson(await doPublish());

    expect(status).toBe(200);
    // Nothing to back-solve: the model already produced a coherent breakdown.
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ curatedCapabilityScore: null }),
    );
  });
});
