# TNDRX (AICCM)

Construction and consulting tender matching platform — Next.js, PostgreSQL (pgvector), Better-Auth, Drizzle ORM, and AI-powered matching (semantic Basic Match + optional Deep Research).

## Prerequisites

| Dependency | Required | Notes |
|---|---|---|
| **Node.js 20+** | Yes | LTS recommended |
| **npm** | Yes | Comes with Node |
| **Docker** | Yes (local DB) | Runs PostgreSQL with pgvector |
| **Ollama** | Optional locally | Embeddings + local LLM scoring; see [Profile A](#profile-a--full-local-dev-with-ollama) |
| **Vercel account** | For deploy | Hobby tier is enough for previews |
| **Hosted Postgres** | For deploy | Neon or Supabase with **pgvector** enabled |

Optional API keys (features degrade gracefully without them):

- **OpenAI** — platform AI / Deep Research fallback / OpenAI embeddings fallback on Vercel
- **Resend** — signup and auth emails
- **Google Maps** — geocoding for location filters
- **TED API key** — EU tender sync

---

## Local development

### 1. Clone and install

```bash
git clone <repository-url>
cd aiccm
npm install
```

### 2. Environment variables

Copy the example file and edit values:

```bash
cp .env.local.example .env.local
```

**Minimum for local app + auth + database:**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/tndrx
BETTER_AUTH_SECRET=<random-string-at-least-32-chars>
BETTER_AUTH_URL=http://localhost:3000
PLATFORM_URL=http://localhost:3000
PLATFORM_NAME=TNDRX Platform
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

See `.env.local.example` for inference, email, TED, and optional AI provider keys.

### 3. Start PostgreSQL (pgvector)

```bash
npm run docker:up
```

This starts `pgvector/pgvector:pg18` on port **5434** (see `docker-compose.yml`).

### 4. Apply database schema

```bash
npm run db:migrate
```

For a blank local DB with demo users and sample data:

```bash
npm run db:fresh
# or: npm run db:seed   (after migrate, if DB already exists)
```

**Seed logins** (password for all: `password123`):

| Email | Role |
|---|---|
| `admin@tndrx.dev` | superadmin |
| `marios@tndrx.dev` | sme-owner |
| `leytis@tndrx.dev` | sme-owner |

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

In development, a background queue poller processes async jobs automatically (Deep Research, company analysis, etc.) — no cron setup needed locally.

---

## AI / matching setup (local)

**Basic Match** (semantic scores on the Matches tab) is always on. It needs **embeddings** stored in Postgres (`vector(1536)` columns). **Deep Research** (full LLM scoring) is optional and runs via the job queue.

### Profile A — full local dev (with Ollama)

Best when you want Basic Match scores and local LLM Deep Research without cloud inference.

1. Install and run Ollama:

```bash
brew install ollama   # macOS; see https://ollama.com for other OS
ollama serve
ollama pull qwen3-embedding:0.6b
ollama pull qwen2.5:7b
```

2. Add to `.env.local`:

```env
EMBED_PROVIDER=ollama
EMBED_MODEL=qwen3-embedding:0.6b
EMBED_DIM=1536
EMBED_BASE_URL=http://127.0.0.1:11434
INFERENCE_BASE_URL=http://127.0.0.1:11434/v1
MATCHING_MODEL=ollama/qwen2.5:7b
```

3. Backfill embeddings (companies + tenders):

```bash
npm run embed:backfill
```

4. Verify (optional):

```bash
npm run test:ollama
```

Health check: `GET /api/admin/inference/health` (superadmin).

### Profile B — app only (no Ollama)

You can run the UI, auth, and tender browsing without Ollama. Basic Match scores will be **0%** until embeddings exist. Deep Research needs either Ollama locally or `OPENAI_API_KEY` (platform default model).

To use OpenAI embeddings instead of Ollama:

```env
EMBED_PROVIDER=openai
EMBED_MODEL=text-embedding-3-small
EMBED_DIM=1536
OPENAI_API_KEY=sk-…
```

Then run `npm run embed:backfill`.

---

## Useful commands

```bash
# App
npm run dev              # Dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # TypeScript

# Database
npm run docker:up        # Start local Postgres
npm run docker:down      # Stop local Postgres
npm run db:migrate       # Apply Drizzle migrations
npm run db:push          # Push schema directly (dev shortcut)
npm run db:studio        # Drizzle Studio UI
npm run db:seed          # Seed demo data
npm run db:fresh         # Reset + migrate + seed

# Embeddings / matching
npm run embed:backfill   # Generate company + tender embeddings

# Hosted inference stack (same as team VPS — optional local smoke test)
npm run inference:up
npm run inference:bootstrap
```

More detail: [`docs/deployment-profiles.md`](docs/deployment-profiles.md), [`docs/basic-matching.md`](docs/basic-matching.md), [`infra/inference/README.md`](infra/inference/README.md).

---

## Deploying to Vercel

Vercel hosts the **Next.js app only**. Models do **not** run on Vercel — you need a **hosted Postgres** and either a **hosted inference service** or **OpenAI** for embeddings.

### Architecture on Vercel

```
Vercel (Next.js)
    ├── DATABASE_URL  →  Neon / Supabase (pgvector required)
    ├── INFERENCE_BASE_URL  →  your VPS Ollama (recommended)
    │                         or OPENAI_API_KEY (embeddings fallback)
    └── CRON_SECRET  →  Vercel Cron → /api/queue/cron, tender sync
```

### Step 1 — PostgreSQL with pgvector

1. Create a project on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Enable the **vector** extension (Supabase: Database → Extensions → `vector`; Neon: usually available on supported plans).
3. Copy the connection string → `DATABASE_URL`.

Apply migrations **against the production database** (from your machine or CI):

```bash
DATABASE_URL="postgresql://…" npm run db:migrate
DATABASE_URL="postgresql://…" npm run embed:backfill
```

Migration `0008_pgvector_embeddings_1536.sql` adds `vector(1536)` columns and HNSW indexes — required for Basic Match (OpenAI `text-embedding-3-small`). Migration `0007_fix_ted_notice_urls.sql` (from main) fixes legacy TED external links.

### Step 2 — Inference (pick one)

**Option A — Hosted Ollama (recommended, own models)**

Deploy once for the whole team (Oracle Free, Hetzner, Fly, etc.):

```bash
# See infra/inference/README.md
cp infra/inference/.env.example infra/inference/.env
docker compose -f infra/inference/docker-compose.yml up -d
docker compose -f infra/inference/docker-compose.yml --profile bootstrap run --rm bootstrap
```

Put HTTPS in front (Caddy/nginx). Then set on Vercel:

```env
EMBED_PROVIDER=ollama
EMBED_MODEL=qwen3-embedding:0.6b
EMBED_DIM=1536
EMBED_BASE_URL=https://inference.yourdomain.com
INFERENCE_BASE_URL=https://inference.yourdomain.com/v1
INFERENCE_API_KEY=<same secret as inference server>
EMBED_API_KEY=<same secret>
MATCHING_MODEL=ollama/qwen2.5:7b
```

**Option B — OpenAI embeddings (no inference VPS)**

```env
EMBED_PROVIDER=openai
EMBED_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-…
```

Production default (no `EMBED_PROVIDER`): **OpenAI** `text-embedding-3-small` @ **1536** when `OPENAI_API_KEY` is set and no hosted inference URL is configured.

Production **never** calls `localhost` for embeddings. Local Ollama is dev-only.

### Step 3 — Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Preview + Production):

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (pgvector) |
| `BETTER_AUTH_SECRET` | Yes | Auth signing secret (32+ chars) |
| `BETTER_AUTH_URL` | Yes | Public app URL, e.g. `https://your-app.vercel.app` |
| `PLATFORM_URL` | Yes | Same as public app URL |
| `CRON_SECRET` | Yes (prod) | Protects cron + queue worker endpoints |
| `EMBED_*` / `INFERENCE_*` | Yes* | Basic Match + optional local-model Deep Research |
| `OPENAI_API_KEY` | Yes** | Platform AI / Deep Research if not using hosted Ollama |
| `RESEND_API_KEY` | For email | Signup / verification emails |
| `PLATFORM_EMAIL_FROM` | For email | Sender address (verified in Resend) |
| `PLATFORM_NAME` | No | Branding |
| `TENDER_SYNC_SECRET` | Optional | UK/EU tender sync (can match `CRON_SECRET`) |
| `TED_API_KEY` | Optional | EU TED API |
| `GOOGLE_MAPS_API_KEY` | Optional | Geocoding |

\* Use hosted inference **or** OpenAI embeddings — see Step 2.  
\** Required for Deep Research unless `MATCHING_MODEL` points at hosted Ollama.

Generate `CRON_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4 — Cron jobs

Cron schedules are defined in `vercel.json`:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/queue/cron` | Every minute | Process queue, recover stuck jobs |
| `/api/admin/tender-sync` | Daily 02:00 UTC | Scheduled tender import |
| `/api/tenders/close-expired` | Daily 00:00 UTC | Close past-deadline tenders |

Vercel sends `Authorization: Bearer <CRON_SECRET>` in production. **`CRON_SECRET` must be set** or cron routes reject requests.

Note: Vercel Hobby cron has limits; queue processing also self-triggers from the worker when jobs are enqueued.

### Step 5 — Deploy

Connect the GitHub repo in Vercel, or deploy from CLI:

```bash
npm run deploy        # Preview deployment
npm run deploy:prod   # Production
```

After first deploy:

1. Confirm `BETTER_AUTH_URL` matches the live URL (including custom domain).
2. Run `db:migrate` and `embed:backfill` against production `DATABASE_URL` if not done in CI.
3. Check `GET /api/admin/inference/health`.
4. In Vercel → Deployments → **Cron Jobs**, confirm jobs are registered.
5. Test login (Resend must be configured for new signups).

### Vercel checklist

- [ ] Postgres with pgvector + migrations applied
- [ ] Embeddings backfilled (`npm run embed:backfill`)
- [ ] `BETTER_AUTH_URL` / `PLATFORM_URL` = production URL
- [ ] `CRON_SECRET` set
- [ ] Inference URL is **public HTTPS** (not localhost) **or** OpenAI embeddings configured
- [ ] `INFERENCE_API_KEY` matches inference server (if using hosted Ollama)
- [ ] Resend configured for auth emails (if allowing signup)

---

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| Matches tab shows 0% everywhere | Run `npm run embed:backfill`; ensure Ollama/inference is reachable |
| Vercel health check fails | Use public HTTPS inference URL; check API keys match |
| Deep Research never completes | Check queue: dev poller runs locally; prod needs `CRON_SECRET` + cron |
| Auth emails not sent | Set `RESEND_API_KEY` + verified `PLATFORM_EMAIL_FROM` |
| `db:migrate` errors on pgvector | DB must support `vector` extension (use pgvector image locally; enable on Neon/Supabase) |
| Login redirect loops | `BETTER_AUTH_URL` must exactly match the browser URL |

---

## Project structure

```
app/                # Next.js App Router (pages + API routes)
├── (protected)/    # Authenticated pages
├── api/            # REST endpoints (auth, matching, queue, tenders)
components/         # UI (shadcn/ui)
hooks/              # TanStack Query hooks
lib/                # DB, auth, AI, services
drizzle/            # SQL migrations
infra/inference/    # Hosted Ollama Docker stack
docs/               # Deployment and matching guides
```

---

## Further reading

- [`docs/deployment-profiles.md`](docs/deployment-profiles.md) — team setup, cost estimates, env matrix
- [`docs/inference-hosting-options.md`](docs/inference-hosting-options.md) — VPS provider comparison
- [`infra/inference/README.md`](infra/inference/README.md) — deploy the inference service
- [`docs/basic-matching.md`](docs/basic-matching.md) — how Basic Match works
- [`CLAUDE.md`](CLAUDE.md) — architecture notes for contributors
- [`.env.local.example`](.env.local.example) — full env reference
- [`docs/ted-notice-links.md`](docs/ted-notice-links.md) — TED URL backfill (migration `0007`)
