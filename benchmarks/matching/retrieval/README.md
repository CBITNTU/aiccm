# Basic Match retrieval benchmark

Measures **recall quality** of `basicMatchTendersForCompany` (fast path), not LLM scoring.

## Prerequisites

```bash
ollama pull qwen3-embedding:0.6b
npm run embed:backfill
```

## Run

```bash
npm run bench:matching:retrieval
TOP_K=20 npm run bench:matching:retrieval
```

## Metrics

- **Hit**: a tender whose title contains `positiveTenderNeedle` appears in top-K
- **MRR@K**: mean reciprocal rank across cases in `cases.json`

Edit `cases.json` to add companies/tenders from your local seed.
