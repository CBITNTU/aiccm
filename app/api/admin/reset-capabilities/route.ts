import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, checkSuperadminRole, createAdminClient } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is superadmin
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Superadmin access required" },
        { status: 403 }
      );
    }

    const adminSupabase = createAdminClient();

    console.log("🗑️ RESET CAPABILITIES: Deleting ALL capabilities and links, then reseeding base list...");

    // Step 1: Delete ALL company_capabilities links (junction table)
    console.log("📊 Step 1: Deleting all company-capability links...");
    const { error: deleteLinksError, count: deletedLinksCount } = await adminSupabase
      .from("company_capabilities" as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all (this condition always true)

    if (deleteLinksError) {
      console.error("❌ Failed to delete company-capability links:", deleteLinksError);
      throw new Error(`Failed to delete company-capability links: ${deleteLinksError.message}`);
    }

    console.log(`✅ Deleted ${deletedLinksCount || 0} company-capability links`);

    // Step 2: Delete ALL capabilities from reference table
    console.log("📋 Step 2: Deleting all capabilities from reference table...");
    const { error: deleteCapsError, count: deletedCapsCount } = await adminSupabase
      .from("company_capabilities_ref" as any)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

    if (deleteCapsError) {
      console.error("❌ Failed to delete capabilities:", deleteCapsError);
      throw new Error(`Failed to delete capabilities: ${deleteCapsError.message}`);
    }

    console.log(`✅ Deleted ${deletedCapsCount || 0} capabilities from reference table`);

    // Step 3: Clear ai_capability_taxonomy from all companies
    console.log("🏢 Step 3: Clearing capability taxonomies from all companies...");
    const { error: clearTaxonomyError } = await adminSupabase
      .from("companies" as any)
      .update({ 
        ai_capability_taxonomy: null,
        taxonomy_generated_at: null,
      })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Update all

    if (clearTaxonomyError) {
      console.error("⚠️ Failed to clear company taxonomies:", clearTaxonomyError);
      // Don't fail - this is a cleanup step
    } else {
      console.log("✅ Cleared capability taxonomies from all companies");
    }

    // Step 4: Reseed base capabilities list (from migration seed data)
    console.log("📋 Step 4: Reseeding base capabilities list...");
    
    // Base capabilities - using the original migration seed data structure
    const baseCapabilities = [
      // Construction
      { name: 'Construction', category: 'Construction' },
      
      // Services - basic services only
      { name: 'Archiving', category: 'Services' },
      { name: 'Commissioning', category: 'Services' },
      { name: 'Consultancy', category: 'Services' },
      { name: 'Distribution Service', category: 'Services' },
      { name: 'Installation', category: 'Services' },
      { name: 'Maintenance & Service', category: 'Services' },
      { name: 'Marketing Consultancy', category: 'Services' },
      { name: 'Retail', category: 'Services' },
      { name: 'Training & Education', category: 'Services' },
      { name: 'Waste Management', category: 'Services' },
      
      // ICT Process - basic IT capabilities
      { name: 'Application Development', category: 'ICT Process' },
      { name: 'ICT Consultancy', category: 'ICT Process' },
      { name: 'ICT Maintenance & Support', category: 'ICT Process' },
      { name: 'Internet Services', category: 'ICT Process' },
      { name: 'IT Networks', category: 'ICT Process' },
      { name: 'Software and System Design', category: 'ICT Process' },
      { name: 'System Integration', category: 'ICT Process' },
      { name: 'Web Based Applications', category: 'ICT Process' },
      { name: 'Web Hosting', category: 'ICT Process' },
      
      // Design
      { name: 'CAD / CAM', category: 'Design' },
      { name: 'Graphic Design', category: 'Design' },
      { name: 'Mechanical Design', category: 'Design' },
      { name: 'Programming', category: 'Design' },
      
      // Manufacturing - basic manufacturing
      { name: 'Assembly', category: 'Manufacturing' },
      { name: 'Fabrication (General)', category: 'Manufacturing' },
      { name: 'Machining', category: 'Manufacturing' },
      { name: 'Prototyping', category: 'Manufacturing' },
      
      // Engineering
      { name: 'Engineering', category: 'Engineering' },
      
      // Healthcare
      { name: 'Healthcare', category: 'Healthcare' },
      
      // Education
      { name: 'Education', category: 'Education' },
      
      // Logistics
      { name: 'Logistics & Warehousing', category: 'Logistics' },
      { name: 'Material Handling & Packaging', category: 'Logistics' },
      { name: 'Procurement', category: 'Logistics' },
      
      // Energy
      { name: 'Solar Energy', category: 'Energy' },
      { name: 'Wind Energy', category: 'Energy' },
      { name: 'Renewable Energy', category: 'Energy' },
    ];

    const { error: insertError, count: insertedCount } = await adminSupabase
      .from("company_capabilities_ref" as any)
      .insert(baseCapabilities)
      .select();

    if (insertError) {
      console.error("❌ Failed to reseed base capabilities:", insertError);
      throw new Error(`Failed to reseed base capabilities: ${insertError.message}`);
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

    console.log("✅ RESET COMPLETE: All capabilities deleted and base list reseeded");

    return NextResponse.json({
      success: true,
      deletedCapabilities: deletedCapsCount || 0,
      deletedLinks: deletedLinksCount || 0,
      reseededCapabilities: baseCapabilities.length,
      message: `All capabilities deleted. Reseeded ${baseCapabilities.length} base capabilities.`,
    });
  } catch (error) {
    console.error("❌ Error resetting capabilities:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
