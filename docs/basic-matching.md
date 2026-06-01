# Basic Matching — Instant Semantic Tender↔Company Matching

> Local-first, sub-50&nbsp;ms semantic search between companies and tenders, with
> zero LLM calls at query time.

---

## 1. The problem we solved

The original tender↔company matcher invoked a GPT-class LLM **once per
`(company, tender)` pair**, generating a structured score + reasoning. That gave
us deep, explainable matches — but it had three structural problems:

1. **Slow:** ~3–8&nbsp;s per pair. A user with 1k tenders × 1 company = ~hour-scale
   batches. Not usable as an interactive filter.
2. **Expensive:** OpenAI cost grew linearly with `companies × tenders`. With
   even modest growth this becomes a four-figure monthly bill.
3. **Bursty:** Tier-1 OpenAI rate limits (500 RPM / 200k TPM) capped concurrency
   even when we throttled aggressively. Batches stalled mid-run.

Basic Matching is the first-pass funnel: a fast, cheap, "good enough" filter
that surfaces the *plausible* candidates so the expensive LLM scorer only ever
runs on the few you actually want explained in depth.

---

## 2. The name of the approach

This is a textbook **vector-search retrieval pipeline** — the same family of
techniques used in modern RAG systems, semantic search, and recommendation
engines. Specifically:

| Layer | Technique | Why |
|---|---|---|
| Representation | **Dense sentence embeddings** (768-dim) | Captures semantic meaning, not just keywords |
| Storage | **pgvector** (PostgreSQL extension) | Keep data + indexes in the existing transactional DB |
| Index | **HNSW** (Hierarchical Navigable Small Worlds) | Sub-linear nearest-neighbour lookups at ANN quality |
| Similarity | **Cosine distance** (`<=>` operator) | Standard for normalised text embeddings |
| Architecture | **Embed-once, search-many** | Inference moves from query time to write time |
| Pattern | **Two-stage retrieval** ("basic" + "deep") | Cheap recall first, expensive precision on demand |

In RAG/IR literature this is called **dense retrieval** (or **bi-encoder
retrieval**): both queries and documents are independently encoded into the
same vector space, and similarity is just geometry. The LLM scorer that runs
on the resulting shortlist is a **re-ranker** — a strictly more expensive,
strictly more accurate second pass. Together they form a classic
**retrieve-and-rerank** pipeline.

---

## 3. What we built (the diff in one paragraph)

We added a 768-dim `vector` column to `companies` and `tenders`, indexed each
with HNSW under cosine distance, and wired a local Ollama model
(`qwen3-embedding:0.6b`, same Qwen family as local matching benchmarks) behind a thin embedding service. Every write path
on companies/tenders synchronously recomputes the row's embedding (idempotent
via a SHA hash of the source text). Reads are pure SQL — no LLM, no
network — and return ranked candidates in ~25&nbsp;ms. A new
`POST /api/basic-match` route exposes three query modes
(company→tenders, tender→companies, free-text→tenders), each ~10 lines of
code on top of the service. A new `/matches` page surfaces this for the
authenticated user, and `/admin/basic-match` adds a diagnostic UI with all three
modes.

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                            WRITE PATH (rare)                           │
│                                                                        │
│  Onboarding / Company edit / Tender import                             │
│         │                                                              │
│         ▼                                                              │
│  buildCompanySource() / buildTenderSource()  ──── concatenates the     │
│         │                                          structured + AI     │
│         │                                          fields into one     │
│         │                                          dense block of text │
│         ▼                                                              │
│  embedText(source) ──── HTTP ──► Ollama  (qwen3-embedding, 768d MRL)   │
│         │                                                              │
│         ▼                                                              │
│  UPDATE companies/tenders                                              │
│    SET embedding = '[…]'::vector,                                      │
│        embedding_source_hash = sha256(source)                          │
│         │                                                              │
│         ▼                                                              │
│  HNSW index updated automatically                                      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                           READ PATH (hot)                              │
│                                                                        │
│  User opens /matches                                                   │
│         │                                                              │
│         ▼                                                              │
│  POST /api/basic-match { mode, companyId/tenderId/query, ... }          │
│         │                                                              │
│         ▼                                                              │
│  Drizzle raw SQL:                                                      │
│     SELECT id, ..., (t.embedding <=> q)::float AS distance             │
│     FROM tenders t, q                                                  │
│     ORDER BY t.embedding <=> q                                         │
│     LIMIT $limit                                                       │
│         │                                                              │
│         ▼                                                              │
│  HNSW returns top-K candidates in ~10–40 ms                            │
│         │                                                              │
│         ▼                                                              │
│  Map distance → similarity = 1 - distance                              │
│  Map similarity → band (high ≥ 72% / medium ≥ 55% / low < 55%)         │
│         │                                                              │
│         ▼                                                              │
│  JSON to client                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database changes

