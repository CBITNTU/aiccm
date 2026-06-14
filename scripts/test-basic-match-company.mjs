/**
 * Quick CLI check: top basic matches for a company id.
 * Usage: node --import tsx scripts/test-basic-company.mjs <companyId>
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const companyId = process.argv[2];
if (!companyId) {
  console.error("Usage: node --import tsx scripts/test-basic-company.mjs <companyId>");
  process.exit(1);
}

const { basicMatchTendersForCompany } = await import(
  "../lib/services/basicMatchingService.ts"
);

const rows = await basicMatchTendersForCompany(companyId, {
  limit: 10,
  status: "open",
  minScore: 0.62,
});

for (const r of rows) {
  const cap = r.capabilityMatch ? "CAP" : "   ";
  console.log(
    `${(r.similarity * 100).toFixed(1)}% ${cap} ${r.band.padEnd(6)} ${r.title.slice(0, 72)}`,
  );
}
