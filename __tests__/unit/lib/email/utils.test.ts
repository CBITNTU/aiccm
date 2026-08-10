import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/email/utils";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x&y")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("O'Brien & Sons")).toBe("O&#39;Brien &amp; Sons");
  });

  it("escapes the ampersand first so entities are not double-decoded", () => {
    // "&lt;" must come out as text, not survive as a live entity.
    expect(escapeHtml("&lt;b&gt;")).toBe("&amp;lt;b&amp;gt;");
  });

  it("passes plain text through unchanged", () => {
    expect(escapeHtml("Jane Doe, Director (Civil Works)")).toBe(
      "Jane Doe, Director (Civil Works)",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });
});