### Migration: `drizzle/migrations/0007_pgvector_embeddings.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE companies
  ADD COLUMN embedding              vector(768),
  ADD COLUMN embedding_generated_at timestamptz,
  ADD COLUMN embedding_source_hash  text;

ALTER TABLE tenders
  ADD COLUMN embedding              vector(768),
  ADD COLUMN embedding_generated_at timestamptz,
  ADD COLUMN embedding_source_hash  text;

CREATE INDEX tenders_embedding_hnsw_idx
  ON tenders   USING hnsw (embedding vector_cosine_ops);

CREATE INDEX companies_embedding_hnsw_idx
  ON companies USING hnsw (embedding vector_cosine_ops);
```

### Docker image

`docker-compose.yml` swapped `postgres:18` → `pgvector/pgvector:pg18` (drop-in
replacement, existing data volume reused).

### Drizzle schema

A `customType<number[]>` wraps `vector(N)` so Drizzle treats embeddings as
typed `number[]` columns. Reads/writes for vector ops still use raw SQL via
`sql\`\`` templates, but selecting the column elsewhere stays type-safe.

---

## 6. Code surface

| Layer | File | Responsibility |
|---|---|---|
| **Migration** | `drizzle/migrations/0007_pgvector_embeddings.sql` | Extension + columns + HNSW indexes |
| **Schema** | `lib/db/schema/app.ts` | `customType` for `vector(768)`, columns on `companies` & `tenders` |
| **Embedder** | `lib/ai/embeddings.ts` | Ollama `/api/embed` wrapper; default `qwen3-embedding:0.6b` @ 768d (MRL). `MATCHING_MODEL` is separate (chat/LLM scoring). |
| **Service** | `lib/services/embeddingService.ts` | `buildCompanySource`, `buildTenderSource`, `embedCompany`, `embedTender`, `embedQuery`. Hash-based dedupe via `embedding_source_hash` |
| **Matcher** | `lib/services/basicMatchingService.ts` | Three raw-SQL functions: `basicMatchTendersForCompany`, `basicMatchCompaniesForTender`, `basicMatchTendersForQuery`. Cosine distance + band thresholds. |
| **Queue** | `lib/services/queueService.ts`, `jobProcessor.ts` | New `compute_embedding` job type (for async re-embeds) |
| **API** | `app/api/basic-match/route.ts` | Auth-gated POST, Zod discriminated union over the three modes |
| **API client** | `lib/api/client.ts` | Typed `api.basicMatch(...)` for the frontend |
| **User UI** | `app/(protected)/matches/page.tsx` | Logged-in user sees matches for their selected org |
| **Admin UI** | `app/(protected)/admin/basic-match/page.tsx` | Diagnostic page with all 3 modes, latency badge |
| **Sidebar** | `components/layout/Sidenav.tsx` + `messages/en.json` | Adds "Matches" (user) and "Basic Match" (admin) entries |
| **Backfill** | `scripts/backfill-embeddings.ts` (`npm run embed:backfill`) | Idempotent one-shot embedder for any missing/stale rows |
| **Bulk import** | `scripts/import-uk-tenders.mjs` | Paginates the real UK Find-a-Tender API; auto-embeds via existing hook |

