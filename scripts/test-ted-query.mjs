#!/usr/bin/env node
/**
 * Test that the TED API accepts our query (no bare "*").
 * Run: node scripts/test-ted-query.mjs
 */
const url = "https://api.ted.europa.eu/v3/notices/search";
const body = {
  query: "publication-date >= 20240101",
  fields: ["notice-identifier", "notice-title"],
  limit: 5,
  scope: "ALL",
  checkQuerySyntax: false, // TED API returns 0 notices when true
  paginationMode: "ITERATION",
  onlyLatestVersions: true,
};

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error("TED API error:", res.status, text);
  process.exit(1);
}
const data = JSON.parse(text);
console.log("OK: TED API accepted query. totalNoticeCount:", data.totalNoticeCount, "notices:", (data.notices || []).length);
