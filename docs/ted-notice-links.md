# TED (EU) notice links

How TED tender imports store external notice URLs, why legacy links broke, and how to test or backfill fixes.

## Background

Tenders imported from the **TED Search API v3** (`POST /api/fetch-ted-tenders`) expose a **View on TED (EU)** link on the tender detail page. That link is resolved from `tenders.documents` JSON:

- `documents.specification_url` (preferred)
- `documents.application_url` (fallback)

See `lib/tenders/externalNoticeLink.ts`.

### Broken legacy format

Early ingests stored:

```text
https://ted.europa.eu/udl?uri=TED:NOTICE:<id>
```

That endpoint **no longer resolves** on the current TED portal (404). The UI button appeared but opened a dead page.

### Current format

Use the public detail URL with the notice **publication number**:

```text
https://ted.europa.eu/en/notice/-/detail/<publication-number>
```

Example (live notice, May 2026):

```text
https://ted.europa.eu/en/notice/-/detail/300146-2026
```

## Two different TED identifiers

The TED API returns two IDs. **Do not confuse them.**

| Field | Example | Used for |
|-------|---------|----------|
| `publication-number` | `300146-2026` | Portal URLs, `reference_number`, user-facing links |
| `notice-identifier` | `3fcfb083-63b0-439f-b250-a335758d9cd6` | Stable UUID from TED; kept as `external_id` in the import payload only |

The ingester (`app/api/fetch-ted-tenders/route.ts`) must use **`publication-number`** in portal URLs. Using the UUID in `/en/notice/-/detail/` does not resolve correctly.

Implementation summary:

- **`reference_number`** → `publication-number` (fallback: `notice-identifier` if missing)
- **`documents.specification_url` / `application_url`** → `https://ted.europa.eu/en/notice/-/detail/${publication-number}`
- **`external_id`** (API/transform only) → `notice-identifier` UUID for dedup/metadata
- TED search **`fields`** must include `publication-number` (not only `notice-identifier`)

## Database backfill

Migration: `drizzle/migrations/0007_fix_ted_notice_urls.sql`

It rewrites legacy `udl?uri=TED:NOTICE:` URLs in `documents` to the `/en/notice/-/detail/` format. **Data-only** — no schema change. Only rows with legacy TED URLs are updated (UK Find a Tender rows are untouched).

Apply with Drizzle (local or production):

```bash
npm run db:migrate
```

Or against a remote database:

```bash
DATABASE_URL="postgresql://…" npm run db:migrate
```

**Optional:** run the count query below first; if `legacy_ted_urls` is 0, you can skip the migration and rely on the ingester fix for new imports only.

**Do not use** `supabase/migrations/` — the project uses **Drizzle** migrations under `drizzle/migrations/`.

Migration order after PR #52 + #56: `0007_fix_ted_notice_urls` (TED links) then `0008_pgvector_embeddings_1536` (Basic Match).

### Migration edge cases

| Legacy URL suffix | `reference_number` | Result |
|-------------------|--------------------|--------|
| Publication number (`300146-2026`) | any | Rewritten to correct detail URL |
| UUID | publication number | Uses `reference_number` for the detail URL |
| UUID | also UUID | Detail URL may still be wrong — **re-import** the notice after the ingester fix |

The migration also fixes rows already on `/en/notice/-/detail/<uuid>` when `reference_number` is a publication number.

**UK tenders are not affected** — only rows whose `documents` URLs contain `ted.europa.eu`.

## Environment

Optional in `.env.local` (improves TED API reliability):

```bash
TED_API_KEY=<key from https://docs.ted.europa.eu/api/latest/>
```

## Manual testing

### 1. Import fresh TED data

1. Log in as **superadmin** (`admin@tndrx.dev` / `password123` after seed).
2. Open **Admin → Tenders** → **TED (EU)** tab.
3. Choose a recent date range and run import.
4. Open any imported tender → click **View on TED (EU)**.
5. Confirm the browser URL is `/en/notice/-/detail/<NNNNNN-YYYY>` and the notice loads.

### 2. Verify stored URLs in SQL

```sql
SELECT
  id,
  reference_number,
  documents ->> 'specification_url' AS spec_url
FROM tenders
WHERE documents ->> 'specification_url' ILIKE '%ted.europa.eu%'
LIMIT 10;
```

Expect only `/en/notice/-/detail/` URLs with publication numbers — no `/udl?uri=`.

### 3. Simulate legacy data + migration (local)

Patch one row with a broken legacy URL:

```sql
UPDATE tenders
SET
  reference_number = '300146-2026',
  documents = jsonb_build_object(
    'specification_url', 'https://ted.europa.eu/udl?uri=TED:NOTICE:300146-2026',
    'application_url',   'https://ted.europa.eu/udl?uri=TED:NOTICE:300146-2026'
  )
WHERE id = (SELECT id FROM tenders LIMIT 1);
```

Run migrations (includes this backfill when legacy TED rows exist):

```bash
npm run db:migrate
```

Open the tender in the app and click the external link.

## Related code & PR

| Item | Location |
|------|----------|
| TED import API | `app/api/fetch-ted-tenders/route.ts` |
| External link resolver | `lib/tenders/externalNoticeLink.ts` |
| Tender detail UI | `app/(protected)/tenders/[tenderId]/page.tsx` |
| Admin import UI | `components/admin/AdminTenderImport.tsx` |
| Backfill migration | `drizzle/migrations/0007_fix_ted_notice_urls.sql` |
| Fix PR | [#52 — Fix TED EU notice link on tender details](https://github.com/CBITNTU/aiccm/pull/52) |

## Quick reference

```text
Broken:  https://ted.europa.eu/udl?uri=TED:NOTICE:300146-2026
Fixed:   https://ted.europa.eu/en/notice/-/detail/300146-2026
Wrong:   https://ted.europa.eu/en/notice/-/detail/3fcfb083-63b0-439f-b250-a335758d9cd6  (UUID — do not use)
```
