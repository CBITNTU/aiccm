# Deployment profiles — inference + team setup

How to run TNDRX with **your own models**. The Next.js app (Vercel) is the
**app plane**; models run on a separate **inference service** you deploy once
for the whole team.

```
┌──────────────────────────────────────────────────────────────┐
│ App plane — Vercel (per PR preview / prod)                   │
│  Next.js → lib/ai/embeddings.ts → lib/ai/models.ts           │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS + INFERENCE_API_KEY
┌────────────────────────────▼─────────────────────────────────┐
│ Inference plane — always-on service (deploy once)            │
│  infra/inference — Ollama on VPS / Fly / Oracle Free         │
│  qwen3-embedding:0.6b  +  qwen2.5:7b                         │
└──────────────────────────────────────────────────────────────┘
```

**Deploy the inference service:** `infra/inference/README.md`  
**Compare hosting providers:** `docs/inference-hosting-options.md`

---

## Region / whitelabel profile (`DEPLOYMENT_PROFILE`)

The app ships one codebase that deploys as differently-branded, region-specific
versions. The active region is selected at deploy time:

```bash
DEPLOYMENT_PROFILE=uk   # uk (default) | cn | th
```

**One region per deployment** — this is intentional. Branding, locale, currency,
geocoding, AI defaults and enabled tender sources all switch together, so a single
instance serves exactly one region. Run a separate deployment per region (each with
its own `DEPLOYMENT_PROFILE`); the nightly tender-sync cron on each instance fetches
only that region's sources via `getAdaptersForProfile()`.

This is resolved once at process start (`lib/deployment/`) and drives:

| Concern | Where | UK | CN (stub) | TH (stub) |
|---|---|---|---|---|
| Brand name / support / logo / favicon | `brand` | TNDRX | TNDRX 中国 | TNDRX Thailand |
| Theme palette | `theme` (overrides `globals.css`) | blue (default) | red | teal |
| Default + allowed locales | `i18n` | en | zh-CN | th |
| Currency | `currency` | GBP £ | CNY ¥ | THB ฿ |
| Tender sources | `tenderSources` → `lib/tenders/registry` | Find a Tender + TED | Shanghai (zbycg.com) + manual | manual |
| Company verification | `verificationProvider` → `lib/companies/registry` | Companies House + Endole | manual | manual |
| Taxonomy (CPV/EIC provider) | `taxonomy` → `lib/taxonomy` | CPV/EIC | stub (neutral) | stub (neutral) |
| Taxonomy language (markets/standards/competencies) | `taxonomyLanguage` → `lib/taxonomy/localizedName` | en | zh-CN | en |
| Geocoding | `geocodingProvider` | Google | none (blocked in CN) | Google |
| AI default model | `ai.defaultModel` (seed for `platform_settings`) | gpt-5-nano | deepseek-v4-flash | gpt-5-nano |
| Web analytics | `webAnalytics` → `app/layout.tsx` | Vercel Web Analytics (prod only) | off | off |

**Web analytics:** only the UK project (`aiccm`) has Vercel Web Analytics enabled
in the dashboard, so only the `uk` profile sets `webAnalytics: true`. The root
layout renders `<Analytics />` via `isWebAnalyticsEnabled()`, which additionally
requires `VERCEL_ENV=production` — preview deploys and local dev report nothing.
Turning it on for another region means both flipping the profile flag *and*
enabling Analytics on that region's Vercel project.

**Adding a region's source/verification later:** implement a `TenderSourceAdapter`
(`lib/tenders/adapters/`) and/or `CompanyRegistryAdapter`
(`lib/companies/registry/adapters/`), register it, and reference its id from the
profile in `lib/deployment/profiles/`. No core code changes required. `PLATFORM_NAME`
/ `PLATFORM_URL` env vars still override the profile brand when set.

**China / Shanghai source (reference implementation):** the `cn` profile now enables
`shanghai_zbycg` — an adapter (`lib/tenders/adapters/shanghai.ts`) that scrapes the
public Shanghai listing on 招标与采购网 (zbycg.com) and enriches each notice from its
detail page (project number, budget, buyer, requirement text; no login required). It
is wired into the CN profile only, so it never runs for UK/EU. The daily
`/api/admin/tender-sync` picks it up automatically via `getAdaptersForProfile()`, and
the admin import UI (`components/admin/AdminTenderImport.tsx`) shows a Shanghai import
tab on CN deployments (Find a Tender + TED elsewhere) using `DEPLOYMENT_PROFILE`.
`cn_manual` remains registered for admin-entered notices from other Chinese regions.

