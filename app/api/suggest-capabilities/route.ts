import { NextRequest } from "next/server";
import { getAuthenticatedUser, createAdminClient, chatCompletion, apiResponse, apiError, parseAIJsonResponse } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      console.error("Authentication error in suggest-capabilities:", authError);
      return apiError("Unauthorized. Please log in to use this feature.", 401);
    }

    const { tenderId } = await request.json();

    if (!tenderId) {
      return apiError("Tender ID is required", 400);
    }

    console.log("Fetching tender for capability suggestions:", tenderId);

    // Use admin client to bypass RLS for reading tender (user is already authenticated)
    const adminSupabase = createAdminClient();

    // Fetch tender details
    const { data: tender, error: tenderError } = await adminSupabase
      .from("tenders")
      .select("title, description, buyer, budget_min, budget_max, deadline, location, cpv_codes")
      .eq("id", tenderId)
      .single();

    if (tenderError) {
      console.error("Error fetching tender:", tenderError);
      return apiError(`Tender not found: ${tenderError.message}`, 404);
    }

    if (!tender) {
      console.error("Tender not found, ID:", tenderId);
      return apiError("Tender not found", 404);
    }

    console.log("Tender found:", tender.title);

    // Fetch all available capabilities (public table, no RLS needed)
    const { data: capabilities, error: capabilitiesError } = await adminSupabase
      .from("company_capabilities_ref")
      .select("id, name, category")
      .order("category")
      .order("name");

    if (capabilitiesError || !capabilities) {
      return apiError("Failed to fetch capabilities", 500);
    }

    // CRITICAL: Get capabilities that companies actually have (have links in junction table)
    // This ensures we only suggest capabilities that will find companies in Step 3
    const { data: companyCapabilityLinks } = await adminSupabase
      .from("company_capabilities")
      .select("capability_id")
      .limit(10000); // Get a sample to see which capabilities are used

    const usedCapabilityIds = new Set(
      (companyCapabilityLinks || []).map((link: any) => link.capability_id)
    );

    console.log(`📊 Found ${usedCapabilityIds.size} capabilities that companies actually have`);
    console.log(`📊 Total capabilities in ref table: ${capabilities.length}`);

    // Format capabilities for AI
    const capabilitiesByCategory: Record<string, string[]> = {};
    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      if (!capabilitiesByCategory[category]) {
        capabilitiesByCategory[category] = [];
      }
      capabilitiesByCategory[category].push(cap.name);
    });

    // Separate capabilities into "used by companies" and "not used yet"
    const usedCapabilitiesByCategory: Record<string, string[]> = {};
    const unusedCapabilitiesByCategory: Record<string, string[]> = {};

    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      const isUsed = usedCapabilityIds.has(cap.id);
      
      if (isUsed) {
        if (!usedCapabilitiesByCategory[category]) {
          usedCapabilitiesByCategory[category] = [];
        }
        usedCapabilitiesByCategory[category].push(cap.name);
      } else {
        if (!unusedCapabilitiesByCategory[category]) {
          unusedCapabilitiesByCategory[category] = [];
        }
        unusedCapabilitiesByCategory[category].push(cap.name);
      }
    });

    // Format capabilities list - prioritize used capabilities
    const usedCapabilitiesList = Object.entries(usedCapabilitiesByCategory)
      .map(([category, names]) => `${category} (USED BY COMPANIES):\n  - ${names.join("\n  - ")}`)
      .join("\n\n");
    
    const unusedCapabilitiesList = Object.entries(unusedCapabilitiesByCategory)
      .map(([category, names]) => `${category} (NOT YET USED):\n  - ${names.join("\n  - ")}`)
      .join("\n\n");

    const capabilitiesList = `${usedCapabilitiesList}\n\n${unusedCapabilitiesList}`;

    // Create AI prompt
    const systemPrompt = `You are an expert at analyzing tenders and identifying required capabilities. 
Your task is to analyze a tender description and identify relevant capabilities.

CRITICAL PRIORITY RULES:
1. FIRST PRIORITY: Select capabilities from the "USED BY COMPANIES" section - these will find companies in Step 3
2. SECOND PRIORITY: Only if no suitable match exists in "USED BY COMPANIES", check "NOT YET USED" section
3. LAST RESORT: Only create new capabilities if absolutely no existing capability (used or unused) is a reasonable match

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON - nothing else
- NO comments (// or /* */) anywhere in the response
- NO explanations or text before or after the JSON
- NO markdown code blocks (no \`\`\`json\`\`\`)
- Start with { and end with }
- Use only double quotes for strings

Return a JSON object with two arrays:
1. "existing": Array of capability names (strings) from the provided list that are relevant - PREFER "USED BY COMPANIES" items
2. "new": Array of objects with "name" and "category" for new capabilities - ONLY if no existing capability matches

Example (copy this exact format, no comments):
{"existing": ["Capability Name 1", "Capability Name 2"], "new": [{"name": "New Capability", "category": "Category Name"}]}

Be selective - only include capabilities that are clearly needed. Prioritize capabilities that companies already have.`;

    // Format budget range
    const budgetRange = tender.budget_min || tender.budget_max
      ? `£${tender.budget_min ? tender.budget_min.toLocaleString() : "?"} - £${tender.budget_max ? tender.budget_max.toLocaleString() : "?"}`
      : "Not specified";

    const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpv_codes && tender.cpv_codes.length > 0 ? `CPV Codes: ${tender.cpv_codes.join(", ")}` : ""}

