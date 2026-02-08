/* eslint-disable @typescript-eslint/no-explicit-any -- capabilities tables extended columns */
import { createAdminClient } from "@/lib/api";

const supabase = createAdminClient();

/**
 * Updates which capabilities are "active" based on whether they appear in any tenders
 * A capability is active if it appears in at least one tender's ai_capability_taxonomy
 */
export async function updateActiveCapabilities(): Promise<{
  activated: number;
  deactivated: number;
}> {
  console.log("🔄 Updating active capabilities based on tender taxonomy...");

  // Get all capabilities that appear in tenders' ai_capability_taxonomy
  const { data: tenders, error: tenderError } = await supabase
    .from("tenders" as any)
    .select("ai_capability_taxonomy")
    .not("ai_capability_taxonomy", "is", null);

  if (tenderError) {
    console.error("Error fetching tenders for capability update:", tenderError);
    throw new Error(`Failed to fetch tenders: ${tenderError.message}`);
  }

  // Collect all unique capability IDs from tenders
  const activeCapabilityIds = new Set<string>();

  if (tenders && tenders.length > 0) {
    tenders.forEach((tender: unknown) => {
      const tenderData = tender as { ai_capability_taxonomy?: string[] | null };
      if (
        tenderData.ai_capability_taxonomy &&
        Array.isArray(tenderData.ai_capability_taxonomy)
      ) {
        tenderData.ai_capability_taxonomy.forEach((capId: unknown) => {
          if (capId && typeof capId === "string") {
            activeCapabilityIds.add(capId);
          }
        });
      }
    });
  }

  console.log(
    `📊 Found ${activeCapabilityIds.size} active capabilities from ${tenders?.length || 0} tenders`,
  );

  // Get all capabilities from reference table
  const { data: allCapabilities, error: capabilitiesError } = await supabase
    .from("company_capabilities_ref" as any)
    .select("id");

  if (capabilitiesError) {
    console.error("Error fetching capabilities:", capabilitiesError);
    throw new Error(
      `Failed to fetch capabilities: ${capabilitiesError.message}`,
    );
  }

  if (!allCapabilities || allCapabilities.length === 0) {
    console.log("No capabilities found in reference table");
    return { activated: 0, deactivated: 0 };
  }

  // Update capabilities: set is_active = true for capabilities in tenders, false for others
  const capabilityIds = (allCapabilities as unknown as { id: string }[]).map(
    (c) => c.id,
  );

  // First, deactivate all capabilities
  const { error: deactivateError } = await supabase
    .from("company_capabilities_ref" as any)
    .update({ is_active: false } as any)
    .in("id", capabilityIds);

  if (deactivateError) {
    console.error("Error deactivating capabilities:", deactivateError);
    throw new Error(
      `Failed to deactivate capabilities: ${deactivateError.message}`,
    );
  }

  // Then, activate only those that appear in tenders
  if (activeCapabilityIds.size > 0) {
    const { error: activateError } = await supabase
      .from("company_capabilities_ref" as any)
      .update({ is_active: true } as any)
      .in("id", Array.from(activeCapabilityIds));

    if (activateError) {
      console.error("Error activating capabilities:", activateError);
      throw new Error(
        `Failed to activate capabilities: ${activateError.message}`,
      );
    }
  }

  const deactivated = capabilityIds.length - activeCapabilityIds.size;
  const activated = activeCapabilityIds.size;

  console.log(
    `✅ Updated capabilities: ${activated} activated, ${deactivated} deactivated`,
  );

  return { activated, deactivated };
}
