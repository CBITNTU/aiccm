/* eslint-disable @typescript-eslint/no-explicit-any -- company_capabilities, profiles extended columns */
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  createAdminClient,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { EIC_TAXONOMY } from "@/lib/eicTaxonomy";

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

    const adminSupabase = createAdminClient();

    console.log(
      "🗑️ RESET CAPABILITIES: Deleting ALL capabilities and links, then reseeding base list...",
    );

    // Step 1: Delete ALL company_capabilities links (junction table)
    console.log("📊 Step 1: Deleting all company-capability links...");
    const { error: deleteLinksError, count: deletedLinksCount } =
      await adminSupabase
        .from("company_capabilities" as any)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all (this condition always true)

    if (deleteLinksError) {
      console.error(
        "❌ Failed to delete company-capability links:",
        deleteLinksError,
      );
      throw new Error(
        `Failed to delete company-capability links: ${deleteLinksError.message}`,
      );
    }

    console.log(
      `✅ Deleted ${deletedLinksCount || 0} company-capability links`,
    );

    // Step 2: Delete ALL capabilities from reference table
    console.log("📋 Step 2: Deleting all capabilities from reference table...");
    const { error: deleteCapsError, count: deletedCapsCount } =
      await adminSupabase
        .from("company_capabilities_ref" as any)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

    if (deleteCapsError) {
      console.error("❌ Failed to delete capabilities:", deleteCapsError);
      throw new Error(
        `Failed to delete capabilities: ${deleteCapsError.message}`,
      );
    }

    console.log(
      `✅ Deleted ${deletedCapsCount || 0} capabilities from reference table`,
    );

    // Step 3: Clear ai_capability_taxonomy from all companies
    console.log(
      "🏢 Step 3: Clearing capability taxonomies from all companies...",
    );
    const { error: clearTaxonomyError } = await adminSupabase
      .from("companies" as any)
      .update({
        ai_capability_taxonomy: null,
        taxonomy_generated_at: null,
      })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Update all

    if (clearTaxonomyError) {
      console.error(
        "⚠️ Failed to clear company taxonomies:",
        clearTaxonomyError,
      );
      // Don't fail - this is a cleanup step
    } else {
      console.log("✅ Cleared capability taxonomies from all companies");
    }

    // Step 4: Reseed base capabilities list from EIC taxonomy (standard taxonomy)
    console.log(
      "📋 Step 4: Reseeding base capabilities list from EIC taxonomy...",
    );

    const baseCapabilities = EIC_TAXONOMY.flatMap((cat) =>
      cat.subcategories.map((name) => ({ name, category: cat.name })),
    );

    const { error: insertError } = await adminSupabase
      .from("company_capabilities_ref" as any)
      .insert(baseCapabilities)
      .select();

    if (insertError) {
      console.error("❌ Failed to reseed base capabilities:", insertError);
      throw new Error(
        `Failed to reseed base capabilities: ${insertError.message}`,
      );
    }

    console.log(`✅ Reseeded ${baseCapabilities.length} base capabilities`);

    // Log admin action
    await logApiEvent(request, {
      actionType: "admin_capabilities_reset" as any,
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        deletedCapabilities: deletedCapsCount || 0,
        deletedLinks: deletedLinksCount || 0,
        reseededCapabilities: baseCapabilities.length,
      },
    }).catch(() => {}); // Don't fail if logging fails

    console.log(
      `✅ RESET COMPLETE: All capabilities deleted and EIC taxonomy reseeded (${baseCapabilities.length} capabilities)`,
    );

    return NextResponse.json({
      success: true,
      deletedCapabilities: deletedCapsCount || 0,
      deletedLinks: deletedLinksCount || 0,
      reseededCapabilities: baseCapabilities.length,
      message: `All capabilities deleted. Reseeded ${baseCapabilities.length} capabilities from EIC taxonomy.`,
    });
  } catch (error) {
    console.error("❌ Error resetting capabilities:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