**Bilingual reference taxonomies (markets / standards / competencies):** these three
reference trees are seeded from the bilingual CSVs in `docs/taxonomy_cn/`, storing both
`name` (English) and `name_zh` (Simplified Chinese) per row. The active deployment's
`taxonomyLanguage` decides which is surfaced — everywhere, both in the web UI and in the
AI prompts/embeddings — via `localizedName()` in `lib/taxonomy/localizedName.ts` (a
`zh-CN` deployment falls back to English when a translation is blank). To regenerate the
seed SQL after editing the CSVs, run `node scripts/generate-taxonomy-seeds.mjs` (row IDs
are deterministic UUIDv5 keyed on the English path, so unchanged rows keep stable IDs).
Apply with `npm run db:seed-ref` on a fresh DB, or
`node scripts/reseed-taxonomy-with-remap.mjs` on a live DB to preserve existing company
selections across the reseed. The EIC/CPV `taxonomy` provider above is a separate system
and stays English.

## Environment variables (app / Vercel)

| Variable | Purpose | Example |
|---|---|---|
| `EMBED_PROVIDER` | `ollama` \| `openai` \| `openai-compatible` | `ollama` |
| `EMBED_MODEL` | Embedding model | `qwen3-embedding:0.6b` |
| `EMBED_DIM` | Vector width (must match DB schema) | `1536` |
| `EMBED_BASE_URL` | Ollama origin (no `/v1`) | `https://inference.example.com` |
| `INFERENCE_BASE_URL` | Chat LLM `/v1` base | `https://inference.example.com/v1` |
| `INFERENCE_API_KEY` | Bearer token for hosted Ollama | shared secret |
| `EMBED_API_KEY` | Same as above (embed calls) | shared secret |
| `MATCHING_MODEL` | Deep LLM scorer | `ollama/qwen2.5:7b` |

Legacy `OLLAMA_*` vars still work for solo local dev.

**Health check:** `GET /api/admin/inference/health` (superadmin).

---

---

## Default behaviour (release vs local dev)

**Basic Match is always on** — every match screen shows instant semantic results
by default. Deep research (LLM scoring) is optional and queues on demand.

| Environment | Embeddings | Deep research LLM |
|---|---|---|
| **Vercel release** | Hosted `INFERENCE_BASE_URL` **or** OpenAI fallback (`OPENAI_API_KEY`) | Platform OpenAI (or configured model) — never localhost |
| **Local dev** | Ollama at `127.0.0.1:11434` when running | Optional: `MATCHING_MODEL=ollama/qwen2.5:7b` for fun |

Production **never** calls localhost for embeddings. Local Ollama is dev-only.

When a user runs **deep research** on a tender, tender-level AI summary,
taxonomy, and embedding are cached on the shared `tenders` row — all users
benefit on the next run (no re-scrape).

---

## Profile A — Solo local dev (optional)

Only when working offline or without the shared service. Each dev runs Ollama
on their own machine.

```bash
EMBED_PROVIDER=ollama
EMBED_BASE_URL=http://127.0.0.1:11434
INFERENCE_BASE_URL=http://127.0.0.1:11434/v1
MATCHING_MODEL=ollama/qwen2.5:7b
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/tndrx
```

```bash
brew install ollama && ollama serve
ollama pull qwen3-embedding:0.6b && ollama pull qwen2.5:7b
npm run docker:up && npm run db:migrate && npm run embed:backfill
npm run dev
```

---

## Profile B — Team + Vercel (recommended): hosted inference service

**One always-on cloud service** — all developers and all Vercel previews point
at the same URL. No laptop needs to stay on.

### Step 1 — Deploy inference (once)

Use the stack in `infra/inference/`:

```bash
cp infra/inference/.env.example infra/inference/.env
# Set INFERENCE_API_KEY to a long random string

docker compose -f infra/inference/docker-compose.yml up -d
docker compose -f infra/inference/docker-compose.yml --profile bootstrap run --rm bootstrap
```

On a **cloud VPS**, same commands after installing Docker. See
`infra/inference/README.md` for Oracle Free ($0), Hetzner (~€7/mo), or Fly.io.

Put HTTPS in front (Caddy / nginx + Let’s Encrypt). Example public URL:
`https://inference.tndrx.dev`

### Step 2 — Wire Vercel (Preview + Production)

```bash
EMBED_PROVIDER=ollama
EMBED_BASE_URL=https://inference.tndrx.dev
INFERENCE_BASE_URL=https://inference.tndrx.dev/v1
INFERENCE_API_KEY=<same secret as inference server>
EMBED_API_KEY=<same secret>
EMBED_MODEL=qwen3-embedding:0.6b
EMBED_DIM=1536
MATCHING_MODEL=ollama/qwen2.5:7b
DATABASE_URL=postgresql://…          # Neon / Supabase with pgvector
BETTER_AUTH_SECRET=…
BETTER_AUTH_URL=https://your-app.vercel.app
```

### Step 3 — Wire each developer’s `.env.local`

