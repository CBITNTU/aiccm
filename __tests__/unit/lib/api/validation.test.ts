import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { NextRequest } from "next/server";

// validation.ts (via ./index) dynamically imports @/lib/auth and
// @/lib/db/queries — stub both so no real auth/DB is touched.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/queries", () => ({
  getCompanyOwner: vi.fn(),
  getApprovedMembership: vi.fn(),
  getOwnedCompanyIds: vi.fn(),
  getApprovedMemberCompanyIds: vi.fn(),
  userHasRole: vi.fn(),
}));

import {
  AuthError,
  ValidationError,
  getUserCompanyIds,
  handleApiError,
  isCompanyMember,
  requireAuth,
  sanitizeLikeParam,
  sanitizeTextInput,
  validateBody,
  validateUrl,
} from "@/lib/api/validation";
import { auth } from "@/lib/auth";
import {
  getApprovedMemberCompanyIds,
  getApprovedMembership,
  getCompanyOwner,
  getOwnedCompanyIds,
} from "@/lib/db/queries";

function fakeRequest(json: () => Promise<unknown>): NextRequest {
  return { json } as unknown as NextRequest;
}

describe("sanitizeTextInput", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeTextInput("  hello  ", 100)).toBe("hello");
  });

  it("truncates to maxLength after trimming", () => {
    expect(sanitizeTextInput("  abcdef  ", 3)).toBe("abc");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeTextInput("   ", 10)).toBe("");
  });

  it("leaves short input untouched", () => {
    expect(sanitizeTextInput("ok", 10)).toBe("ok");
  });
});

describe("sanitizeLikeParam", () => {
  it("escapes backslashes", () => {
    expect(sanitizeLikeParam("a\\b")).toBe("a\\\\b");
  });

  it("escapes percent signs", () => {
    expect(sanitizeLikeParam("100%")).toBe("100\\%");
  });

  it("escapes underscores", () => {
    expect(sanitizeLikeParam("my_name")).toBe("my\\_name");
  });

  it("escapes backslash FIRST so later escapes are not double-escaped", () => {
    // "\%" → backslash becomes "\\", then "%" becomes "\%" → "\\\%"
    expect(sanitizeLikeParam("\\%")).toBe("\\\\\\%");
  });

  it("escapes all special characters together", () => {
    expect(sanitizeLikeParam("\\a%b_c")).toBe("\\\\a\\%b\\_c");
  });

  it("trims and applies default max length of 200", () => {
    const long = ` ${"x".repeat(300)} `;
    expect(sanitizeLikeParam(long)).toBe("x".repeat(200));
  });

  it("respects a custom max length (truncates before escaping)", () => {
    // Truncation happens on the raw trimmed string, then escaping expands it.
    expect(sanitizeLikeParam("%%%%", 2)).toBe("\\%\\%");
  });
});

