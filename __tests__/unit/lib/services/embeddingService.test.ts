import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the IO seams: the DB (row + junction reads, the UPDATE) and the embedding
// provider. buildCompanySource itself is pure and needs neither.
// vi.hoisted: the vi.mock factory below is lifted above ordinary top-level
// consts, so the mock object has to be hoisted with it.
const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

vi.mock("@/lib/ai/embeddings", () => ({
  embedText: vi.fn(),
  vectorToLiteral: vi.fn(() => "[0.1,0.2]"),
}));

vi.mock("@/lib/deployment", () => ({
  getActiveProfile: vi.fn(() => ({
    taxonomy: "cpv_eic",
    taxonomyLanguage: "en",
    currency: { code: "GBP", symbol: "£", locale: "en-GB" },
  })),
}));

import {
  buildCompanySource,
  embedCompany,
  refreshCompanyEmbedding,
} from "@/lib/services/embeddingService";
import { embedText } from "@/lib/ai/embeddings";

const embedTextMock = vi.mocked(embedText);

const COMPANY_ID = "00000000-0000-4000-8000-00000000c001";

const baseCompany = {
  companyName: "Acme Ltd",
  description: "We build bridges.",
  keyCapabilities: null,
  certifications: null,
  equipment: null,
  pastProjects: null,
  aiSummary: null,
  aiCompetencies: null,
  aiCapabilities: null,
  aiStrengths: null,
  aiCertifications: null,
  aiCapabilityTaxonomy: null,
  postcode: null,
  address: null,
};

/**
 * embedCompany issues one `db.select()` for the company row, then a fixed set of
 * junction reads. Every read goes through the same thenable chain shape, so a
 * single queue of results driven in call order is enough.
 */
function queueSelects(results: unknown[][]) {
  let i = 0;
  dbMock.select.mockImplementation(() => {
    const rows = results[i] ?? [];
    i += 1;
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "limit"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  });
}

/** The read order inside embedCompany: row, then capabilities, seed-ref pair, then markets/standards/taxonomies. */
function queueCompanyReads(
  row: Record<string, unknown>,
  opts: {
    capabilities?: string[];
    markets?: string[];
    standards?: string[];
    taxonomies?: string[];
  } = {},
) {
  queueSelects([
    [row],
    (opts.capabilities ?? []).map((name) => ({ name })),
    (opts.markets ?? []).map((name) => ({ name })),
    (opts.standards ?? []).map((name) => ({ name })),
    (opts.taxonomies ?? []).map((name) => ({ name })),
  ]);
}

/** Same digest the service stores in embedding_source_hash. */
async function hashOf(source: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(source).digest("hex").slice(0, 32);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.execute.mockResolvedValue({ rows: [] });
  embedTextMock.mockResolvedValue({ vector: [0.1, 0.2] } as never);
});

describe("buildCompanySource", () => {
  it("includes markets, standards and taxonomy names", () => {
    const source = buildCompanySource({
      ...baseCompany,
      capabilityLabels: ["Structural steelwork"],
      marketLabels: ["Rail", "Highways"],
      standardLabels: ["ISO 9001"],
      taxonomyNames: ["Civil engineering"],
    });

    expect(source).toContain("Profile competencies: Structural steelwork");
    expect(source).toContain("Sector taxonomy: Civil engineering");
    expect(source).toContain("Markets served: Rail; Highways");
    expect(source).toContain("Standards: ISO 9001");
  });

  it("omits the label lines entirely when the lists are empty or absent", () => {
    const source = buildCompanySource({
      ...baseCompany,
      marketLabels: [],
      standardLabels: [],
      taxonomyNames: [],
    });

    expect(source).not.toContain("Markets served");
    expect(source).not.toContain("Standards:");
    expect(source).not.toContain("Sector taxonomy");
    expect(source).toContain("We build bridges.");
  });

  it("changes the source text when a market is added", () => {
    const before = buildCompanySource({ ...baseCompany, marketLabels: [] });
    const after = buildCompanySource({ ...baseCompany, marketLabels: ["Rail"] });

    // The whole point of the fix: curating markets must move the vector.
    expect(after).not.toBe(before);
  });
});

describe("embedCompany", () => {
  it("writes a new vector and records the source hash", async () => {
    queueCompanyReads(
      { id: COMPANY_ID, ...baseCompany, embeddingSourceHash: "stale-hash" },
      { markets: ["Rail"] },
    );

    const result = await embedCompany(COMPANY_ID);

    expect(result.status).toBe("embedded");
    expect(embedTextMock).toHaveBeenCalledOnce();
    expect(embedTextMock.mock.calls[0][0]).toContain("Markets served: Rail");
    expect(dbMock.execute).toHaveBeenCalledOnce();
  });

  it("skips the provider round-trip when the source is unchanged", async () => {
    // Derive the stored hash from a real first pass rather than hardcoding it,
    // so this asserts the actual dedupe and stays correct if the source format
    // changes again.
    queueCompanyReads({ id: COMPANY_ID, ...baseCompany, embeddingSourceHash: null });
    await embedCompany(COMPANY_ID);
    const sourceHash = await hashOf(embedTextMock.mock.calls[0][0]);

    embedTextMock.mockClear();
    dbMock.execute.mockClear();
    queueCompanyReads({ id: COMPANY_ID, ...baseCompany, embeddingSourceHash: sourceHash });

    const result = await embedCompany(COMPANY_ID);

    expect(result).toEqual({ status: "skipped", reason: "unchanged source" });
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("re-embeds an unchanged source when force is set", async () => {
    queueCompanyReads({ id: COMPANY_ID, ...baseCompany, embeddingSourceHash: null });
    await embedCompany(COMPANY_ID);
    const sourceHash = await hashOf(embedTextMock.mock.calls[0][0]);

    embedTextMock.mockClear();
    queueCompanyReads({ id: COMPANY_ID, ...baseCompany, embeddingSourceHash: sourceHash });

    const result = await embedCompany(COMPANY_ID, { force: true });

    expect(result.status).toBe("embedded");
    expect(embedTextMock).toHaveBeenCalledOnce();
  });

  it("skips a company that does not exist", async () => {
    queueSelects([[]]);

    const result = await embedCompany(COMPANY_ID);

    expect(result).toEqual({ status: "skipped", reason: "company not found" });
    expect(embedTextMock).not.toHaveBeenCalled();
  });
});

describe("refreshCompanyEmbedding", () => {
  it("swallows provider failures so a save is never turned into a 500", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    queueCompanyReads({ id: COMPANY_ID, ...baseCompany, embeddingSourceHash: null });
    embedTextMock.mockRejectedValue(new Error("ollama down"));

    await expect(refreshCompanyEmbedding(COMPANY_ID)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Company embedding refresh failed"),
      COMPANY_ID,
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("forwards the force flag", async () => {
    queueCompanyReads({ id: COMPANY_ID, ...baseCompany, embeddingSourceHash: null });

    await refreshCompanyEmbedding(COMPANY_ID, { force: true });

    expect(embedTextMock).toHaveBeenCalledOnce();
  });
});
