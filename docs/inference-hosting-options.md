# Where to run inference models

TNDRX stack that **stays fixed**:

| Layer | Service | Role |
|---|---|---|
| App | **Vercel** | Next.js, API routes, cron |
| Database | **Supabase** (Postgres) | Data + **pgvector** embeddings |
| Source | **GitHub** | Repo, PRs, CI |

This doc covers only the **inference plane** — where `qwen3-embedding` and
`qwen2.5:7b` (or equivalents) run. The app calls it over HTTPS via
`INFERENCE_BASE_URL` / `EMBED_BASE_URL` (see `docs/deployment-profiles.md`).

---

## Decision lens

| Question | Implication |
|---|---|
| Must it be **your exact Ollama models**? | Need Ollama, vLLM, or OpenAI-compatible self-host |
| OK with **hosted open models** (same family, not your VM)? | Fireworks, Together, Groq, HF Endpoints — less ops |
| **Always-on** vs **cold start OK**? | Embeds on write need warm service; search is SQL-only |
| **CPU enough?** | Yes for embeddings; 7B LLM scoring is slow but works on CPU |
| **GPU needed?** | Only if you want fast deep LLM scoring (<2 s per pair) |

---

## Tier 1 — Best fit for a 3–4 dev team (own models, low cost)

### 1. Hetzner Cloud VPS (recommended paid default)

| | |
|---|---|
| **Cost** | ~€4–8/mo (CX22–CX32, 4–8 GB RAM) |
| **Models** | Full Ollama — your `infra/inference/docker-compose.yml` |
| **Pros** | Simple, predictable, EU regions, Docker as documented |
| **Cons** | You manage OS updates, TLS (Caddy), backups |

**Fit:** Team wants a real service, ~€7/mo is fine, minimal surprise bills.

---

### 2. Oracle Cloud Always Free

| | |
|---|---|
| **Cost** | **$0** (Ampere A1: up to 4 OCPU, 24 GB RAM) |
| **Models** | Full Ollama |
| **Pros** | Enough RAM for 7B + embed; always free if you keep in free tier |
| **Cons** | Signup/capacity pain; account hygiene required |

**Fit:** Budget = zero, someone can spend an afternoon on Oracle setup.

---

### 3. DigitalOcean Droplet / Vultr / Linode (Akamai)

| | |
|---|---|
| **Cost** | ~$6–12/mo (4 GB) — $12–24/mo (8 GB) |
| **Models** | Full Ollama via same Docker compose |
| **Pros** | Familiar UI, good docs, many regions |
| **Cons** | Slightly pricier than Hetzner for same spec |

**Fit:** Team already has DO/Vultr credits or preference.

---

### 4. Contabo VPS

| | |
|---|---|
| **Cost** | ~€5–7/mo (8–16 GB RAM) |
| **Models** | Full Ollama |
| **Pros** | Very cheap RAM |
| **Cons** | Variable performance; support reputation mixed |

**Fit:** Maximum RAM per euro for CPU inference.

---

## Tier 2 — Managed containers (less server admin)

### 5. Fly.io

| | |
|---|---|
| **Cost** | ~$30–60/mo for **8 GB always-on** machine |
| **Models** | Ollama image + volume (`infra/inference/fly.toml`) |
| **Pros** | TLS, deploys from Git, global regions |
| **Cons** | Expensive vs VPS for 24/7 8 GB |

**Fit:** You value `fly deploy` over SSH and accept higher cost.

---

### 6. Railway

| | |
|---|---|
| **Cost** | ~$5–20/mo usage-based (8 GB sustained adds up) |
| **Models** | Docker deploy of Ollama |
| **Pros** | Fast setup, GitHub integration |
| **Cons** | Pricing less predictable; sleep/cost on idle varies by plan |

**Fit:** Quick experiment; watch the usage dashboard.

---

### 7. Render