describe("validateUrl", () => {
  it("returns the URL for a valid public https URL", () => {
    expect(validateUrl("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("throws ValidationError for an invalid URL", () => {
    expect(() => validateUrl("not a url")).toThrowError(ValidationError);
    expect(() => validateUrl("not a url")).toThrowError("Invalid URL format");
  });

  it("rejects non-https protocols", () => {
    expect(() => validateUrl("http://example.com")).toThrowError(
      "Only HTTPS URLs are allowed",
    );
    expect(() => validateUrl("ftp://example.com")).toThrowError(
      "Only HTTPS URLs are allowed",
    );
  });

  it("blocks localhost and loopback hosts", () => {
    expect(() => validateUrl("https://localhost")).toThrowError(
      "Internal URLs are not allowed",
    );
    expect(() => validateUrl("https://127.0.0.1")).toThrowError(
      "Internal URLs are not allowed",
    );
    expect(() => validateUrl("https://0.0.0.0")).toThrowError(
      "Internal URLs are not allowed",
    );
  });

  it("blocks localhost case-insensitively", () => {
    expect(() => validateUrl("https://LOCALHOST")).toThrowError(
      "Internal URLs are not allowed",
    );
  });

  it("blocks cloud metadata endpoints", () => {
    expect(() => validateUrl("https://169.254.169.254/latest")).toThrowError(
      "Internal URLs are not allowed",
    );
    expect(() =>
      validateUrl("https://metadata.google.internal/computeMetadata"),
    ).toThrowError("Internal URLs are not allowed");
  });

  it("blocks 10.x.x.x private range", () => {
    expect(() => validateUrl("https://10.0.0.1")).toThrowError(
      "Private IP addresses are not allowed",
    );
  });

  it("blocks 192.168.x.x private range", () => {
    expect(() => validateUrl("https://192.168.1.1")).toThrowError(
      "Private IP addresses are not allowed",
    );
  });

  it("blocks 172.16-31.x.x private range boundaries", () => {
    expect(() => validateUrl("https://172.16.0.1")).toThrowError(
      "Private IP addresses are not allowed",
    );
    expect(() => validateUrl("https://172.31.255.255")).toThrowError(
      "Private IP addresses are not allowed",
    );
  });

  it("allows 172.x addresses outside the 16-31 private block", () => {
    expect(validateUrl("https://172.15.0.1")).toBe("https://172.15.0.1");
    expect(validateUrl("https://172.32.0.1")).toBe("https://172.32.0.1");
  });

  it("pins current behavior: hostnames that merely START with a private prefix are also blocked", () => {
    // Oddity (over-blocking, not a security bug): the check is a prefix regex
    // on the hostname, so a public DOMAIN like "10.example.com" is rejected.
    expect(() => validateUrl("https://10.example.com")).toThrowError(
      "Private IP addresses are not allowed",
    );
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string(), count: z.number() });

  it("throws ValidationError when the body is not valid JSON", async () => {
    const req = fakeRequest(() => Promise.reject(new SyntaxError("bad json")));
    await expect(validateBody(req, schema)).rejects.toThrowError(
      ValidationError,
    );
    await expect(validateBody(req, schema)).rejects.toThrowError(
      "Invalid JSON body",
    );
  });

  it("throws ValidationError with details when the schema rejects the body", async () => {
    const req = fakeRequest(() => Promise.resolve({ name: 42 }));
    const err = await validateBody(req, schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toBe("Invalid request body");
    expect(typeof (err as ValidationError).details).toBe("string");
    expect((err as ValidationError).details!.length).toBeGreaterThan(0);
  });

  it("returns the parsed, typed data on success", async () => {
    const req = fakeRequest(() =>
      Promise.resolve({ name: "acme", count: 3, extra: "stripped" }),
    );
    const data = await validateBody(req, schema);
    expect(data).toEqual({ name: "acme", count: 3 });
  });
});

describe("handleApiError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("maps AuthError to a 401 with the error message", async () => {
    const res = handleApiError(new AuthError("Unauthorized"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("maps ValidationError to a 400 with message and details", async () => {
    const res = handleApiError(new ValidationError("Bad input", "name missing"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Bad input",
      details: "name missing",
    });
  });

  it("omits details for a ValidationError without details", async () => {
    const res = handleApiError(new ValidationError("Bad input"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad input" });
  });

  it("maps unknown errors to a 500 without leaking the message", async () => {
    const res = handleApiError(new Error("secret db connection string"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe("requireAuth", () => {
  const getSession = vi.mocked(auth.api.getSession);

  it("throws AuthError when there is no session user", async () => {
    getSession.mockResolvedValueOnce(null as never);
    const req = { headers: new Headers() } as unknown as NextRequest;
    await expect(requireAuth(req)).rejects.toThrowError(AuthError);
  });

  it("returns the authenticated user when a session exists", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "u1", email: "u1@example.com", emailVerified: true },
    } as never);
    const req = { headers: new Headers() } as unknown as NextRequest;
    const { user } = await requireAuth(req);
    expect(user).toEqual({
      id: "u1",
      email: "u1@example.com",
      emailVerified: true,
    });
  });
});

describe("isCompanyMember", () => {
  beforeEach(() => {
    vi.mocked(getCompanyOwner).mockReset();
    vi.mocked(getApprovedMembership).mockReset();
  });

  it("returns true for the company owner without querying membership (fast path)", async () => {
    vi.mocked(getCompanyOwner).mockResolvedValueOnce("user-1");

    expect(await isCompanyMember("user-1", "company-1")).toBe(true);
    expect(getApprovedMembership).not.toHaveBeenCalled();
  });

  it("falls back to approved membership when the user is not the owner", async () => {
    vi.mocked(getCompanyOwner).mockResolvedValueOnce("someone-else");
    vi.mocked(getApprovedMembership).mockResolvedValueOnce({
      id: "m1",
    } as never);

    expect(await isCompanyMember("user-1", "company-1")).toBe(true);
    expect(getApprovedMembership).toHaveBeenCalledWith("user-1", "company-1");
  });

  it("returns false when the user is neither owner nor an approved member", async () => {
    vi.mocked(getCompanyOwner).mockResolvedValueOnce("someone-else");
    vi.mocked(getApprovedMembership).mockResolvedValueOnce(undefined as never);

    expect(await isCompanyMember("user-1", "company-1")).toBe(false);
  });

  it("returns false when the company has no owner and no membership exists", async () => {
    vi.mocked(getCompanyOwner).mockResolvedValueOnce(null as never);
    vi.mocked(getApprovedMembership).mockResolvedValueOnce(null as never);

    expect(await isCompanyMember("user-1", "missing-company")).toBe(false);
  });
});

describe("getUserCompanyIds", () => {
  it("merges owned and member company IDs, deduplicated", async () => {
    vi.mocked(getOwnedCompanyIds).mockResolvedValueOnce(["a", "b"]);
    vi.mocked(getApprovedMemberCompanyIds).mockResolvedValueOnce(["b", "c"]);
    const ids = await getUserCompanyIds("user-1");
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when the user has no companies", async () => {
    vi.mocked(getOwnedCompanyIds).mockResolvedValueOnce([]);
    vi.mocked(getApprovedMemberCompanyIds).mockResolvedValueOnce([]);
    expect(await getUserCompanyIds("user-1")).toEqual([]);
  });
});
