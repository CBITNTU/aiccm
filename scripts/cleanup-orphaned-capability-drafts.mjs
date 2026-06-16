/**
 * One-off cleanup for orphaned competency drafts left behind by an admin
 * "Reset capabilities" run.
 *
 * An EARLIER version of the admin reset
 * (app/api/admin/reset-capabilities/route.ts) deleted every company_capabilities
 * row and re-created company_capabilities_ref, but never touched
 * companies.pending_changes. As a result, the pending_changes.capabilities draft
 * arrays (proposed/added/removed/current) still reference the OLD, now-deleted
 * capability UUIDs, and pending competency_change_requests reference the same
 * dead IDs. The UI then renders raw UUIDs instead of names.
 *
 * The reset now scrubs drafts inline, so this script is only needed to repair
 * damage left by that earlier behavior.
 *
 * This script keeps only capability IDs that still exist in
 * company_capabilities_ref and drops the rest. It is idempotent — re-running
 * after a clean run is a no-op.
 *
 * Usage:
 *   DATABASE_URL=<url> node scripts/cleanup-orphaned-capability-drafts.mjs --dry
 *   DATABASE_URL=<url> node scripts/cleanup-orphaned-capability-drafts.mjs
 *
 * --dry  Print what would change without writing anything.
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry");

const RELATION_KEYS = ["proposed", "added", "removed", "current"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log(
    `\nOrphaned capability draft cleanup ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE)"}\n`,
  );

  try {
    // Valid capability IDs that survived the reset.
    const { rows: refRows } = await client.query(
      "SELECT id FROM company_capabilities_ref",
    );
    const validIds = new Set(refRows.map((r) => r.id));
    console.log(`Reference table has ${validIds.size} valid capability IDs.\n`);

    await client.query("BEGIN");

    // ---- 1. Scrub pending_changes.capabilities on companies -----------------
    const { rows: companyRows } = await client.query(
      `SELECT id, company_name, pending_changes
         FROM companies
        WHERE pending_changes ? 'capabilities'`,
    );

    let companiesChanged = 0;
    let companiesCleared = 0;

    for (const row of companyRows) {
      const pending = row.pending_changes;
      const caps = pending?.capabilities;
      if (!caps) continue;

      const cleanedCaps = {};
      let removedCount = 0;
      for (const key of RELATION_KEYS) {
        const arr = Array.isArray(caps[key]) ? caps[key] : [];
        const kept = arr.filter((id) => validIds.has(id));
        removedCount += arr.length - kept.length;
        cleanedCaps[key] = kept;
      }

      const draftIsEmpty =
        cleanedCaps.proposed.length === 0 &&
        cleanedCaps.added.length === 0 &&
        cleanedCaps.removed.length === 0;

      if (removedCount === 0 && !draftIsEmpty) {
        // Nothing orphaned here — leave as-is.
        continue;
      }

      let newPending;
      if (draftIsEmpty) {
        // Drop the whole capabilities key.
        const { capabilities: _omit, ...rest } = pending;
        const remainingKeys = Object.keys(rest).filter((k) => k !== "lastSavedAt");
        newPending = remainingKeys.length === 0 ? null : rest;
      } else {
        newPending = { ...pending, capabilities: cleanedCaps };
      }

      console.log(
        `  ${row.company_name} (${row.id}): removed ${removedCount} orphaned id(s)` +
          (newPending === null
            ? " → cleared pending_changes"
            : draftIsEmpty
              ? " → dropped capabilities draft"
              : ""),
      );

      companiesChanged += 1;
      if (newPending === null) companiesCleared += 1;

      if (!DRY_RUN) {
        await client.query(
          "UPDATE companies SET pending_changes = $1 WHERE id = $2",
          [newPending, row.id],
        );
      }
    }

    // ---- 2. Cancel pending competency_change_requests with dead IDs ---------
    const { rows: reqRows } = await client.query(
      `SELECT id, company_id, proposed_additions, proposed_removals
         FROM competency_change_requests
        WHERE status = 'pending'`,
    );

    let requestsCancelled = 0;
    for (const req of reqRows) {
      const additions = Array.isArray(req.proposed_additions)
        ? req.proposed_additions
        : [];
      const removals = Array.isArray(req.proposed_removals)
        ? req.proposed_removals
        : [];
      const hasOrphan = [...additions, ...removals].some(
        (id) => !validIds.has(id),
      );
      if (!hasOrphan) continue;

      console.log(
        `  change-request ${req.id} (company ${req.company_id}) → cancelled (orphaned ids)`,
      );
      requestsCancelled += 1;

      if (!DRY_RUN) {
        await client.query(
          `UPDATE competency_change_requests
              SET status = 'cancelled',
                  review_notes = COALESCE(review_notes, '') ||
                    ' [auto-cancelled: referenced capabilities removed by reset]',
                  updated_at = now()
            WHERE id = $1`,
          [req.id],
        );
      }
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    console.log(
      `\nSummary: ${companiesChanged} company draft(s) scrubbed ` +
        `(${companiesCleared} fully cleared), ` +
        `${requestsCancelled} change-request(s) cancelled.` +
        (DRY_RUN ? " (DRY RUN — nothing written)" : ""),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