### Hook points (write-side)

- `app/api/onboarding/update-step/route.ts` — embed sync after `createCompany()`
- `app/api/companies/[companyId]/route.ts` (PUT) — embed sync when any embed-source field changes
- `app/api/fetch-uk-tenders/route.ts` — embed sync after batch insert (concurrency 4)

All hooks are wrapped in `try/catch`; an Ollama failure logs and continues —
embeddings never block a user-facing write.

---

## 7. Coverage matrix (what auto-embeds, what doesn't)

### Works automatically

| Scenario | Status |
|---|---|
| Existing seed companies (10) | Embedded via initial backfill |
| Existing 1,820 tenders from the UK feed | Auto-embedded by import hook |
| Existing user signs in → `/matches` | Instant matches |
| Existing user **edits** their company (description, capabilities, etc.) | Re-embeds synchronously on PUT |
| New user signs up + onboards | Embeds during onboarding (basic fields only initially) |
| New user later edits their company | Re-embeds on PUT |
| New tenders pulled via `/api/fetch-uk-tenders` | Auto-embedded on import |

### NOT auto-hooked (known gaps)

These paths insert rows but **without an embedding** — they'll silently miss
basic-match results until backfilled. Easy 3-line additions; left out of the
spike to minimise blast radius.

- `app/api/admin/companies/import/route.ts` — admin bulk company import
- `app/api/admin/companies/route.ts` — admin manual company create
- `app/api/company/create-or-join/route.ts` — alternative create flow
- `app/api/onboarding/company-profile/route.ts` — secondary onboarding endpoint
- `app/api/fetch-ted-tenders/route.ts` — TED (EU) tender feed

### The safety net

```bash
npm run embed:backfill                  # embed anything NULL
FORCE=1 npm run embed:backfill          # rebuild every row
ENTITY=tenders npm run embed:backfill   # only one type
LIMIT=50 npm run embed:backfill         # cap for smoke tests
```

Idempotent — short-circuits via `embedding_source_hash` (~3&nbsp;ms per row when
unchanged, ~17&nbsp;ms when re-embedding). Can run as a nightly job.

---

## 8. Operating it

### Local prerequisites

```bash
# 1. Ollama with the embed model (not the chat model used for benchmarks)
ollama pull qwen3-embedding:0.6b

# 2. Postgres with pgvector
docker compose up -d                             # uses pgvector/pgvector:pg18
npm run db:migrate                               # idempotent

# 3. Embed existing data
npm run embed:backfill
```

### Verification

```bash
docker exec tndrx-postgres psql -U postgres -d tndrx -c \
  "SELECT
     (SELECT COUNT(*) FROM companies) AS companies,
     (SELECT COUNT(*) FROM companies WHERE embedding IS NOT NULL) AS c_embedded,
     (SELECT COUNT(*) FROM tenders)   AS tenders,
     (SELECT COUNT(*) FROM tenders   WHERE embedding IS NOT NULL) AS t_embedded;"
```

### Bulk-importing real UK tenders

```bash
# 10 pages × 100 = up to 1,000 real UK gov tenders, auto-embedded
PAGES=10 DAYS_BACK=60 node scripts/import-uk-tenders.mjs

# 365-day window with built-in 429 retry / pacing
PAGES=50 DAYS_BACK=365 node scripts/import-uk-tenders.mjs
```

### Troubleshooting

| Symptom | Diagnose | Fix |
|---|---|---|
| `/matches` returns empty results | `SELECT embedding IS NULL ...` for that company | `npm run embed:backfill` |
| Embedding fails on save | Ollama down or wrong model? | `ollama serve` + `ollama list \| grep qwen3-embedding` |
| Match results look random | HNSW corrupted or wrong column dim | `REINDEX INDEX tenders_embedding_hnsw_idx;` |
| 400 from `fetch-uk-tenders` on page 2+ | Upstream cursor with mismatched date range | Already fixed — script decodes the cursor and forwards `updatedFrom` + `updatedTo` |
| 429 from upstream during bulk import | OK — built-in 30 s backoff + retry | Just wait; script auto-resumes |

