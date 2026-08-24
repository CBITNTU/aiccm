import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/services/companyEnrichmentService", () => ({
  safeFetch: vi.fn(),
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, getBlobStore: vi.fn() };
});

const { db } = await import("@/lib/db");
const { safeFetch } = await import("@/lib/services/companyEnrichmentService");
const { getBlobStore } = await import("@/lib/storage");
const { discoverCompanyLogo } = await import("@/lib/services/companyLogoService");

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";

/** Minimal PNG: signature + IHDR length/type + width/height. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function htmlResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => body,
  } as unknown as Response;
}

function bytesResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  } as unknown as Response;
}

function jsonResponse(value: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return bytesResponse(bytes);
}

/** Serve a fixed body per URL; anything unlisted 404s so a stray fetch is loud. */
function serve(routes: Record<string, Response>) {
  vi.mocked(safeFetch).mockImplementation(async (url: string) => {
    const match = routes[url];
    if (match) return match;
    return { ok: false, status: 404, headers: new Headers() } as unknown as Response;
  });
}

let put: ReturnType<typeof vi.fn>;
let updates: ReturnType<typeof makeChain>[];

beforeEach(() => {
  vi.clearAllMocks();

  put = vi.fn(async (key: string) => ({ url: `https://blob.test/${key}` }));
  vi.mocked(getBlobStore).mockReturnValue({
    isConfigured: true,
    put,
    delete: vi.fn(),
  } as unknown as ReturnType<typeof getBlobStore>);

  queueSelects(vi.mocked(db.select), [
    { websiteUrl: "https://acme.test/", logoUrl: null, logoSource: null },
  ]);

  updates = [];
  vi.mocked(db.update).mockImplementation(() => {
    const chain = makeChain(() => undefined);
    updates.push(chain);
    return chain as never;
  });
});

/** The `set()` payload of the update that wrote a logo, if there was one. */
function storedUpdate() {
  return updates
    .map((chain) => chain.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined)
    .find((payload) => payload && "logoUrl" in payload);
}

describe("discoverCompanyLogo — social cards", () => {
  it("refuses a hero-shaped og:image and reports no_valid_image", async () => {
    serve({
      "https://acme.test/": htmlResponse(
        '<head><meta property="og:image" content="https://acme.test/card.png"></head>',
      ),
      "https://acme.test/card.png": bytesResponse(pngHeader(1609, 847)),
    });

    const result = await discoverCompanyLogo(COMPANY_ID);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_valid_image");
    expect(result.errors).toContainEqual(
      expect.stringContaining("1609x847 is not logo-shaped"),
    );
    expect(put).not.toHaveBeenCalled();
    // The attempt is still stamped, so bulk regeneration does not re-crawl it.
    expect(updates.at(-1)?.set).toHaveBeenCalledWith(
      expect.objectContaining({ logoDiscoveryAttemptedAt: expect.any(Date) }),
    );
  });

  it("keeps an og:image that is actually the logo file", async () => {
    serve({
      "https://acme.test/": htmlResponse(
        '<head><meta property="og:image" content="https://acme.test/logo.png"></head>',
      ),
      "https://acme.test/logo.png": bytesResponse(pngHeader(512, 512)),
    });

    const result = await discoverCompanyLogo(COMPANY_ID);

    expect(result.ok).toBe(true);
    expect(put).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array), "image/png");
    expect(storedUpdate()).toMatchObject({ logoSource: "website" });
  });

  it("moves on to the next candidate instead of giving up on the card", async () => {
    serve({
      "https://acme.test/": htmlResponse(`
        <head>
          <meta property="og:image" content="https://acme.test/card.png">
          <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
        </head>`),
      "https://acme.test/touch.png": bytesResponse(pngHeader(180, 180)),
      "https://acme.test/card.png": bytesResponse(pngHeader(1200, 630)),
    });

    const result = await discoverCompanyLogo(COMPANY_ID);

    expect(result.ok).toBe(true);
    expect(result.logoUrl).toContain("blob.test");
  });
});

describe("discoverCompanyLogo — manifest icons", () => {
  it("reads icons out of the web-app manifest and prefers them to og:image", async () => {
    serve({
      "https://acme.test/": htmlResponse(`
        <head>
          <link rel="manifest" href="/static/site.webmanifest">
          <meta property="og:image" content="https://acme.test/og.png">
        </head>`),
      "https://acme.test/static/site.webmanifest": jsonResponse({
        icons: [{ src: "icons/512.png", sizes: "512x512", type: "image/png" }],
      }),
      "https://acme.test/static/icons/512.png": bytesResponse(pngHeader(512, 512)),
      "https://acme.test/og.png": bytesResponse(pngHeader(512, 512)),
    });

    const result = await discoverCompanyLogo(COMPANY_ID);

    expect(result.ok).toBe(true);
    // Resolved against the manifest's own URL, not the page's.
    expect(put).toHaveBeenCalledOnce();
    expect(vi.mocked(safeFetch).mock.calls.map((call) => call[0])).toContain(
      "https://acme.test/static/icons/512.png",
    );
  });

  it("carries on when the manifest is missing or malformed", async () => {
    serve({
      "https://acme.test/": htmlResponse(`
        <head>
          <link rel="manifest" href="/broken.webmanifest">
          <meta property="og:image" content="https://acme.test/og.png">
        </head>`),
      "https://acme.test/broken.webmanifest": bytesResponse(
        new TextEncoder().encode("<!doctype html>not json"),
      ),
      "https://acme.test/og.png": bytesResponse(pngHeader(512, 512)),
    });

    const result = await discoverCompanyLogo(COMPANY_ID);

    expect(result.ok).toBe(true);
    expect(result.errors.join(" ")).toContain("broken.webmanifest");
  });

  it("skips the extra round-trip when the page already offers a 180px icon", async () => {
    serve({
      "https://acme.test/": htmlResponse(`
        <head>
          <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
          <link rel="manifest" href="/site.webmanifest">
        </head>`),
      "https://acme.test/touch.png": bytesResponse(pngHeader(180, 180)),
    });

    const result = await discoverCompanyLogo(COMPANY_ID);

    expect(result.ok).toBe(true);
    expect(vi.mocked(safeFetch).mock.calls.map((call) => call[0])).not.toContain(
      "https://acme.test/site.webmanifest",
    );
  });
});
