# Deploying regions (UK + CN)

TNDRX runs one **independent** production deployment per region. Each region is its own
Vercel project with its own Supabase database and its own env vars. The runtime
whitelabel behaviour (branding, locale, currency, tender sources, AI defaults) is
selected by the `DEPLOYMENT_PROFILE` env var — see `lib/deployment/`.

| Region | Profile | Vercel project | Domain                  | Database        |
| ------ | ------- | -------------- | ----------------------- | --------------- |
| UK/EU  | `uk`    | `aiccm`        | `tndrx.com`             | Supabase eu-west-2 |
| China  | `cn`    | `aiccm-cn`     | `aiccm-cn.vercel.app`\* | Supabase ap-southeast-1 |

\* Default Vercel URL for now. Switch to `cn.tndrx.com` later (add the domain in
Vercel + DNS, then update `prodDomain` in `scripts/deploy-targets.mjs` and the CN
`BETTER_AUTH_URL`/`*_URL` env vars).

## Everyday commands

```bash
# Deploy (prints a summary; prod requires typing the region id to confirm)
npm run uk:deploy:prod      # → tndrx.com
npm run cn:deploy:prod      # → cn.tndrx.com
npm run uk:deploy           # preview deploy
npm run cn:deploy           # preview deploy

# Apply DB migrations to a region's PRODUCTION database.
# Pulls that project's env from Vercel, then runs drizzle-kit migrate.
npm run uk:migrate:prod
npm run cn:migrate:prod
```

- **Deploy** targets the region's Vercel project statelessly via `VERCEL_ORG_ID` /
  `VERCEL_PROJECT_ID` — it never re-links or touches `.vercel/project.json`, so your
  local link stays put.
- **Migrate** pulls `DATABASE_URL` from the region's Vercel project (single source of
  truth) and passes it to `drizzle-kit migrate`. You no longer edit `.env.local` to point
  at prod. The pulled env file (`.vercel/.env.<region>.production.local`) is gitignored
  and deleted after the run.
- Prereqs: Vercel CLI installed and `vercel login` done.

Local migrations still use `npm run db:migrate` (reads `.env.local`).

## One-time CN setup

### 1. Create the CN Supabase database

Create a new Supabase project (choose a region close to your users). From
**Project Settings → Database → Connection string → Transaction pooler**, copy the
`postgresql://…pooler.supabase.com:6543/postgres` URL — this is the CN `DATABASE_URL`.

### 2. Create the CN Vercel project

Create a Vercel project named **`aiccm-cn`** from this same Git repo.

> **Recommended:** do **not** enable Git auto-deploy for `aiccm-cn`. Both regions share
> one repo, so a push to the connected branch would otherwise trigger both projects.
> Keep CN deploys script-driven (`npm run cn:deploy:prod`), or bind the CN project to a
> dedicated branch. (Confirm how the UK `aiccm` project is wired so the two don't
> collide.)

Then copy the CN project id (dashboard → **Settings → General → Project ID**, or
`vercel project ls`) into `scripts/deploy-targets.mjs`:

```js
cn: {
  …
  vercelProjectId: "prj_XXXXXXXX",   // ← paste it here
  …
},
```

### 3. Set CN env vars on the `aiccm-cn` Vercel project (Production)

| Variable                              | Value                                         |
| ------------------------------------- | --------------------------------------------- |
| `DEPLOYMENT_PROFILE`                  | `cn`                                          |
| `DATABASE_URL`                        | new CN Supabase pooler URL (from step 1)      |
| `BETTER_AUTH_SECRET`                  | **new** random ≥32 chars (`npm run gen:secrets`) |
| `BETTER_AUTH_URL`                     | `https://aiccm-cn.vercel.app`                 |
| `NEXT_PUBLIC_APP_URL`                 | `https://aiccm-cn.vercel.app`                 |
| `PLATFORM_URL`                        | `https://aiccm-cn.vercel.app`                 |
| `PLATFORM_NAME`                       | CN platform name                              |
| `PLATFORM_EMAIL_FROM`                 | e.g. `noreply@tndrx.cn`                        |
| `TENDER_SYNC_SECRET`                  | new secret                                    |
| `DEEPSEEK_API_KEY`                    | CN uses DeepSeek for AI                        |
| `RESEND_API_KEY`                      | reuse or issue a separate key                  |

`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `TED_API_KEY` are **not** needed for
CN (OpenAI/Google are unreachable there; the CN profile routes AI to DeepSeek and disables
geocoding).

Generate all three secrets at once with:

```bash
npm run gen:secrets     # prints BETTER_AUTH_SECRET / CRON_SECRET / TENDER_SYNC_SECRET
```

### 4. Initialise the schema and go live

```bash
npm run cn:migrate:prod     # creates the schema in the new CN database
npm run cn:deploy:prod      # → https://aiccm-cn.vercel.app
```

Verify `aiccm-cn.vercel.app` serves the CN profile (zh-CN default locale, `¥` currency, CN
branding), and that `tndrx.com` still deploys via `npm run uk:deploy:prod`.

Later, to move CN onto `cn.tndrx.com`: add the domain in the Vercel dashboard + point DNS,
then update `prodDomain` in `scripts/deploy-targets.mjs` and the CN `BETTER_AUTH_URL` /
`NEXT_PUBLIC_APP_URL` / `PLATFORM_URL` env vars to the new host.

### 5. Retire the old migration workaround

Once migrations go through `*:migrate:prod`, the commented-out prod `DATABASE_URL` /
`BETTER_AUTH_*` block at the bottom of `.env.local` is no longer needed and can be removed.