---

## 9. Performance characteristics

Measured locally on an M4 Max with 1,820 tenders + 10 companies:

| Operation | Median | P95 |
|---|---|---|
| Single tender embedding (Ollama HTTP) | 17 ms | 35 ms |
| Single company embedding | 18 ms | 40 ms |
| Backfill, 30 rows (warm) | ~0.5 s | – |
| `basicMatchTendersForCompany`, top-50 | ~25 ms | ~50 ms |
| `basicMatchTendersForQuery`, top-50 (includes 1 embed) | ~45 ms | ~80 ms |
| End-to-end `/matches` first paint after company edit | ~120 ms | – |

For comparison: the previous LLM matcher averaged ~5&nbsp;s per pair, so a
company × 50 tenders shortlist is **~250&nbsp;s vs ~25&nbsp;ms** — a 10,000× speedup
for the shortlisting step.

---

## 10. Scaling and the prod story

### Local → Vercel

Production has no GPU and limited cold-start budget, so Ollama isn't an
option. The migration is mechanical:

1. **Embedder.** Replace the `fetch` call in `lib/ai/embeddings.ts` with the
   Vercel AI SDK's `@ai-sdk/openai` embeddings (`text-embedding-3-small` is
   $0.02 / 1M tokens, 1536 dims).
2. **Dimension.** Change `EMBEDDING_DIM` (768 → 1536) and re-issue the
   migration: `ALTER TABLE … ALTER COLUMN embedding TYPE vector(1536)`.
3. **Backfill.** `FORCE=1 npm run embed:backfill` runs once on prod data.
4. **Matching service code does not change.**

Cost at 100k tenders + 10k companies + 1k searches/day:

- One-time embed: 110k × ~200 tokens × $0.02/1M = **$0.44 one-time**
- Steady-state re-embed (10% changes/day): ~$0.04/day
- Search embed (1k/day): ~$0.04/day

So ~**$2/month** at meaningful scale.

### Row counts

HNSW scales roughly `O(log n)` for search. On a single Postgres node:

| Tenders | Index size | Search P95 |
|---|---|---|
| 10k | ~30 MB | <40 ms |
| 100k | ~300 MB | <80 ms |
| 1M | ~3 GB | <150 ms |

For >1M rows we'd consider IVFFlat instead of HNSW (lower memory, slightly
worse recall) or a dedicated vector DB.

### Re-embedding fleet

The new `compute_embedding` job type plugs into the existing
`processingQueue` + `jobProcessor` + dev poller pipeline. Production already
has a queue worker on cron — no new infrastructure needed; any change-data-
capture trigger can enqueue jobs and the worker drains them.

---

## 11. What this is **not**

- **Not a replacement for the LLM scorer.** The LLM remains the right tool
  for "explain this specific match in depth." Basic match is the funnel that
  decides which 50 of 100k tenders even reach the LLM.
