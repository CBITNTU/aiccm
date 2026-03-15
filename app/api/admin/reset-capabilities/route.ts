/* eslint-disable @typescript-eslint/no-explicit-any -- company_capabilities, profiles extended columns */
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  createAdminClient,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

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
      "🗑️ RESET CAPABILITIES: Deleting ALL capabilities and links, then reseeding from CSV taxonomy.",
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

    // Step 4: Reseed company_capabilities_ref from read-only seed table (PostgREST returns max 1000 per request, so paginate)
    let reseededCapabilities = 0;
    const PAGE_SIZE = 1000;
    const INSERT_BATCH = 200;
    let offset = 0;
    const seedRows: any[] = [];

    while (true) {
      const { data: page, error: selectError } = await adminSupabase
        .from("competency_taxonomy_seed" as any)
        .select("id, name, category, parent_id, is_active")
        .range(offset, offset + PAGE_SIZE - 1);

      if (selectError) {
        console.error("❌ Failed to read from competency_taxonomy_seed:", selectError);
        throw new Error(
          `Failed to read seed taxonomy: ${selectError.message}. Run the taxonomy migration to create the seed table.`,
        );
      }
      if (!page || page.length === 0) break;
      seedRows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (seedRows.length > 0) {
      console.log(
        "📋 Step 4: Copying",
        seedRows.length,
        "rows from competency_taxonomy_seed into company_capabilities_ref...",
      );
      for (let i = 0; i < seedRows.length; i += INSERT_BATCH) {
        const chunk = seedRows.slice(i, i + INSERT_BATCH);
        const { error: insertError } = await adminSupabase
          .from("company_capabilities_ref" as any)
          .insert(
            chunk.map((r: any) => ({
              id: r.id,
              name: r.name,
              category: r.category,
              parent_id: r.parent_id,
              is_active: r.is_active !== false,
            })),
          );
        if (insertError) {
          console.error("❌ Failed to reseed capabilities:", insertError);
          throw new Error(
            `Failed to reseed capabilities: ${insertError.message}`,
          );
        }
        reseededCapabilities += chunk.length;
      }
      console.log("✅ Reseeded", reseededCapabilities, "capabilities");
    } else {
      console.log(
        "⚠️ competency_taxonomy_seed is empty — run scripts/generate-taxonomy-migration.mjs and apply the migration to populate it.",
      );
    }

    await logApiEvent(request, {
      actionType: "admin_capabilities_reset" as any,
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        deletedCapabilities: deletedCapsCount || 0,
        deletedLinks: deletedLinksCount || 0,
        reseededCapabilities,
      },
    }).catch(() => {});

    console.log(
      "✅ RESET COMPLETE: Deleted all, reseeded",
      reseededCapabilities,
      "capabilities from CSV taxonomy.",
    );

    return NextResponse.json({
      success: true,
      deletedCapabilities: deletedCapsCount || 0,
      deletedLinks: deletedLinksCount || 0,
      reseededCapabilities,
      message:
        reseededCapabilities > 0
          ? `All capabilities and links deleted. Reseeded ${reseededCapabilities} capabilities from the seed table.`
          : "All capabilities and links deleted. Seed table is empty — run scripts/generate-taxonomy-migration.mjs and apply the migration to populate competency_taxonomy_seed.",
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
