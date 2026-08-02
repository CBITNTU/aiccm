import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/tenders/[tenderId]/route";
import { AuthError, requireAuth } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const TENDER_ID = "00000000-0000-4000-8000-0000000000a1";

function get() {
  return GET(
    makeRequest(`/api/tenders/${TENDER_ID}`),
    routeParams({ tenderId: TENDER_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: mockUser() } as never);
});

describe("GET /api/tenders/[tenderId]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));

    const { status } = await readJson(await get());

    expect(status).toBe(401);
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown tender", async () => {
    queueSelects(mockedSelect, []);

    const { status, body } = await readJson(await get());

    expect(status).toBe(404);
    expect(body.error).toBe("Tender not found");
    // The taxonomy join is never issued for a missing tender.
    expect(mockedSelect).toHaveBeenCalledTimes(1);
  });

  it("returns the tender with its taxonomies", async () => {
    const tender = {
      id: TENDER_ID,
      title: "School refurbishment",
      buyer: "Leeds Council",
      status: "open",
    };
    queueSelects(
      mockedSelect,
      [tender],
      [
        { id: "tax-1", name: "Construction works" },
        { id: "tax-2", name: "Roofing" },
      ],
    );

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.tender).toMatchObject(tender);
    expect(body.taxonomies).toEqual([
      { id: "tax-1", name: "Construction works" },
      { id: "tax-2", name: "Roofing" },
    ]);
  });
});