| | |
|---|---|
| **Cost** | ~$7/mo (512 MB) — **not enough**; need larger instance ~$25+ |
| **Models** | Docker Web Service |
| **Pros** | Simple PaaS |
| **Cons** | Right-sized RAM for 7B is costly |

**Fit:** Only if you embed-only on Render and use external API for LLM scoring.

---

### 8. Northflank

| | |
|---|---|
| **Cost** | Usage-based; comparable to Railway/Fly |
| **Models** | Docker / compose stacks |
| **Pros** | Good for multi-service (inference + future workers) |
| **Cons** | Another platform to learn |

**Fit:** Teams already on Northflank for other services.

---

### 9. Google Cloud Run (always-on min instances)

| | |
|---|---|
| **Cost** | ~$20–50+/mo with min instances + 4–8 GB |
| **Models** | Ollama container; **not ideal** (scale-to-zero cold starts) |
| **Pros** | GCP billing, IAM |
| **Cons** | Cold starts bad for embed-on-save; always-on defeats serverless savings |

**Fit:** Company standard is GCP; use **GCE VM** instead of Cloud Run for Ollama.

---

### 10. AWS EC2 / Lightsail

| | |
|---|---|
| **Cost** | Lightsail ~$10/mo (2 GB) — too small; **$20–40/mo** for 8 GB class |
| **Models** | Full Ollama on Ubuntu |
| **Pros** | Enterprise, VPC peering options |
| **Cons** | Heavier ops than Hetzner |

**Fit:** Existing AWS org / compliance requirements.

---

## Tier 3 — GPU / serverless inference (pay per use)

Good when **deep LLM scoring** volume is spiky, not for 24/7 embed-on-every-save
unless you split embed (CPU service) from LLM (GPU serverless).

### 11. RunPod (Pod or Serverless)

| | |
|---|---|
| **Cost** | GPU ~$0.20–0.50/hr; serverless per second |
| **Models** | Ollama / vLLM templates |
| **Pros** | Fast LLM; scale to zero on serverless |
| **Cons** | Cold starts; embed API better on cheap CPU VPS |

**Fit:** Hybrid — **Hetzner for embeds**, RunPod serverless for batch LLM scoring.

---

### 12. Modal

| | |
|---|---|
| **Cost** | Free credits, then pay-per-second GPU/CPU |
| **Models** | Custom containers; pull Ollama or run transformers |
| **Pros** | Great for batch jobs (`embed:backfill`, benchmarks) |
| **Cons** | Not ideal as low-latency always-on embed API |

**Fit:** Nightly backfill / benchmark CI, not primary embed path.

---

### 13. Replicate

| | |
|---|---|
| **Cost** | Per-run pricing |
| **Models** | Published models; custom Cog deployments |
| **Pros** | Zero infra |
| **Cons** | Less control; not identical to your local Ollama stack |

**Fit:** Prototype before committing to VPS.

---

### 14. Hugging Face Inference Endpoints

| | |
|---|---|
| **Cost** | ~$0.033/hr+ for CPU; GPU more |
| **Models** | Deploy `Qwen` embed + chat from HF hub |
| **Pros** | Managed, autoscale, OpenAI-compatible option |
| **Cons** | Model versioning differs from Ollama tags |

**Fit:** “Own open-weights models” without running Ollama yourself.

---

## Tier 4 — Managed open-model APIs (minimal ops, not your VM)

Same **API shape** (`openai-compatible` provider) — whitelabel customers might
still choose these.

| Provider | Embed / search | Chat / scoring | Free tier | Notes |
|---|---|---|---|---|
| **Together.ai** | ✅ | ✅ Qwen, Llama | Credits | Fast; good dev starter |
| **Fireworks.ai** | ✅ | ✅ | Credits | Strong open-model catalog |
| **Groq** | Limited | ✅ very fast | Free tier | Great for chat; check embed support |
| **OpenAI** | ✅ | ✅ | Trial/paid | Fallback only if not “own models” |
| **DeepSeek API** | — | ✅ cheap | Paid | You already have SDK wired |

