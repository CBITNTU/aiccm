import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { EIC_TAXONOMY } from "@/lib/eicTaxonomy";
import { db } from "@/lib/db";
import {
  companyCapabilities,
  companyCapabilitiesRef,
  companies,
} from "@/lib/db/schema/app";
import { ne } from "drizzle-orm";

// A UUID that will never match any real row - used as a "match all" condition
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Check if user is superadmin
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Superadmin access required" },
        { status: 403 },
      );
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

    // Step 2: Delete ALL capabilities from reference table
    console.log("Step 2: Deleting all capabilities from reference table...");
    const deletedCaps = await db
      .delete(companyCapabilitiesRef)
      .where(ne(companyCapabilitiesRef.id, ZERO_UUID))
      .returning();

    const deletedCapsCount = deletedCaps.length;
    console.log(`Deleted ${deletedCapsCount} capabilities from reference table`);

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

    // Step 4: Reseed base capabilities list from EIC taxonomy (standard taxonomy)
    console.log("Step 4: Reseeding base capabilities list from EIC taxonomy...");

    // TODO [MERGE]: migrate CSV seed pagination approach to Drizzle
    // HEAD used: paginated reads from competency_taxonomy_seed table via Supabase,
    // then batch-inserted into company_capabilities_ref. Consider switching to this
    // once the seed table is migrated to Drizzle.

    const baseCapabilities = EIC_TAXONOMY.map((item) => ({
      name: item.name,
      category: item.category,
      isActive: true,
    }));

    const insertedCaps = await db
      .insert(companyCapabilitiesRef)
      .values(baseCapabilities)
      .returning();

    console.log(`Reseeded ${insertedCaps.length} base capabilities`);

    // Log admin action
    await logApiEvent(request, {
      actionType: "admin_capabilities_reset",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        deletedCapabilities: deletedCapsCount,
        deletedLinks: deletedLinksCount,
        reseededCapabilities: baseCapabilities.length,
      },
    }).catch(() => {});

    console.log(
      `RESET COMPLETE: All capabilities deleted and EIC taxonomy reseeded (${baseCapabilities.length} capabilities)`,
    );

    return NextResponse.json({
      success: true,
      deletedCapabilities: deletedCapsCount,
      deletedLinks: deletedLinksCount,
      reseededCapabilities: baseCapabilities.length,
      message: `All capabilities deleted. Reseeded ${baseCapabilities.length} capabilities from EIC taxonomy.`,
    });
  } catch (error) {
    console.error("Error resetting capabilities:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