- **Not a keyword search.** It will surface relevant tenders that share no
  vocabulary with the company description ("schools" ↔ "primary education
  estate"). It will also miss tenders where the embedding model fails — but
  those failures show up as low band, not silent silence.
- **Two Ollama models.** `MATCHING_MODEL` (e.g. `qwen2.5:7b`) is for deep LLM
  scoring; `OLLAMA_EMBED_MODEL` (default `qwen3-embedding:0.6b`) is for Basic
  Match vectors. Do not point the embedder at a chat model.
- **Not personalised.** Two users at the same company see the same matches.
  Personalisation would happen in a later re-rank stage, not here.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **Embedding** | A fixed-length numeric vector representing the meaning of a piece of text. Similar text → nearby vectors. |
| **Cosine distance** | Angle-based distance metric for vectors. `0` = identical direction, `1` = orthogonal, `2` = opposite. We invert it: `similarity = 1 - distance ∈ [0, 1]`. |
| **HNSW** | Hierarchical Navigable Small World — graph-based approximate-nearest-neighbour index. Sub-linear search, very high recall. |
| **pgvector** | PostgreSQL extension that adds `vector` type, distance operators, and HNSW/IVFFlat indexes. |
| **Bi-encoder** | Architecture where the query and the document are encoded independently into the same vector space, enabling pre-computed indexing. |
| **Cross-encoder** | Architecture where the (query, document) pair is jointly encoded — much more accurate, much more expensive — what the existing LLM scorer effectively does. |
| **Retrieve-and-rerank** | Two-stage pipeline: cheap bi-encoder retrieval for recall, expensive cross-encoder / LLM for precision on the shortlist. The architecture we now have. |
| **Basic match** | This project's internal term for the bi-encoder retrieval stage. |

---

## 13. Live demo script (team presentation)

**Before the call**

```bash
docker compose up -d
ollama list | grep qwen3-embedding    # must be present (separate from qwen2.5 chat)
npm run embed:backfill                # after fresh seed / import
npm run dev
```

Log in as superadmin (`admin@tndrx.dev` from local seed) and open **Admin → Basic Match**.

**Strong paths (use these on stage)**

| Story | Where | What to click |
| --- | --- | --- |
| Construction / demolition | Admin → Basic Match → Company → Tenders | Demo pick **ClearSite Demolition Ltd** |
| Surveying | Same tab | Demo pick **PrecisionPoint Surveying Ltd** |
| Free-text “Google for tenders” | Free-text tab | Demo query **demolition of high-rise buildings UK** |
| Education / venture builder signup | User **Matches** page | Company **Hazy test** after onboarding — education tenders should rank above generic construction noise |

Company → tender mode uses **competency-aware re-ranking**: profile competencies from `company_capabilities` are embedded into the company vector and used to boost / penalise candidates (e.g. construction tenders sink when the profile has no construction competencies).

After switching embed models, run `FORCE=1 npm run embed:backfill` — vectors are not compatible across models.

**Weaker path (avoid as the opener)** — A brand-new company with only a website URL and no competencies selected yet. Run **Re-analyze** on the company page, then **Refresh** on Matches.

---

## 14. Improving Basic Match accuracy

Implemented levers (all on by default unless env disables):

| Lever | What it does |
| --- | --- |
| **Richer embed text** | Company/tender competencies as names; tender budget + deadline; Qwen task instructions |
| **Structural fusion** | Blends vector (50%), CPV division (15%), EIC taxonomy overlap (15%), location (10%), competency hit (+8%) |
| **Taxonomy SQL filter** | If the company has EIC taxonomies, only tenders sharing ≥1 taxonomy enter the candidate pool |
| **Domain penalties** | Construction/demolition/surveying tenders penalised when profile lacks those domains |
| **Optional LLM rerank** | `BASIC_MATCH_LLM_RERANK=1` re-scores top 12 with `OLLAMA_RERANK_MODEL` (slow) |
| **Stronger embedder** | `OLLAMA_EMBED_MODEL=qwen3-embedding:4b` (keep `OLLAMA_EMBED_DIM=768`) |

After changing embed text or model:

```bash
FORCE=1 npm run embed:backfill
npm run bench:matching:retrieval
```

Env toggles: `BASIC_MATCH_STRUCTURAL=0`, `BASIC_MATCH_REQUIRE_TAXONOMY=0`, `OLLAMA_EMBED_INSTRUCTIONS=0`.

---

## 15. Open questions / future work

1. **Dedicated Qwen reranker model** when Ollama ships stable `qwen3-reranker` pulls.
2. **Re-rank on click.** When a user opens a basic match, run the existing LLM
   scorer on just that pair and persist the result. Best of both worlds:
   instant browsing + deep explanations on demand.
3. **Personalisation.** Track which matches a user opens / dismisses, learn a
   per-user adjustment vector.
4. **Drift monitoring.** Track band distribution over time; alert if it
   shifts (could indicate stale embeddings or model drift).
5. **Multilingual support** for TED ingestion (see §11).
6. **Explicit company CPV codes** instead of inferring divisions from text.

---

*Last updated: 2026-06-01.*