Configure:

```bash
EMBED_PROVIDER=openai-compatible
EMBED_BASE_URL=https://api.together.xyz/v1
EMBED_MODEL=...   # per provider catalog
INFERENCE_BASE_URL=https://api.together.xyz/v1
MATCHING_MODEL=... # provider-specific id
EMBED_API_KEY=...
```

**Trade-off:** No Ollama VM, but **not** the same as self-hosted Qwen tags;
re-embed if you switch providers.

---

## Tier 5 — Does NOT work (with this stack)

| Option | Why not |
|---|---|
| **Vercel** | No GPU, no long-running Ollama, function timeouts |
| **Supabase Edge Functions** | No model runtime; tiny CPU/memory limits |
| **GitHub Actions** | Ephemeral; not an inference API |
| **Cloudflare Workers AI** | Fixed model catalog; not your Ollama pull |
| **Vercel AI Gateway alone** | Routes to providers; doesn’t host your weights |

Supabase **Postgres** stores vectors; it does **not** run embedding inference.

---

## Recommended architectures (keeping Vercel + Supabase + GitHub)

### A — “Own models, cheapest service” (default recommendation)

```
GitHub → Vercel (app)
              ↓ DATABASE_URL
         Supabase (pgvector)
              ↓ HTTPS embed + LLM
         Hetzner CX32 (~€7/mo) — infra/inference Ollama
```

All devs + previews use `https://inference.yourdomain.com`.

---

### B — “Zero VM ops, still open models”

```
Vercel → Together / Fireworks / HF Endpoints (API keys in Vercel env)
Supabase ← pgvector (same)
```

Fastest to production; ongoing API cost; vendor lock-in on model IDs.

---

### C — “Hybrid” (best cost/performance at scale)

```
Embeds (hot path):     Hetzner CPU Ollama — always on, cheap
Deep LLM (cold path):  RunPod serverless OR Together — on demand only
Basic Match search:    Supabase pgvector only — no inference call
```

Matches how the product is built: Basic Match = SQL; LLM = optional deep score.

---

### D — “Whitelabel customer”

Each customer picks one row from this doc; same TNDRX build, different env:

```bash
INFERENCE_BASE_URL=https://their-choice.example/v1
```

Document profiles in customer onboarding — no code fork.

---

## Cost snapshot (monthly, rough, 3–4 devs)

| Option | Est. cost | Own Ollama? | Ops effort |
|---|---|---|---|
| Oracle Always Free | **$0** | ✅ | Medium |
| Hetzner CX32 | **€7** | ✅ | Low |
| Contabo 8 GB | **€5–7** | ✅ | Low |
| Fly.io 8 GB | **$30–60** | ✅ | Low |
| Railway Docker | **$10–25** | ✅ | Low |
| Together/Fireworks | **$5–50** usage | ❌ API | Minimal |
| RunPod GPU 24/7 | **$150+** | ✅ | Medium |

Embeddings are cheap on CPU — **don’t pay for GPU 24/7** unless LLM latency is
the bottleneck.

---

## What we’d pick for TNDRX today

1. **Supabase** — keep; enable `vector`; shared dev/staging DB.
2. **Vercel** — keep; Preview + Production env point at inference URL.
3. **Inference** — **Hetzner CX32** + `infra/inference/docker-compose.yml`
   (or **Oracle Free** if budget is strictly zero).
4. **Optional later** — Together/Fireworks for LLM-only if CPU scoring is too slow.

---

## Next step

1. Choose host from Tier 1 or 2.
2. Deploy `infra/inference/` (see `infra/inference/README.md`).
3. Set Vercel + Supabase env vars (`docs/deployment-profiles.md`).
4. `DATABASE_URL=<supabase> npm run db:migrate && npm run embed:backfill`.

*Related: `infra/inference/README.md`, `docs/deployment-profiles.md`*
