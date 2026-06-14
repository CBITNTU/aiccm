# TNDRX inference service

Always-on **hosted** Ollama for Basic Match embeddings and LLM scoring. The
Next.js app (Vercel) calls this over HTTPS — no developer laptop needs to stay
on.

```
Vercel (app)  ──HTTPS + API key──►  inference.tndrx.dev (this service)
                                         Ollama + qwen3-embedding + qwen2.5:7b
```

## Requirements

| Resource | Minimum | Notes |
|---|---|---|
| RAM | **8 GB** | `qwen2.5:7b` + embed model on CPU |
| Disk | **15 GB** | Model weights persist in a volume |
| CPU | 4 vCPU | Embeddings are fast; LLM scoring is slower on CPU (~5–15 s) |

Embeddings alone need ~2 GB; the chat model drives the RAM requirement.

---

## Quick start (local smoke test of the same stack)

```bash
cp infra/inference/.env.example infra/inference/.env
# edit INFERENCE_API_KEY

docker compose -f infra/inference/docker-compose.yml up -d
docker compose -f infra/inference/docker-compose.yml --profile bootstrap run --rm bootstrap
```

Point the app:

```bash
EMBED_PROVIDER=ollama
EMBED_BASE_URL=http://127.0.0.1:11434
INFERENCE_BASE_URL=http://127.0.0.1:11434/v1
INFERENCE_API_KEY=same-as-inference-.env
MATCHING_MODEL=ollama/qwen2.5:7b
```

---

## Deploy to a cloud VPS (recommended for the team)

Pick one provider and deploy **once** — all devs and Vercel previews use the
same URL.

### Option 1 — Oracle Cloud Always Free (~$0/month)

Best **free** always-on service for a 3–4 person team.

| | |
|---|---|
| Spec | Ampere ARM, up to 4 OCPU + 24 GB RAM |
| Cost | **$0** (Always Free tier) |
| Caveat | Sign-up / capacity can be fiddly in some regions |

1. Create an **Ampere A1** VM (Ubuntu 24.04, 4 OCPU, 24 GB RAM).
2. Open port 443 (or 11434 behind Caddy — see below).
3. Install Docker, clone repo, deploy:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
git clone … && cd aiccm/infra/inference
cp .env.example .env   # set INFERENCE_API_KEY
docker compose up -d
docker compose --profile bootstrap run --rm bootstrap
```

4. Put **Caddy** or **nginx** in front for HTTPS + TLS (Let’s Encrypt).
5. Set Vercel env: `INFERENCE_BASE_URL=https://inference.yourdomain.com/v1`

### Option 2 — Hetzner Cloud (~€6–8/month)

Simplest ops if you prefer paying over Oracle signup friction.

| Plan | RAM | Cost | Good for |
|---|---|---|---|
| **CX32** | 8 GB | ~€6.80/mo | Dev/staging inference |
| **CX42** | 16 GB | ~€16/mo | Faster LLM scoring |

Same Docker Compose steps as Oracle. Hetzner firewall: allow 443 from
`0.0.0.0/0`, block raw 11434.

### Option 3 — Fly.io (~$30–60/month for 8 GB)

Use `fly.toml` in this folder. Managed TLS and deploys; more expensive than
Hetzner for always-on 8 GB.

```bash
cd infra/inference
fly launch --no-deploy --copy-config
fly volumes create ollama_models --size 20 --region lhr
fly secrets set INFERENCE_API_KEY=your-secret
fly deploy
# Then pull models (SSH or one-off machine):
fly ssh console -C "ollama pull qwen3-embedding:0.6b && ollama pull qwen2.5:7b"
```

Public URL: `https://tndrx-inference.fly.dev`

---

## HTTPS + API key (required for production)

Ollama supports `OLLAMA_API_KEY`. Set the same value on:

1. **Inference server** — `INFERENCE_API_KEY` in `infra/inference/.env`
2. **Vercel / dev** — `INFERENCE_API_KEY` and `EMBED_API_KEY` (same secret)

Clients send `Authorization: Bearer <key>`. Without TLS + a secret, your
models are public.

Minimal **Caddy** in front of Docker (on a VPS):

```text
inference.yourdomain.com {
  reverse_proxy localhost:11434
}
```

---

## Wire Vercel to the service

Vercel project → Environment Variables (**Preview** + **Production**):

```bash
EMBED_PROVIDER=ollama
EMBED_BASE_URL=https://inference.yourdomain.com
INFERENCE_BASE_URL=https://inference.yourdomain.com/v1
INFERENCE_API_KEY=your-secret
EMBED_API_KEY=your-secret
EMBED_MODEL=qwen3-embedding:0.6b
EMBED_DIM=768
MATCHING_MODEL=ollama/qwen2.5:7b
```

Health check: **Admin → Basic Match** banner or
`GET /api/admin/inference/health`.

---

## Whitelabel

Each customer deploys their own `infra/inference` stack (or vLLM gateway) and
sets the same env vars on their Vercel project. No code changes.

See `docs/deployment-profiles.md` for the full matrix.
