import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  DELETE,
  GET,
} from "@/app/api/admin/companies/[companyId]/preparation/route";
import { requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser } from "@/__tests__/helpers/mocks";
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
  db: { select: vi.fn(), update: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;

const COMPANY_ID = "00000000-0000-4000-8000-0000000000a1";
const OWNER_ID = "00000000-0000-4000-8000-0000000000b1";

const company = (overrides: Record<string, unknown> = {}) => ({
  id: COMPANY_ID,
  companyName: "Acme Construction",
  userId: OWNER_ID,
  status: "active",
  verificationStatus: "verified",
  isSystemCompany: false,
  adminPreparedAt: null,
  adminPreparedBy: null,
  ...overrides,
});

const owner = {
  userId: OWNER_ID,
  email: "owner@example.com",
  firstName: "Jane",
  lastName: "Smith",
  approvalStatus: "approved",
};

function get() {
  return GET(
    makeRequest(`/api/admin/companies/${COMPANY_ID}/preparation`),
    routeParams({ companyId: COMPANY_ID }),
  );
}

function del() {
  return DELETE(
    makeRequest(`/api/admin/companies/${COMPANY_ID}/preparation`, {
      method: "DELETE",
    }),
    routeParams({ companyId: COMPANY_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedCheckSuperadminRole.mockResolvedValue(true);
});

describe("GET /api/admin/companies/[companyId]/preparation", () => {
  it("returns the company with its owner resolved", async () => {
    queueSelects(mockedSelect, [company()], [owner]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.company).toMatchObject({ id: COMPANY_ID });
    expect(body.owner).toMatchObject({
      userId: OWNER_ID,
      email: "owner@example.com",
    });
  });

  it("exposes the prepared marker so the console can offer to clear it", async () => {
    const preparedAt = "2026-01-02T03:04:05.000Z";
    queueSelects(
      mockedSelect,
      [company({ adminPreparedAt: preparedAt, adminPreparedBy: "admin-1" })],
      [owner],
    );

    const { body } = await readJson(await get());

    expect(body.adminPrepared).toEqual({ at: preparedAt, by: "admin-1" });
  });

  it("returns a null owner for a company nobody owns", async () => {
    // Imported and system companies have no `userId` — the profile lookup must
    // be skipped entirely rather than querying for null.
    queueSelects(mockedSelect, [company({ userId: null })]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.owner).toBeNull();
    expect(mockedSelect).toHaveBeenCalledTimes(1);
  });

  it("404s on an unknown company", async () => {
    queueSelects(mockedSelect, []);

    const { status } = await readJson(await get());

    expect(status).toBe(404);
  });

  it("rejects a caller who is not a superadmin", async () => {
    mockedCheckSuperadminRole.mockResolvedValue(false);
    queueSelects(mockedSelect, [company()]);

    const { status } = await readJson(await get());

    expect(status).toBe(403);
    expect(mockedSelect).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/companies/[companyId]/preparation", () => {
  it("clears the marker on this company only", async () => {
    // The approvals route clears every company the owner has; entered from a
    // specific company, only that one may be touched.
    const chains = queueSelects(mockedUpdate, [{ id: COMPANY_ID }]);

    const { status, body } = await readJson(await del());

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(chains[0].set).toHaveBeenCalledWith({
      adminPreparedAt: null,
      adminPreparedBy: null,
    });
    expect(chains[0].where).toHaveBeenCalledTimes(1);
  });

  it("404s when no row was updated", async () => {
    queueSelects(mockedUpdate, []);

    const { status } = await readJson(await del());

    expect(status).toBe(404);
  });

  it("rejects a caller who is not a superadmin", async () => {
    mockedCheckSuperadminRole.mockResolvedValue(false);
    queueSelects(mockedUpdate, [{ id: COMPANY_ID }]);

    const { status } = await readJson(await del());

    expect(status).toBe(403);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
