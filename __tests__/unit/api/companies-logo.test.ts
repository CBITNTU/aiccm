import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST, DELETE } from "@/app/api/companies/[companyId]/logo/route";
import { checkSuperadminRole } from "@/lib/api";
import { requireAuth } from "@/lib/api/validation";
import { getCompanyMemberRole } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { getBlobStore, companyLogoKey } from "@/lib/storage";
import { markCompanyAdminPrepared } from "@/lib/api/companyAccess";
import { readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";
import { NextRequest } from "next/server";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

// Partial mock: handleApiError and ValidationError must stay real so the tests
// exercise the actual status mapping.
vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/api/companyAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/companyAccess")>()),
  markCompanyAdminPrepared: vi.fn(async () => {}),
}));

vi.mock("@/lib/db/queries", () => ({
  getCompanyMemberRole: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

// Never touch the network. This is exactly what the storage adapter is for.
const put = vi.fn(async (key: string) => ({
  url: `https://store.public.blob.vercel-storage.com/${key}`,
  key,
}));
const del = vi.fn(async () => {});
vi.mock("@/lib/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...original,
    getBlobStore: vi.fn(),
  };
});

const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const user = mockUser();

let storeConfigured = true;

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    verificationStatus: "unverified",
    pendingChanges: null,
    logoUrl: null,
    ...overrides,
  };
}

/** Minimal valid PNG: signature + IHDR with the given dimensions. */
function pngBytes(width = 256, height = 256): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/**
 * makeRequest is JSON-only, so build the multipart request directly. Using a
 * real File/FormData means request.formData() in the handler runs for real.
 */
function makeMultipartRequest(
  bytes: Uint8Array,
  { name = "logo.png", type = "image/png" } = {},
): NextRequest {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], name, { type }));
  return new NextRequest(
    new Request(`http://localhost/api/companies/${TEST_COMPANY_ID}/logo`, {
      method: "POST",
      body: form,
    }),
  );
}

function emptyMultipartRequest(): NextRequest {
  return new NextRequest(
    new Request(`http://localhost/api/companies/${TEST_COMPANY_ID}/logo`, {
      method: "POST",
      body: new FormData(),
    }),
  );
}

function post(request: NextRequest) {
  return POST(request, routeParams({ companyId: TEST_COMPANY_ID }));
}

function del_() {
  const request = new NextRequest(
    new Request(`http://localhost/api/companies/${TEST_COMPANY_ID}/logo`, {
      method: "DELETE",
    }),
  );
  return DELETE(request, routeParams({ companyId: TEST_COMPANY_ID }));
}

beforeEach(() => {
  vi.clearAllMocks();
  storeConfigured = true;
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(checkSuperadminRole).mockResolvedValue(false);
  vi.mocked(getCompanyMemberRole).mockResolvedValue("admin" as never);
  vi.mocked(getBlobStore).mockImplementation(() => ({
    get isConfigured() {
      return storeConfigured;
    },
    put,
    delete: del,
    keyFromUrl: (url: string) => url.split("/").slice(3).join("/"),
  }));
  mockedUpdate.mockImplementation(() => makeChain(() => undefined));
});

