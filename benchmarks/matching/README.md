# Matching Benchmark

Reproducible smoke benchmark for the tender-matching LLM step.

## What this measures

For a given model:

| Metric | What it tells you |
|---|---|
| **Schema-valid rate** | Did the model return JSON that satisfies the production Zod schema (`matchingScoreSchema`)? |
| **Assertion pass-rate** | Did the model satisfy the behavioral assertions on each case (e.g. "industry mismatch ⇒ capability=0")? |
| **Per-case mean & stdev** | Average and variance of each sub-score across `REPEATS` runs of the same case |
| **Latency** | Avg + p95 |
| **Provenance** | Git SHA, prompt version, schema version, model id, timestamp |

For two models, `compare.ts` adds:

| Metric | What it tells you |
|---|---|
| **Mean abs delta per axis** | How far apart the two models score the same cases, on average |
| **Spearman rank correlation** | Do the two models *rank* cases the same way per axis? |
| **Biggest disagreements** | The 5 (case, axis) pairs where the models differ most |

## Files

```
benchmarks/matching/
  cases.json        # frozen synthetic cases — version-controlled
  cases-real.json   # optional: anonymised real DB cases (auto-loaded if present)
  run.ts            # runner: writes a timestamped JSON to results/
  compare.ts        # diff two result files
  seed-real.ts      # stub: sample real DB pairs into cases-real.json
  results/          # output (gitignored)
  types.ts          # shared TypeScript types
```

## Running

### Requirements

- Ollama running (`brew services start ollama` or `ollama serve`)
- Model pulled (e.g. `ollama pull qwen2.5:7b`)
- OR a cloud model env var (`OPENAI_API_KEY`, etc.)

### Quick start

```bash
# Local: Qwen 2.5 7B via Ollama, 3 repeats per case
MATCHING_MODEL=ollama/qwen2.5:7b npm run bench:matching

# Cloud: GPT-5 nano (production baseline)
MATCHING_MODEL=gpt-5-nano npm run bench:matching

# More repeats for variance analysis
REPEATS=5 MATCHING_MODEL=ollama/qwen2.5:7b npm run bench:matching

# Run a subset by case id
CASES=construction-nhs-me-wrong-city,it-vs-construction-mismatch \
  MATCHING_MODEL=ollama/qwen2.5:7b npm run bench:matching
```

### Compare two runs

Treats the first file as the reference (baseline).

```bash
npm run bench:matching:compare -- \
  benchmarks/matching/results/2026-05-25T13-30-00-000Z__gpt-5-nano.json \
  benchmarks/matching/results/2026-05-25T13-40-00-000Z__ollama_qwen2.5_7b.json
```

## Interpreting results

- `schemaValidRate < 100%` is a **blocker** for using that model in production — the rest of the pipeline relies on `aiGenerateObject` returning a parsed object.
- `assertionPassRate` is the most important signal. The assertions encode behaviour we *require*, e.g. industry-mismatch handling.
- Per-axis **stdev** matters: a model with mean `capability=75` and stdev `15` is essentially randomly scoring the case. Aim for stdev ≤ 5.
- Spearman ρ vs reference ≥ **0.7** is "rankings broadly agree". ≥ **0.85** is "very close to reference".
- Mean-abs-delta ≤ **10** per axis is "close enough for matching".

## Adding a case

1. Open `cases.json`. Pick a stable kebab-case `id` (never rename — it's a key across result files).
2. Provide `company` + `tender` prompt fragments.
3. Add the minimal set of `assertions` that capture *what we require*. Don't pin scores too tightly; pin bounds.
4. Run it once to sanity-check both models can pass.

## Version discipline

Bump these when behaviour changes:

- `PROMPT_VERSION` in `run.ts` — if you change the system prompt
- `SCHEMA_VERSION` in `run.ts` — if `matchingScoreSchema` changes
- `version` in `cases.json` — if the case schema changes

Don't compare result files across different versions. The comparator does **not** enforce this — humans must.

## What this benchmark does NOT do

- It does not prove a model is correct — there is no human-labelled ground truth yet.
- It does not measure cost. Add that when we move beyond local-only experiments.
- It does not test the queue, rate limiter, or DB writes. It exercises only the LLM step.
