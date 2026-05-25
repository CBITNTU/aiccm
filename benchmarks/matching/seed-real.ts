/**
 * Stub: sample real (company, tender) pairs from the local DB and write an
 * anonymised `cases-real.json` next to `cases.json`.
 *
 * Implementation deferred. Outline:
 *   1. Pick N verified companies with capability + location data.
 *   2. Pick M open tenders covering varied sectors + locations.
 *   3. Pair them deterministically (e.g. round-robin).
 *   4. Anonymise: replace company name with `Company A`, strip emails, round
 *      postcodes to outward code only.
 *   5. Append to a CasesFile with assertions left empty (or auto-derived
 *      from CPV overlap heuristics) and write to `cases-real.json`.
 *
 * The runner already picks `cases-real.json` up automatically when present.
 */
console.error(
  "seed-real.ts is a stub. Decide on sampling strategy + anonymisation rules first.",
);
process.exit(1);
