import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { GET } from "@/app/api/tenders/close-expired/route";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { makeChain, type Chain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/db", () => ({
  db: { update: vi.fn() },
}));

const mockedUpdate = db.update as unknown as Mock;
const dialect = new PgDialect();

function setupUpdate(closedIds: Array<{ id: string }>): Chain {
  const chain = makeChain(() => closedIds);
  mockedUpdate.mockImplementation(() => chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/tenders/close-expired", () => {
  it("requires the Bearer secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "prod-secret");
    setupUpdate([]);

    const unauthorized = await readJson(
      await GET(makeRequest("/api/tenders/close-expired")),
    );
    expect(unauthorized.status).toBe(401);
    expect(mockedUpdate).not.toHaveBeenCalled();

    const authorized = await readJson(
      await GET(
        makeRequest("/api/tenders/close-expired", {
          headers: { authorization: "Bearer prod-secret" },
        }),
      ),
    );
    expect(authorized.status).toBe(200);
  });

  it("closes only open-ish tenders past their deadline and returns the count", async () => {
    const chain = setupUpdate([{ id: "t1" }, { id: "t2" }]);

    const { status, body } = await readJson(
      await GET(makeRequest("/api/tenders/close-expired")),
    );

    expect(status).toBe(200);
    expect(body).toEqual({ closed: 2 });
    expect(chain.set).toHaveBeenCalledWith({ status: "closed" });

    const where = dialect.sqlToQuery(chain.where.mock.calls[0][0] as SQL);
    expect(where.sql).toContain('"status" in');
    expect(where.sql).toContain('"deadline" <');
    expect(where.params).toEqual(
      expect.arrayContaining(["open", "closing_soon", "framework"]),
    );
  });

  it("is idempotent — a second run with nothing left closes 0", async () => {
    setupUpdate([]);

    const { status, body } = await readJson(
      await GET(makeRequest("/api/tenders/close-expired")),
    );

    expect(status).toBe(200);
    expect(body).toEqual({ closed: 0 });
  });

  it("returns 500 when the update fails", async () => {
    mockedUpdate.mockImplementation(() => {
      throw new Error("db down");
    });

    const { status, body } = await readJson(
      await GET(makeRequest("/api/tenders/close-expired")),
    );

    expect(status).toBe(500);
    expect(body.error).toBe("Failed to close expired tenders");
  });
});
