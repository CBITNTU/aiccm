import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { GET } from "@/app/api/tenders/search/route";
import { AuthError, requireAuth } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser } from "@/__tests__/helpers/mocks";
import { queueSelects as queueChains, type Chain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;

const dialect = new PgDialect();

/** Every db.select() call creates a new chain, recorded here in call order. */
let chains: Chain[];

function queueSelects(...results: unknown[]) {
  chains = queueChains(mockedSelect, ...results);
}

function compileWhere(chain: Chain): { sql: string; params: unknown[] } {
  const clause = chain.where.mock.calls[0][0] as SQL;
  return dialect.sqlToQuery(clause);
}

function search(searchParams: Record<string, string> = {}) {
  return GET(makeRequest("/api/tenders/search", { searchParams }));
}

describe("GET /api/tenders/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user: mockUser() });
    queueSelects([{ count: 0 }], []);
  });

  it("returns 401 when unauthenticated", async () => {
    mockedRequireAuth.mockRejectedValue(new AuthError("Unauthorized"));

    const { status, body } = await readJson(await search());

    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("clamps page 0 to 1 and pageSize 500 to 100", async () => {
    const { status } = await readJson(await search({ page: "0", pageSize: "500" }));

    expect(status).toBe(200);
    const dataChain = chains[1];
    expect(dataChain.limit).toHaveBeenCalledWith(100);
    expect(dataChain.offset).toHaveBeenCalledWith(0); // page 0 -> 1 -> offset 0
  });

  it("falls back to the default pageSize 25 for pageSize=0 (|| 25 short-circuits before the min clamp)", async () => {
    // Oddity: the min clamp of 1 is unreachable for 0 — parseInt("0") is falsy,
    // so `|| 25` kicks in first. Only negative values actually hit the min clamp.
    await search({ pageSize: "0" });

    expect(chains[1].limit).toHaveBeenCalledWith(25);
  });

  it("clamps negative pageSize to the minimum of 1", async () => {
    await search({ pageSize: "-5", page: "3" });

    expect(chains[1].limit).toHaveBeenCalledWith(1);
    expect(chains[1].offset).toHaveBeenCalledWith(2); // (3 - 1) * 1
  });

  it("excludes closed tenders by default", async () => {
    await search();

    const { sql, params } = compileWhere(chains[1]);
    expect(sql).toContain("<>");
    expect(params).toContain("closed");
  });

  it("filters by exact status when one is requested (no closed-exclusion)", async () => {
    await search({ status: "open" });

    const { sql, params } = compileWhere(chains[1]);
    expect(params).toContain("open");
    expect(params).not.toContain("closed");
    expect(sql).not.toContain("<>");
  });

  it("escapes LIKE wildcards in the keyword via sanitizeLikeParam", async () => {
    await search({ keyword: "50%" });

    const { params } = compileWhere(chains[1]);
    // "%" in user input is escaped to "\%" before being wrapped in wildcards.
    expect(params).toContain("%50\\%%");
    // Keyword matches title, description, buyer, and location.
    expect(params.filter((p) => p === "%50\\%%")).toHaveLength(4);
  });

  it("returns tenders, totalCount, and a taxonomies map", async () => {
    const rows = [
      { id: "t1", title: "Road resurfacing" },
      { id: "t2", title: "Bridge inspection" },
    ];
    queueSelects(
      [{ count: 2 }], // count query
      rows, // data query
      [{ tenderId: "t1", taxonomyId: "x1", taxonomyName: "Roads" }], // taxonomy join
    );

    const { status, body } = await readJson(await search());

    expect(status).toBe(200);
    expect(body).toEqual({
      tenders: rows,
      totalCount: 2,
      taxonomies: { t1: [{ id: "x1", name: "Roads" }] },
    });
  });
});
