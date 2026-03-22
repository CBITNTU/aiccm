import { db } from "@/lib/db";
import { tenders, companyCapabilitiesRef } from "@/lib/db/schema/app";
import { inArray, isNotNull } from "drizzle-orm";

/**
 * Updates which capabilities are "active" based on whether they appear in any tenders.
 * A capability is active if it appears in at least one tender's ai_capability_taxonomy.
 */
export async function updateActiveCapabilities(): Promise<{
  activated: number;
  deactivated: number;
}> {
  console.log("🔄 Updating active capabilities based on tender taxonomy...");

  // Get all tenders with ai_capability_taxonomy
  const tenderRows = await db
    .select({ aiCapabilityTaxonomy: tenders.aiCapabilityTaxonomy })
    .from(tenders)
    .where(isNotNull(tenders.aiCapabilityTaxonomy));

  // Collect all unique capability IDs from tenders
  const activeCapabilityIds = new Set<string>();
  for (const row of tenderRows) {
    const taxonomy = row.aiCapabilityTaxonomy as string[] | null;
    if (Array.isArray(taxonomy)) {
      for (const capId of taxonomy) {
        if (capId && typeof capId === "string") {
          activeCapabilityIds.add(capId);
        }
      }
    }
  }

  console.log(
    `📊 Found ${activeCapabilityIds.size} active capabilities from ${tenderRows.length} tenders`,
  );

  // Get all capabilities from reference table
  const allCapabilities = await db
    .select({ id: companyCapabilitiesRef.id })
    .from(companyCapabilitiesRef);

  if (allCapabilities.length === 0) {
    console.log("No capabilities found in reference table");
    return { activated: 0, deactivated: 0 };
  }

  const allIds = allCapabilities.map((c) => c.id);

  // Deactivate all capabilities
  await db
    .update(companyCapabilitiesRef)
    .set({ isActive: false })
    .where(inArray(companyCapabilitiesRef.id, allIds));

  // Activate only those that appear in tenders
  if (activeCapabilityIds.size > 0) {
    await db
      .update(companyCapabilitiesRef)
      .set({ isActive: true })
      .where(inArray(companyCapabilitiesRef.id, Array.from(activeCapabilityIds)));
  }

  const deactivated = allIds.length - activeCapabilityIds.size;
  const activated = activeCapabilityIds.size;

  console.log(
    `✅ Updated capabilities: ${activated} activated, ${deactivated} deactivated`,
  );

  return { activated, deactivated };
}