Same inference URL as Vercel — everyone hits the **service**, not localhost:

```bash
EMBED_BASE_URL=https://inference.tndrx.dev
INFERENCE_BASE_URL=https://inference.tndrx.dev/v1
INFERENCE_API_KEY=<team secret>
DATABASE_URL=postgresql://…          # local Docker or shared Neon
```

### Step 4 — Database + backfill

```bash
DATABASE_URL=… npm run db:migrate
DATABASE_URL=… npm run embed:backfill
```

---

## Subscriptions for a 3–4 person dev team

| Service | Tier | Cost | Role |
|---|---|---|---|
| **Inference VPS** | Oracle Always Free **or** Hetzner CX32 | **$0–€7/mo** | Always-on Ollama (your models) |
| **Vercel** | Hobby | **$0** | App + PR previews |
| **GitHub** | Free | **$0** | Repo |
| **Neon / Supabase** | Free | **$0** | Shared Postgres + pgvector |
| **Resend** | Free | **$0** | Auth email (100/day) |
| **Domain** | Optional | ~€10/yr | `inference.yourdomain.com` |

**Typical team cost: $0–€8/month** — one small VPS (or Oracle free) + free
Vercel/DB tiers. No OpenAI required.

### Inference hosting comparison

Full matrix (15+ options): **`docs/inference-hosting-options.md`**

| Provider | Monthly cost | RAM | Best for |
|---|---|---|---|
| **Oracle Cloud Always Free** | **$0** | up to 24 GB | Budget-conscious team; OK with setup friction |
| **Hetzner CX32** | **~€7** | 8 GB | Simplest reliable path |
| **DigitalOcean / Vultr** | **~$12–24** | 8 GB | Familiar PaaS-adjacent VPS |
| **Fly.io** (8 GB machine) | **~$30–60** | 8 GB | Managed deploys, higher cost |
| **Railway / Render** | **~$10–25+** | varies | Fast experiment; watch RAM |
| **Together / Fireworks / HF** | Usage | managed | No VM; open-model APIs |
| **RunPod / Modal** | Per second | GPU | Batch LLM or hybrid, not 24/7 embed |

Embeddings run fine on **CPU** — you do not need a GPU for Basic Match.
GPU only helps deep LLM scoring speed.

### Database (pgvector)

| Provider | Free tier | pgvector |
|---|---|---|
| **Neon** | Yes | ✅ |
| **Supabase** | Yes | ✅ enable `vector` extension |
| **Local Docker** | Yes | ✅ `npm run docker:up` |

Use **one shared Neon/Supabase project** for the team’s preview environment.

---

## Profile C — OpenAI embeddings (optional fallback)

Only if you cannot run the inference service. Not “own models”.

```bash
EMBED_PROVIDER=openai
EMBED_MODEL=text-embedding-3-small
EMBED_DIM=1536
OPENAI_API_KEY=sk-…
```

Switching provider requires `FORCE=1 npm run embed:backfill`.

---

## Profile D — Whitelabel customer

Customer deploys `infra/inference` (or vLLM) on **their** cloud and sets env
on **their** Vercel project:

```bash
EMBED_PROVIDER=ollama
EMBED_BASE_URL=https://llm.customer.example
INFERENCE_BASE_URL=https://llm.customer.example/v1
INFERENCE_API_KEY=customer-secret
MATCHING_MODEL=ollama/qwen2.5:7b
PLATFORM_NAME=Customer Tender Platform
```

Same codebase, different inference URL per deployment.

---

## Dimension choice (1536 default)

Production uses **OpenAI `text-embedding-3-small` @ 1536** (`vector(1536)` in Postgres).
Migration `0008_pgvector_embeddings_1536.sql` adds embedding columns at 1536 directly.

Local Ollama dev must use **`EMBED_DIM=1536`** to match the schema (or set `EMBED_PROVIDER=openai`).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Vercel health check fails | Inference URL must be **public HTTPS**; check `INFERENCE_API_KEY` matches |
| 401 from inference | Set `OLLAMA_API_KEY` on server + `INFERENCE_API_KEY` on Vercel |
| `/matches` empty | `npm run embed:backfill` against shared DB |
| LLM scoring slow | Normal on CPU VPS (~5–15 s); add GPU or use smaller chat model |
| Out of memory on VPS | Need ≥8 GB for `qwen2.5:7b`; or use `qwen2.5:3b` |

---

## Quick reference — team stack

```
GitHub → Vercel Hobby (app, free)
              │
              ├── DATABASE_URL → Neon/Supabase free (pgvector)
              │
              └── INFERENCE_BASE_URL → inference.tndrx.dev (Oracle/Hetzner, $0–€7)
                     └── infra/inference/docker-compose.yml
```

*See also: `infra/inference/README.md`, `docs/basic-matching.md`, `.env.local.example`*