Available Capabilities:
${capabilitiesList}

CRITICAL: The "USED BY COMPANIES" capabilities will find companies in Step 3. The "NOT YET USED" capabilities will find 0 companies.

Based on the tender details above, return ONLY a valid JSON object (no comments, no explanations, no markdown) with:
- "existing": Array of capability names from the "USED BY COMPANIES" section that match - PREFER THESE!
- "new": Array of new capabilities with "name" and "category" - ONLY if NO existing capability (used or unused) is a reasonable match

IMPORTANT: 
- If you see "Asbestos Removal Services" in "USED BY COMPANIES", use that!
- If you see "Asbestos Removal Services" in "NOT YET USED", still use it (better than creating new)
- Only create new capabilities if the tender requires something completely different that doesn't exist

Example format:
{"existing": ["Construction", "Project Management"], "new": []}`;

    // Call OpenAI
    const response = await chatCompletion(systemPrompt, userPrompt, {
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1000,
    });

    // Parse AI response
    let existingCapabilityNames: string[] = [];
    let newCapabilities: Array<{ name: string; category: string }> = [];
    
    try {
      // Use parseAIJsonResponse to handle comments
      const parsed = parseAIJsonResponse<{ existing?: string[]; new?: Array<{ name: string; category: string }> }>(response);
      existingCapabilityNames = Array.isArray(parsed.existing) ? parsed.existing : [];
      newCapabilities = Array.isArray(parsed.new) ? parsed.new : [];
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      // Fallback: try to extract just existing names as array
      try {
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          existingCapabilityNames = JSON.parse(arrayMatch[0]);
        }
      } catch (e2) {
        console.error("Failed to parse as array too:", e2);
      }
    }

    // Create new capabilities if needed and automatically assign them to matching companies
    const createdCapabilityIds: string[] = [];
    for (const newCap of newCapabilities) {
      if (!newCap.name || !newCap.category) continue;

      // Check if capability already exists (case-insensitive)
      const existing = capabilities.find(
        (c) => c.name.toLowerCase() === newCap.name.toLowerCase()
      );

      if (existing) {
        // Use existing capability - add to existing list if not already there
        if (!existingCapabilityNames.find(n => n.toLowerCase() === existing.name.toLowerCase())) {
          existingCapabilityNames.push(existing.name);
        }
      } else {
        // Create new capability
        const { data: created, error: createError } = await adminSupabase
          .from("company_capabilities_ref")
          .insert({
            name: newCap.name,
            category: newCap.category,
          })
          .select("id")
          .single();

        if (!createError && created) {
          const newId = (created as unknown as { id: string }).id;
          createdCapabilityIds.push(newId);
          // Also add to existing list so it gets returned
          existingCapabilityNames.push(newCap.name);

          console.log(`✅ Created new capability: ${newCap.name} (${newCap.category})`);
          
          // AUTOMATICALLY ASSIGN: Find companies that match this new capability and assign it to them
          console.log(`🔍 Auto-assigning "${newCap.name}" to matching companies...`);
          
          // Extract meaningful keywords from capability name
          const genericWords = new Set(['services', 'service', 'solutions', 'solution', 'management', 'consulting', 'consultancy', 'design', 'development', 'installation', 'maintenance', 'support']);
          const keywords = newCap.name.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 4 && !genericWords.has(w))
            .slice(0, 3);
          
          if (keywords.length > 0) {
            // Search for companies that mention these keywords
            const orConditions = keywords
              .map(keyword => `description.ilike.%${keyword}%,key_capabilities.ilike.%${keyword}%`)
              .join(",");
            
            const { data: matchingCompanies, error: matchError } = await adminSupabase
              .from("companies")
              .select("id")
              .eq("status", "active")
              .or(orConditions)
              .limit(500); // Limit to avoid too many assignments
            
            if (!matchError && matchingCompanies && matchingCompanies.length > 0) {
              // Filter for relevance - require at least 2 keyword matches or full name match
              const relevantCompanies = matchingCompanies.filter((company: any) => {
                // We need to fetch full company data to check description
                return true; // Will filter in next step
              });
              
              // Fetch full company data for relevance check
              if (matchingCompanies.length > 0) {
                const companyIds = matchingCompanies.map((c: any) => c.id);
                const { data: fullCompanies } = await adminSupabase
                  .from("companies")
                  .select("id, description, key_capabilities")
                  .in("id", companyIds);
                
                const relevantCompanyIds = (fullCompanies || []).filter((company: any) => {
                  const desc = (company.description || "").toLowerCase();
                  const keyCaps = (company.key_capabilities || "").toLowerCase();
                  const combined = `${desc} ${keyCaps}`;
                  
                  const keywordMatches = keywords.filter(kw => combined.includes(kw)).length;
                  const fullNameMatch = combined.includes(newCap.name.toLowerCase());
                  
                  return keywordMatches >= Math.min(2, keywords.length) || fullNameMatch;
                }).map((c: any) => c.id);
                
                if (relevantCompanyIds.length > 0) {
                  // Create capability links for matching companies
                  const capabilityLinks = relevantCompanyIds.map((companyId: string) => ({
                    company_id: companyId,
                    capability_id: newId,
                  }));
                  
                  const { error: linkError } = await adminSupabase
                    .from("company_capabilities")
                    .insert(capabilityLinks);
                  
                  if (linkError) {
                    console.error(`⚠️ Failed to auto-assign capability to companies:`, linkError);
                  } else {
                    console.log(`✅ Auto-assigned "${newCap.name}" to ${relevantCompanyIds.length} matching companies`);
                  }
                } else {
                  console.log(`⚠️ Found ${matchingCompanies.length} companies but none passed relevance filter for "${newCap.name}"`);
                }
              }
            } else {
              console.log(`ℹ️ No companies found matching "${newCap.name}" - capability created but not assigned yet`);
            }
          } else {
            console.log(`⚠️ No meaningful keywords extracted from "${newCap.name}" - skipping auto-assignment`);
          }
        } else {
          console.error("Failed to create new capability:", createError);
        }
      }
    }

    // Map capability names to IDs (for existing capabilities)
    const suggestedCapabilityIds = existingCapabilityNames
      .map((name) => {
        const cap = capabilities.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        return cap?.id;
      })
      .filter((id): id is string => id !== undefined);

    // Combine existing and newly created IDs
    const allCapabilityIds = [...suggestedCapabilityIds, ...createdCapabilityIds];

    // Log capability suggestion event
    await logApiEvent(request, {
      actionType: "tender_viewed", // User is viewing/analyzing tender
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "tender",
      entityId: tenderId,
      details: {
        suggestedCapabilitiesCount: suggestedCapabilityIds.length,
        totalCapabilities: capabilities.length,
      },
    }).catch(() => {}); // Don't fail if logging fails

    // CRITICAL: Filter out newly created capabilities that have no company assignments
    // Only return capabilities that companies actually have (or were just created and might be used)
    // But prioritize existing ones that companies have
    const finalCapabilityIds = allCapabilityIds.filter(id => {
      // Keep if it's a used capability
      if (usedCapabilityIds.has(id)) return true;
      // For newly created ones, we'll include them but they won't find companies
      // The user should be warned about this
      return true; // Include all for now, but prioritize used ones
    });

    // Sort to prioritize used capabilities first
    const prioritizedIds = [
      ...finalCapabilityIds.filter(id => usedCapabilityIds.has(id)),
      ...finalCapabilityIds.filter(id => !usedCapabilityIds.has(id))
    ];

    console.log(`📊 Final suggestion: ${prioritizedIds.filter(id => usedCapabilityIds.has(id)).length} used capabilities, ${prioritizedIds.filter(id => !usedCapabilityIds.has(id)).length} unused/new capabilities`);

    return apiResponse({
      suggestedCapabilityIds: prioritizedIds,
      suggestedCapabilityNames: existingCapabilityNames,
      newCapabilitiesCreated: newCapabilities.length,
      totalCapabilities: capabilities.length + createdCapabilityIds.length,
      usedCapabilitiesCount: prioritizedIds.filter(id => usedCapabilityIds.has(id)).length,
    });
  } catch (error) {
    console.error("Error suggesting capabilities:", error);
    return apiError(
      "Failed to suggest capabilities",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
