import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companyCapabilitiesRef, competencyTaxonomySeed } from "@/lib/db/schema/app";
import { sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Check if user is superadmin
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    // Guard BEFORE any destructive write: if the seed is empty we have nothing
    // to reseed from, so deleting the live taxonomy would leave the system wiped.
    const [{ count: seedCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competencyTaxonomySeed);

    if (!seedCount || seedCount === 0) {
      return apiError(
        "competency_taxonomy_seed is empty. Apply migrations that seed the CSV taxonomy (e.g. 20260217000000_seed_taxonomies_from_csv.sql).",
        500,
      );
    }

    console.log(
      "RESET CAPABILITIES: Deleting ALL capabilities and links, then reseeding base list...",
    );

    // Run the whole reset atomically: either every step lands or the DB rolls
    // back to its pre-reset state. A partial reset would leave drafts and
    // taxonomies referencing deleted capability UUIDs.
    const result = await db.transaction(async (tx) => {
      // Step 1: Delete ALL company_capabilities links (junction table).
      const linksResult = await tx.execute(
        sql`DELETE FROM company_capabilities`,
      );
      const deletedLinksCount = linksResult.rowCount ?? 0;

      // Step 2: Delete ALL capabilities from the reference table. parent_id has
      // no FK constraint, so a single unconditional delete clears every level.
      const capsResult = await tx.execute(
        sql`DELETE FROM company_capabilities_ref`,
      );
      const deletedCapsCount = capsResult.rowCount ?? 0;

      // Step 3: Clear ai_capability_taxonomy from all companies.
      await tx.execute(sql`
        UPDATE companies
           SET ai_capability_taxonomy = NULL,
               taxonomy_generated_at = NULL
         WHERE ai_capability_taxonomy IS NOT NULL
            OR taxonomy_generated_at IS NOT NULL
      `);

      // Step 3b: Scrub capability drafts. The wipe above invalidated every
      // company's capability selections, so any pending_changes.capabilities
      // draft and any pending competency_change_requests now reference deleted
      // UUIDs. Clear them so the UI never has to render orphaned ids.
      const draftResult = await tx.execute(sql`
        UPDATE companies
           SET pending_changes = pending_changes - 'capabilities'
         WHERE pending_changes ? 'capabilities'
      `);
      const clearedDrafts = draftResult.rowCount ?? 0;

      // Null out drafts that had a capabilities key removed above and now hold
      // nothing but the lastSavedAt marker.
      await tx.execute(sql`
        UPDATE companies
           SET pending_changes = NULL
         WHERE pending_changes IS NOT NULL
           AND (pending_changes - 'lastSavedAt') = '{}'::jsonb
      `);

      const reqResult = await tx.execute(sql`
        UPDATE competency_change_requests
           SET status = 'cancelled',
               review_notes = COALESCE(review_notes, '') ||
                 ' [auto-cancelled: capabilities reset]',
               updated_at = now()
         WHERE status = 'pending'
      `);
      const cancelledRequests = reqResult.rowCount ?? 0;

      // Step 4: Reseed from competency_taxonomy_seed (3-level CSV canonical copy
      // in DB). Self-referential parent_id: insert L1, then L2, then L3 so each
      // parent row exists before its children.
      await tx.execute(sql`
        INSERT INTO company_capabilities_ref (id, name, category, parent_id, is_active, created_at, updated_at)
        SELECT id, name, category, parent_id, is_active, now(), now()
        FROM competency_taxonomy_seed
        WHERE parent_id IS NULL
      `);

      await tx.execute(sql`
        INSERT INTO company_capabilities_ref (id, name, category, parent_id, is_active, created_at, updated_at)
        SELECT s.id, s.name, s.category, s.parent_id, s.is_active, now(), now()
        FROM competency_taxonomy_seed s
        WHERE s.parent_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM competency_taxonomy_seed p
            WHERE p.id = s.parent_id AND p.parent_id IS NULL
          )
      `);

      await tx.execute(sql`
        INSERT INTO company_capabilities_ref (id, name, category, parent_id, is_active, created_at, updated_at)
        SELECT s.id, s.name, s.category, s.parent_id, s.is_active, now(), now()
        FROM competency_taxonomy_seed s
        WHERE s.parent_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM competency_taxonomy_seed p
            WHERE p.id = s.parent_id AND p.parent_id IS NOT NULL
          )
      `);

      const [{ count: reseededCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(companyCapabilitiesRef);

      return {
        deletedLinksCount,
        deletedCapsCount,
        clearedDrafts,
        cancelledRequests,
        reseededCount,
      };
    });

    const {
      deletedLinksCount,
      deletedCapsCount,
      clearedDrafts,
      cancelledRequests,
      reseededCount,
    } = result;

    console.log(
      `RESET COMPLETE: deleted ${deletedCapsCount} capabilities and ${deletedLinksCount} links; ` +
        `reseeded ${reseededCount} rows; scrubbed ${clearedDrafts} draft(s); cancelled ${cancelledRequests} change-request(s)`,
    );

    // Log admin action (best-effort; never block the response).
    await logApiEvent(request, {
      actionType: "admin_capabilities_reset",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        deletedCapabilities: deletedCapsCount,
        deletedLinks: deletedLinksCount,
        reseededCapabilities: reseededCount,
        clearedDrafts,
        cancelledRequests,
      },
    }).catch(() => {});

    return apiResponse({
      success: true,
      deletedCapabilities: deletedCapsCount,
      deletedLinks: deletedLinksCount,
      reseededCapabilities: reseededCount,
      clearedDrafts,
      cancelledRequests,
      message: `All capabilities deleted. Reseeded ${reseededCount} capabilities from competency taxonomy seed (3-level CSV). Scrubbed ${clearedDrafts} pending draft(s) and cancelled ${cancelledRequests} change-request(s).`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
