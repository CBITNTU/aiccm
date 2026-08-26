import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * `lib/deployment` resolves the active profile once at module load, so every
 * case has to re-import the module under a fresh env.
 */
async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, undefined as unknown as string);
    } else {
      vi.stubEnv(key, value);
    }
  }
  return import("@/lib/deployment");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isWebAnalyticsEnabled", () => {
  it("is on for the UK profile in production", async () => {
    const { isWebAnalyticsEnabled } = await loadWith({
      DEPLOYMENT_PROFILE: "uk",
      VERCEL_ENV: "production",
    });
    expect(isWebAnalyticsEnabled()).toBe(true);
  });

  it("is off on UK preview deployments", async () => {
    const { isWebAnalyticsEnabled } = await loadWith({
      DEPLOYMENT_PROFILE: "uk",
      VERCEL_ENV: "preview",
    });
    expect(isWebAnalyticsEnabled()).toBe(false);
  });

  it("is off locally, where VERCEL_ENV is unset", async () => {
    const { isWebAnalyticsEnabled } = await loadWith({
      DEPLOYMENT_PROFILE: "uk",
      VERCEL_ENV: undefined,
    });
    expect(isWebAnalyticsEnabled()).toBe(false);
  });

  // The invariant that matters: the CN build must never ship the tracking
  // script, whatever environment it is deployed to.
  it("is off for the CN profile even in production", async () => {
    const { isWebAnalyticsEnabled } = await loadWith({
      DEPLOYMENT_PROFILE: "cn",
      VERCEL_ENV: "production",
    });
    expect(isWebAnalyticsEnabled()).toBe(false);
  });

  it("is off for the TH profile even in production", async () => {
    const { isWebAnalyticsEnabled } = await loadWith({
      DEPLOYMENT_PROFILE: "th",
      VERCEL_ENV: "production",
    });
    expect(isWebAnalyticsEnabled()).toBe(false);
  });
});
