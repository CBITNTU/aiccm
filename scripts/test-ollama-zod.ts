/**
 * Strict-schema test: run the REAL matchingScoreSchema through the Vercel AI
 * SDK's `generateObject` against Ollama. This validates that Qwen (or whatever
 * MATCHING_MODEL is set to) can satisfy our production Zod schema.
 *
 * No DB needed. Bypasses platform settings + rate limiter to keep the test
 * cheap and reproducible.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/test-ollama-zod.ts
 *   MATCHING_MODEL=ollama/qwen2.5:3b ./node_modules/.bin/tsx scripts/test-ollama-zod.ts
 *   N=20 ./node_modules/.bin/tsx scripts/test-ollama-zod.ts          # run more cases
 */
import "dotenv/config";
import { config } from "dotenv";
import { generateObject, zodSchema } from "ai";

import { matchingScoreSchema } from "@/lib/schemas/tenderMatching";
import { resolveModel } from "@/lib/ai/models";

config({ path: ".env.local" });

const modelId =
  process.env.MATCHING_MODEL?.trim() || "ollama/qwen2.5:7b";

const SYSTEM = `You are an expert at evaluating company-tender matches.

FIRST: Check if company and tender industries/sectors match. If they DON'T match, set capabilityScore = 0.
Then rate Capability, Certification, Experience, Location 0-100 independently.

For matchReasons: 2-4 SHORT bullet points (10-15 words each).
For improvementSuggestions: 2-3 SHORT actionable suggestions (10-15 words each).
For aiAnalysis: a brief summary of the match.
For scoreExplanations: a short string for each of capability, experience, location, certification.`;

interface Case {
  label: string;
  company: string;
  tender: string;
}

const CASES: Case[] = [
  {
    label: "Construction × NHS M&E (good fit, wrong city)",
    company: `Company: Acme Construction Ltd
Capabilities: Commercial fit-out, mechanical & electrical, project management
Certifications: ISO 9001, CHAS, SSIP
Past Projects: 12 schools, 4 NHS clinics in East Midlands
Location: Nottingham NG1`,
    tender: `Tender: NHS ward refurbishment — mechanical and electrical works
Buyer: NHS Trust
Budget: £450k–£700k
Location: Derby`,
  },
  {
    label: "IT consultancy × Construction (industry mismatch)",
    company: `Company: Byteforge Software
Capabilities: SaaS development, AI integrations, devops
Certifications: ISO 27001, Cyber Essentials Plus
Location: London EC1`,
    tender: `Tender: Construction of a 12-classroom primary school
Buyer: County Council
Budget: £4.2m–£5.0m
Location: Leicester`,
  },
  {
    label: "Healthcare consulting × NHS digital transformation (strong fit)",
    company: `Company: Clinity Health Advisors
Capabilities: Clinical pathway redesign, EPR rollout, NHS digital transformation
Certifications: DSPT, ISO 27001
Past Projects: 6 NHS Trusts, NHSX programmes
Location: Leeds LS1`,
    tender: `Tender: Digital transformation programme delivery for an NHS Trust
Buyer: NHS Trust
Budget: £200k–£350k
Location: Manchester`,
  },
  {
    label: "Roofing SME × landscaping (partial overlap)",
    company: `Company: Pinnacle Roofing
Capabilities: Roofing, gutter works, scaffolding
Certifications: CHAS
Location: Coventry CV1`,
    tender: `Tender: Public park landscaping and pathway works
Buyer: Borough Council
Budget: £80k–£150k
Location: Coventry`,
  },
  {
    label: "Sparse company profile (mostly missing data)",
    company: `Company: Tiny Ltd
Capabilities: General contracting`,
    tender: `Tender: Multi-storey car park refurbishment
Buyer: City Council
Budget: £1.2m–£1.8m
Location: Birmingham`,
  },
];

interface Result {
  label: string;
  ok: boolean;
  ms: number;
  error?: string;
  scores?: {
    capability: number;
    experience: number;
    location: number;
    certification: number;
  };
}

async function runCase(c: Case): Promise<Result> {
  const started = Date.now();
  try {
    const model = resolveModel(modelId);
    const result = await generateObject({
      model,
      schema: zodSchema(matchingScoreSchema),
      system: SYSTEM,
      prompt: `${c.company}\n\n${c.tender}`,
      maxOutputTokens: 4096,
      temperature: 0.2,
    });
    const ms = Date.now() - started;
    if (result.object == null) {
      return { label: c.label, ok: false, ms, error: "no object" };
    }
    const o = result.object;
    return {
      label: c.label,
      ok: true,
      ms,
      scores: {
        capability: o.capabilityScore,
        experience: o.experienceScore,
        location: o.locationScore,
        certification: o.certificationScore,
      },
    };
  } catch (err: unknown) {
    return {
      label: c.label,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`Model:  ${modelId}`);
  console.log(`Schema: matchingScoreSchema (strict Zod via zodSchema())`);

  const requested = Number(process.env.N) || CASES.length;
  const cases: Case[] = [];
  for (let i = 0; i < requested; i++) cases.push(CASES[i % CASES.length]);

  console.log(`Cases:  ${cases.length}\n`);

  const results: Result[] = [];
  let i = 0;
  for (const c of cases) {
    i++;
    process.stdout.write(`[${i}/${cases.length}] ${c.label} ... `);
    const r = await runCase(c);
    results.push(r);
    if (r.ok && r.scores) {
      console.log(
        `OK ${r.ms}ms  cap=${r.scores.capability} exp=${r.scores.experience} loc=${r.scores.location} cert=${r.scores.certification}`,
      );
    } else {
      console.log(`FAIL ${r.ms}ms  ${r.error ?? ""}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const avg = Math.round(
    results.reduce((s, r) => s + r.ms, 0) / Math.max(1, results.length),
  );
  console.log("\n────────────────────────────────────────");
  console.log(`Schema-valid: ${passed}/${results.length}`);
  console.log(`Failures:     ${failed}`);
  console.log(`Avg latency:  ${avg}ms`);

  if (failed > 0) {
    console.log("\nFailure details:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - ${r.label}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
