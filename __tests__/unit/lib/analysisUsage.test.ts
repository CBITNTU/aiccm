import { describe, expect, it, vi } from "vitest";

// getAnalysisRunsThisMonth is IO; only the pure limit resolution is under test.
vi.mock("@/lib/db", () => ({ db: {} }));

import { getEffectiveAnalysisLimit } from "@/lib/analysisUsage";
import { extractRequestInfo } from "@/lib/services/eventLogger";

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
