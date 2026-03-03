# Testing: Admin Tender Sync Status

This doc describes how to test the "Last sync state" on **Admin → Tenders** and how to resolve common failures.

## What you’re testing

- **Status card**: "Last sync finished" and "Next scheduled sync" load and update.
- **Trigger sync**: "Trigger sync now" runs the sync and the card shows updated times (or a clear error).

## Prerequisites

1. **Local stack**
   - `npm run dev` (Next.js on http://localhost:3000).
   - Local Supabase: `npm run supabase:start` and `npm run supabase:db-push` so `platform_settings` exists.

2. **Superadmin user**
   - Status and trigger are superadmin-only. Use the seeded superadmin from `supabase/seed.sql` or give your user the `superadmin` role in `user_roles`.

## Manual test steps

1. **Log in as superadmin**  
   Go to `/auth`, sign in with a superadmin account.

2. **Open Admin → Tenders**  
   Go to `/admin`, open the **Tenders** tab. You should see the "Weekly Tender Sync" card.

3. **Check initial status**
   - **Expected**: "Last sync finished: Never" and "Next scheduled sync: Not scheduled" (if no sync has run yet), or real dates if they were set.
   - **If you see "Loading…" forever**: Check Network for `GET /api/admin/tender-sync-status`. If 403 → user is not superadmin. If 500 → check server logs and DB (table/keys below).

4. **Trigger sync**
   - Click **Trigger sync now**.
   - **Expected**: Button shows "Syncing…", then a toast. After that, the card refetches and shows "Last sync finished: &lt;date&gt;" and "Next scheduled sync: &lt;date&gt;" (or an error toast if sync failed).
   - **If sync fails** (e.g. external APIs down): You should see an error toast; "Last sync finished" should **not** change to "now" (only successful syncs update it).

5. **Verify in DB (optional)**  
   In Supabase SQL editor or `psql`:

   ```sql
   SELECT key, value, updated_at
   FROM public.platform_settings
   WHERE key IN ('tender_sync_last_finished_at', 'tender_sync_next_scheduled_at');
   ```

   After a successful sync you should see two rows with ISO timestamps in `value`.

## Quick API checks (with auth cookie)

1. Get a session cookie: log in in the browser, then DevTools → Application → Cookies → copy the Supabase auth cookie value (or use the cookie header from a request to `/api/...`).

2. **Status (GET)**  
   Replace `YOUR_COOKIE` with your session cookie:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -H "Cookie: YOUR_COOKIE" \
     http://localhost:3000/api/admin/tender-sync-status
   ```
   - **200**: OK; response body should be `{"lastSyncFinishedAt":null,"nextSyncScheduledAt":null}` or with ISO strings.
   - **401**: Not logged in.
   - **403**: Not superadmin.

3. **Trigger (POST)**  
   Same cookie:

   ```bash
   curl -s -X POST \
     -H "Cookie: YOUR_COOKIE" \
     -H "Content-Type: application/json" \
     -d '{"triggerNow":true}' \
     http://localhost:3000/api/admin/tender-sync
   ```
   - **200** with `"ran":true`: Sync ran; body includes `lastSyncFinishedAt` and `nextSyncScheduledAt`.
   - **200** with `"ran":false`: Sync not run (e.g. "Sync not due" or missing `TENDER_SYNC_SECRET`).
   - **401/403**: Auth as above.

## Common causes of "last sync state doesn’t work"

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| 403 on status or trigger | User is not superadmin | Add `superadmin` role for that user in `user_roles`. |
| 500 on status | `platform_settings` missing or DB error | Run migrations; check server logs and DB. |
| "Never" never updates after trigger | Sync fails before writing schedule, or schedule not written | Check server logs for sync errors; ensure `TENDER_SYNC_SECRET` (or `CRON_SECRET`) is set for POST. |
| "Last sync" shows "now" but sync failed | Bug: schedule was updated even on failure | Code should only set `lastSyncFinishedAt` when sync succeeds (see `app/api/admin/tender-sync/route.ts`). |

## Files involved

- **UI**: `components/admin/AdminTenderSyncSchedule.tsx` (uses `api.getTenderSyncStatus()`, `api.triggerTenderSync()`).
- **APIs**: `app/api/admin/tender-sync-status/route.ts`, `app/api/admin/tender-sync/route.ts`.
- **Storage**: `lib/services/tenderSyncSchedule.ts` (reads/writes `platform_settings`).
- **Migrations**: `supabase/migrations/20260209000000_add_platform_settings.sql`, RLS in `20260214000000_add_rls_platform_settings_demo_results.sql`.
