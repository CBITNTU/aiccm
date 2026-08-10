import { describe, expect, it } from "vitest";
import { isValidRedirectUrl } from "@/lib/utils/redirectUrl";

describe("isValidRedirectUrl", () => {
  it("accepts simple relative paths", () => {
    expect(isValidRedirectUrl("/dashboard")).toBe(true);
    expect(isValidRedirectUrl("/tenders?page=2")).toBe(true);
    expect(isValidRedirectUrl("/company/abc-123")).toBe(true);
  });

  it("accepts the root path", () => {
    expect(isValidRedirectUrl("/")).toBe(true);
  });

  it("trims whitespace before validating", () => {
    expect(isValidRedirectUrl("  /dashboard  ")).toBe(true);
  });

  it("rejects null and empty/whitespace-only strings", () => {
    expect(isValidRedirectUrl(null)).toBe(false);
    expect(isValidRedirectUrl("")).toBe(false);
    expect(isValidRedirectUrl("   ")).toBe(false);
  });

  it("rejects paths not starting with a slash", () => {
    expect(isValidRedirectUrl("dashboard")).toBe(false);
    expect(isValidRedirectUrl("../etc/passwd")).toBe(false);
  });

  it("rejects protocol-relative URLs (//host)", () => {
    expect(isValidRedirectUrl("//evil.com")).toBe(false);
    expect(isValidRedirectUrl("//evil.com/path")).toBe(false);
  });

  it("rejects absolute http(s) URLs", () => {
    expect(isValidRedirectUrl("http://evil.com")).toBe(false);
    expect(isValidRedirectUrl("https://evil.com")).toBe(false);
  });

  it("rejects other absolute schemes", () => {
    expect(isValidRedirectUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects redirects back into /auth", () => {
    expect(isValidRedirectUrl("/auth")).toBe(false);
    expect(isValidRedirectUrl("/auth?redirect=/x")).toBe(false);
  });

  it("pins current behavior: any path merely PREFIXED with /auth is rejected", () => {
    // Oddity: startsWith("/auth") also blocks unrelated paths like "/authors".
    expect(isValidRedirectUrl("/authors")).toBe(false);
  });

  it("rejects backslash variants of protocol-relative URLs", () => {
    // Browsers normalize "\" to "/" in URLs, so "/\evil.com" is treated as
    // the protocol-relative "//evil.com" and would be an open redirect.
    expect(isValidRedirectUrl("/\\evil.com")).toBe(false);
    expect(isValidRedirectUrl("\\/evil.com")).toBe(false); // no leading "/"
    expect(isValidRedirectUrl("\\\\evil.com")).toBe(false); // no leading "/"
  });
});