describe("POST /api/companies/[companyId]/logo", () => {
  it("rejects a caller with no relationship to the company", async () => {
    vi.mocked(getCompanyMemberRole).mockResolvedValue(null as never);

    const { status, body } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a plain member — only company admins may change the logo", async () => {
    vi.mocked(getCompanyMemberRole).mockResolvedValue("member" as never);

    const { status, body } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(401);
    expect(body.error).toBe("Only company admins can update company details");
    expect(put).not.toHaveBeenCalled();
  });

  it("returns 503 when object storage is unconfigured", async () => {
    storeConfigured = false;

    const { status, body } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(503);
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 400 when no file is attached", async () => {
    const { status, body } = await readJson(await post(emptyMultipartRequest()));

    expect(status).toBe(400);
    expect(body.error).toBe("No file provided");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a file over 2 MB without reading or storing it", async () => {
    const tooBig = new Uint8Array(2 * 1024 * 1024 + 1);
    tooBig.set(pngBytes(), 0);

    const { status, body } = await readJson(await post(makeMultipartRequest(tooBig)));

    expect(status).toBe(400);
    expect(body.error).toMatch(/2 MB or smaller/);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects SVG bytes dressed up as image/png — the sniff, not the header, decides", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

    const { status, body } = await readJson(
      await post(makeMultipartRequest(svg, { name: "logo.png", type: "image/png" })),
    );

    expect(status).toBe(400);
    expect(body.error).toMatch(/PNG, JPEG or WebP/);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects an image below the 32px floor", async () => {
    const { status, body } = await readJson(
      await post(makeMultipartRequest(pngBytes(16, 16))),
    );

    expect(status).toBe(400);
    expect(body.error).toMatch(/at least 32x32/);
    expect(put).not.toHaveBeenCalled();
  });

  it("stores the logo and records it as an upload", async () => {
    queueSelects(mockedSelect, [companyRow()]);

    const { status, body } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(200);
    expect(body.pending).toBe(false);
    expect(body.logoUrl).toMatch(/company-logos\//);
    expect(put).toHaveBeenCalledTimes(1);

    const [key, , contentType] = put.mock.calls[0] as unknown as [string, unknown, string];
    expect(key).toMatch(new RegExp(`^company-logos/${TEST_COMPANY_ID}/[0-9a-f]{16}\\.png$`));
    expect(contentType).toBe("image/png");

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const setArg = mockedUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg).toMatchObject({ logoSource: "upload", logoUrl: body.logoUrl });
  });

  it("deletes the object the new logo replaces", async () => {
    queueSelects(mockedSelect, [
      companyRow({ logoUrl: "https://store.public.blob.vercel-storage.com/old.png" }),
    ]);

    await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("https://store.public.blob.vercel-storage.com/old.png");
  });

  it("does not delete when re-uploading identical bytes", async () => {
    // Keys are content-hashed, so identical bytes resolve to the same key and
    // the "previous" object IS the one just written. Deleting it would leave a
    // dangling URL in the column.
    const bytes = pngBytes();
    const key = companyLogoKey(TEST_COMPANY_ID, bytes, "png");
    queueSelects(mockedSelect, [
      companyRow({ logoUrl: `https://store.public.blob.vercel-storage.com/${key}` }),
    ]);

    await readJson(await post(makeMultipartRequest(bytes)));

    expect(put).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
  });

  it("records a superadmin acting on the owner's behalf as an admin change", async () => {
    vi.mocked(getCompanyMemberRole).mockResolvedValue(null as never);
    vi.mocked(checkSuperadminRole).mockResolvedValue(true);
    queueSelects(mockedSelect, [companyRow()]);

    const { status } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(200);
    const setArg = mockedUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg).toMatchObject({ logoSource: "admin" });
    expect(markCompanyAdminPrepared).toHaveBeenCalledWith(TEST_COMPANY_ID, TEST_USER_ID);
  });

  it("stages the change on a verified company instead of applying it", async () => {
    // company lookup, then the open-review check
    queueSelects(
      mockedSelect,
      [companyRow({ verificationStatus: "verified", logoUrl: "https://store.public.blob.vercel-storage.com/live.png" })],
      [],
    );

    const { status, body } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(200);
    expect(body.pending).toBe(true);
    // Staged under pending/, so the live object is untouched.
    expect(put.mock.calls[0][0]).toContain("/pending/");

    const setArg = mockedUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.logoUrl).toBeUndefined();
    expect(setArg.pendingChanges.scalarFields.logoUrl).toEqual({
      current: "https://store.public.blob.vercel-storage.com/live.png",
      proposed: body.logoUrl,
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses to stage while a change review is already open", async () => {
    queueSelects(
      mockedSelect,
      [companyRow({ verificationStatus: "verified" })],
      [{ id: "req-1" }],
    );

    const { status, body } = await readJson(await post(makeMultipartRequest(pngBytes())));

    expect(status).toBe(400);
    expect(body.error).toMatch(/change review is pending/);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/companies/[companyId]/logo", () => {
  it("clears every logo column and removes the object", async () => {
    queueSelects(mockedSelect, [
      companyRow({ logoUrl: "https://store.public.blob.vercel-storage.com/live.png" }),
    ]);

    const { status, body } = await readJson(await del_());

    expect(status).toBe(200);
    expect(body.logoUrl).toBeNull();

    const setArg = mockedUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg).toMatchObject({
      logoUrl: null,
      logoSource: null,
      logoUpdatedAt: null,
      // Cleared so a later discovery run may try again.
      logoDiscoveryAttemptedAt: null,
    });
    expect(del).toHaveBeenCalledWith("https://store.public.blob.vercel-storage.com/live.png");
  });

  it("rejects a plain member", async () => {
    vi.mocked(getCompanyMemberRole).mockResolvedValue("member" as never);

    const { status } = await readJson(await del_());

    expect(status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });
});
