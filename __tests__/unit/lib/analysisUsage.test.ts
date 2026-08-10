import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { db } from "@/lib/db";
import {
  getAnalysisRunsThisMonth,
  getEffectiveAnalysisLimit,
} from "@/lib/analysisUsage";
import { extractRequestInfo } from "@/lib/services/eventLogger";
import { makeChain } from "@/__tests__/helpers/drizzleMock";
import { TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";

const settings = {
  verifiedAnalysisRunsPerMonth: 20,
  unverifiedAnalysisRunsPerMonth: 3,
} as Parameters<typeof getEffectiveAnalysisLimit>[1];

describe("getEffectiveAnalysisLimit", () => {
  it("prefers the per-company override, including an explicit 0", () => {
    expect(
      getEffectiveAnalysisLimit(
        { analysisRunsLimit: 50, verificationStatus: "unverified" },
        settings,
      ),
    ).toBe(50);
    expect(
      getEffectiveAnalysisLimit(
        { analysisRunsLimit: 0, verificationStatus: "verified" },
        settings,
      ),
    ).toBe(0);
  });

  it("falls back to the verified platform limit for verified companies", () => {
    expect(
      getEffectiveAnalysisLimit(
        { analysisRunsLimit: null, verificationStatus: "verified" },
        settings,
      ),
    ).toBe(20);
  });

  it("falls back to the unverified limit otherwise", () => {
    expect(
      getEffectiveAnalysisLimit(
        { analysisRunsLimit: null, verificationStatus: "unverified" },
        settings,
      ),
    ).toBe(3);
    expect(getEffectiveAnalysisLimit({}, settings)).toBe(3);
    expect(
      getEffectiveAnalysisLimit({ verificationStatus: null }, settings),
    ).toBe(3);
  });
});

describe("getAnalysisRunsThisMonth", () => {
  const mockedSelect = db.select as unknown as Mock;
  const dialect = new PgDialect();

  /** The WHERE clause the counter builds, so its predicates can be asserted. */
  function capturedWhere(): { sql: string; params: unknown[] } {
    const chain = mockedSelect.mock.results[0].value;
    const condition = chain.where.mock.calls[0][0] as SQL;
    const query = dialect.sqlToQuery(condition);
    return { sql: query.sql, params: query.params };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSelect.mockImplementation(() => makeChain(() => [{ count: 3 }]));
  });

  it("counts comprehensive analysis events for the company", async () => {
    await expect(getAnalysisRunsThisMonth(TEST_COMPANY_ID)).resolves.toBe(3);

    const { sql, params } = capturedWhere();
    expect(sql).toContain("'analysisType' = 'comprehensive'");
    expect(params).toContain(TEST_COMPANY_ID);
    expect(params).toContain("company_updated");
  });

  it("excludes admin-initiated runs from the user's quota", async () => {
    // Preparing an account before approving it must not spend the owner's
    // monthly allowance, so those events carry details.initiatedBy = 'admin'.
    await getAnalysisRunsThisMonth(TEST_COMPANY_ID);

    const { sql, params } = capturedWhere();
    expect(sql).toContain(
      "\"events\".\"details\"->>'initiatedBy' is null or \"events\".\"details\"->>'initiatedBy' <>",
    );
    expect(params).toContain("admin");
  });

  it("returns 0 when the company has no runs", async () => {
    mockedSelect.mockImplementation(() => makeChain(() => []));

    await expect(getAnalysisRunsThisMonth(TEST_COMPANY_ID)).resolves.toBe(0);
  });
});

describe("extractRequestInfo", () => {
  it("extracts everything from a Headers-based request", () => {
    const info = extractRequestInfo({
      headers: new Headers({
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "vitest-agent",
      }),
      url: "http://localhost:3000/api/tenders/search?q=roof",
      method: "GET",
    });

    expect(info).toEqual({
      ipAddress: "203.0.113.7", // first hop of x-forwarded-for
      userAgent: "vitest-agent",
      requestPath: "/api/tenders/search",
      requestMethod: "GET",
    });
  });

  it("falls back to x-real-ip and supports plain-object headers", () => {
    const info = extractRequestInfo({
      headers: { "x-real-ip": "198.51.100.9", "user-agent": "curl/8" },
      method: "POST",
    });

    expect(info.ipAddress).toBe("198.51.100.9");
    expect(info.userAgent).toBe("curl/8");
    expect(info.requestMethod).toBe("POST");
    expect(info.requestPath).toBeNull();
  });

  it("keeps an unparsable URL as the raw path", () => {
    const info = extractRequestInfo({ url: "/relative/only" });
    expect(info.requestPath).toBe("/relative/only");
  });

  it("returns all nulls for an empty request", () => {
    expect(extractRequestInfo({})).toEqual({
      ipAddress: null,
      userAgent: null,
      requestPath: null,
      requestMethod: null,
    });
  });
});
