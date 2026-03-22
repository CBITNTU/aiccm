import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import {
  companyCapabilities,
  companyCapabilitiesRef,
  companies,
} from "@/lib/db/schema/app";
import { ne, sql } from "drizzle-orm";

// A UUID that will never match any real row - used as a "match all" condition
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Check if user is superadmin
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    console.log(
      "RESET CAPABILITIES: Deleting ALL capabilities and links, then reseeding base list...",
    );

    // Step 1: Delete ALL company_capabilities links (junction table)
    console.log("Step 1: Deleting all company-capability links...");
    const deletedLinks = await db
      .delete(companyCapabilities)
      .where(ne(companyCapabilities.id, ZERO_UUID))
      .returning();

    const deletedLinksCount = deletedLinks.length;
    console.log(`Deleted ${deletedLinksCount} company-capability links`);

    // Step 2: Delete ALL capabilities from reference table in reverse order (L3 → L2 → L1)
    // to avoid FK cascade conflicts on self-referential parent_id.
    console.log("Step 2: Deleting all capabilities from reference table...");
    await db.execute(sql`DELETE FROM company_capabilities_ref WHERE parent_id IN (SELECT id FROM company_capabilities_ref WHERE parent_id IS NOT NULL)`);
    await db.execute(sql`DELETE FROM company_capabilities_ref WHERE parent_id IS NOT NULL`);
    const deletedCapsResult = await db
      .delete(companyCapabilitiesRef)
      .where(ne(companyCapabilitiesRef.id, ZERO_UUID))
      .returning();

    const deletedCapsCount = deletedCapsResult.length;
    console.log(`Deleted ${deletedCapsCount} L1 capabilities from reference table`);

    // Step 3: Clear ai_capability_taxonomy from all companies
    console.log("Step 3: Clearing capability taxonomies from all companies...");
    try {
      await db
        .update(companies)
        .set({
          aiCapabilityTaxonomy: null,
          taxonomyGeneratedAt: null,
        })
        .where(ne(companies.id, ZERO_UUID));
      console.log("Cleared capability taxonomies from all companies");
    } catch (clearTaxonomyError) {
      console.error("Failed to clear company taxonomies:", clearTaxonomyError);
    }

    // Step 4: Reseed from competency_taxonomy_seed (3-level CSV canonical copy in DB)
    console.log(
      "Step 4: Reseeding company_capabilities_ref from competency_taxonomy_seed...",
    );

    const [{ count: seedCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sql`competency_taxonomy_seed`);

    if (!seedCount || seedCount === 0) {
      return apiError(
        "competency_taxonomy_seed is empty. Apply migrations that seed the CSV taxonomy (e.g. 20260217000000_seed_taxonomies_from_csv.sql).",
        500,
      );
    }

    // Self-referential FK: insert L1, then L2, then L3 (parent rows must exist first)
    await db.execute(sql`
      INSERT INTO company_capabilities_ref (id, name, category, parent_id, is_active, created_at, updated_at)
      SELECT id, name, category, parent_id, is_active, now(), now()
      FROM competency_taxonomy_seed
      WHERE parent_id IS NULL
    `);

    await db.execute(sql`
      INSERT INTO company_capabilities_ref (id, name, category, parent_id, is_active, created_at, updated_at)
      SELECT s.id, s.name, s.category, s.parent_id, s.is_active, now(), now()
      FROM competency_taxonomy_seed s
      WHERE s.parent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM competency_taxonomy_seed p
          WHERE p.id = s.parent_id AND p.parent_id IS NULL
        )
    `);

    await db.execute(sql`
      INSERT INTO company_capabilities_ref (id, name, category, parent_id, is_active, created_at, updated_at)
      SELECT s.id, s.name, s.category, s.parent_id, s.is_active, now(), now()
      FROM competency_taxonomy_seed s
      WHERE s.parent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM competency_taxonomy_seed p
          WHERE p.id = s.parent_id AND p.parent_id IS NOT NULL
        )
    `);

    const [{ count: reseededCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyCapabilitiesRef);

    console.log(`Reseeded ${reseededCount} capabilities from seed table`);

    // Log admin action
    await logApiEvent(request, {
      actionType: "admin_capabilities_reset",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        deletedCapabilities: deletedCapsCount,
        deletedLinks: deletedLinksCount,
        reseededCapabilities: reseededCount,
      },
    }).catch(() => {});

    console.log(
      `RESET COMPLETE: All capabilities deleted; ${reseededCount} rows copied from competency_taxonomy_seed`,
    );

    return apiResponse({
      success: true,
      deletedCapabilities: deletedCapsCount,
      deletedLinks: deletedLinksCount,
      reseededCapabilities: reseededCount,
      message: `All capabilities deleted. Reseeded ${reseededCount} capabilities from competency taxonomy seed (3-level CSV).`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
