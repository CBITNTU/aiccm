/**
 * Basic Match retrieval benchmark.
 *
 * For each case, runs basicMatchTendersForCompany and checks whether a tender
 * whose title matches `positiveTenderNeedle` appears in the top-K results.
 *
 * Usage:
 *   npm run bench:matching:retrieval
 *   TOP_K=20 npm run bench:matching:retrieval
 */
import { config } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOP_K = Math.max(1, Number(process.env.TOP_K) || 15);

interface CaseDef {
  id: string;
  companyName: string;
  positiveTenderNeedle: string;
  negativeNeedle?: string;
}

async function main() {
  const { db } = await import("@/lib/db");
  const { companies } = await import("@/lib/db/schema/app");
  const { eq } = await import("drizzle-orm");
  const { basicMatchTendersForCompany } = await import(
    "@/lib/services/basicMatchingService"
  );

  const cases = JSON.parse(
    readFileSync(resolve(__dirname, "cases.json"), "utf8"),
  ) as { cases: CaseDef[] };

  const results: Array<{
    id: string;
    companyName: string;
    hitRank: number | null;
    topTitle: string;
    topScore: number;
    negativeInTop5: boolean;
    elapsedMs: number;
  }> = [];

  for (const c of cases.cases) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.companyName, c.companyName))
      .limit(1);

    if (!company) {
      console.warn(`Skip ${c.id}: company not found (${c.companyName})`);
      continue;
    }

    const t0 = Date.now();
    const matches = await basicMatchTendersForCompany(company.id, {
      limit: TOP_K,
      status: "open",
      minScore: 0.55,
    });
    const elapsedMs = Date.now() - t0;

    const hitIndex = matches.findIndex((m) =>
      m.title.toLowerCase().includes(c.positiveTenderNeedle.toLowerCase()),
    );
    const negativeInTop5 =
      !!c.negativeNeedle &&
      matches
        .slice(0, 5)
        .some((m) =>
          m.title.toLowerCase().includes(c.negativeNeedle!.toLowerCase()),
        );

    results.push({
      id: c.id,
      companyName: c.companyName,
      hitRank: hitIndex >= 0 ? hitIndex + 1 : null,
      topTitle: matches[0]?.title ?? "—",
      topScore: matches[0]?.similarity ?? 0,
      negativeInTop5,
      elapsedMs,
    });
  }

  const hits = results.filter((r) => r.hitRank != null);
  const mrr =
    hits.length === 0
      ? 0
      : hits.reduce((s, r) => s + 1 / (r.hitRank ?? TOP_K), 0) / results.length;

  const summary = {
    ranAt: new Date().toISOString(),
    topK: TOP_K,
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? "qwen3-embedding:0.6b",
    cases: results.length,
    hits: hits.length,
    mrrAtK: Number(mrr.toFixed(3)),
    results,
  };

  const outDir = resolve(__dirname, "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(
    outDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}__retrieval.json`,
  );
  writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log("\nBasic Match retrieval benchmark");
  console.log("─".repeat(50));
  for (const r of results) {
    const status =
      r.hitRank != null ? `HIT @ rank ${r.hitRank}` : "MISS";
    console.log(
      `${r.id.padEnd(22)} ${status.padEnd(14)} top=${(r.topScore * 100).toFixed(1)}%  ${r.topTitle.slice(0, 50)}`,
    );
  }
  console.log("─".repeat(50));
  console.log(`MRR@${TOP_K}: ${summary.mrrAtK}  (${hits.length}/${results.length} cases hit)`);
  console.log(`Written: ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
