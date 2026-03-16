import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import {
  geocodeLocation,
  buildCompanyGeoQuery,
  isGeocodingEnabled,
} from "@/lib/geocode";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;
    const supabase = createAdminClient();

    // Check access
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    // Check if owner
    const { data: ownerCheck } = await supabase
      .from("companies")
      .select("user_id")
      .eq("id", companyId)
      .single();

    const isOwner = ownerCheck?.user_id === user.id;

    // Fetch company
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (error) throw error;

    // Fetch capabilities
    const { data: capabilitiesData } = await supabase
      .from("company_capabilities")
      .select("company_capabilities_ref(id, name, category)")
      .eq("company_id", companyId);

    const capabilities = (capabilitiesData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => cc.company_capabilities_ref)
      .filter(Boolean);

    // Fetch markets
    const { data: marketsData } = await supabase
      .from("company_markets")
      .select("markets(id, name, parent_id, sort_order)")
      .eq("company_id", companyId);

    const markets = (marketsData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cm: any) => cm.markets)
      .filter(Boolean);

    // Fetch standards
    const { data: standardsData } = await supabase
      .from("company_standards")
      .select("standards_ref(id, name, parent_id, sort_order)")
      .eq("company_id", companyId);

    const standards = (standardsData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cs: any) => cs.standards_ref)
      .filter(Boolean);

    return apiResponse({ company: data, isOwner, capabilities, markets, standards });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;
    const supabase = createAdminClient();

    // Only owner or member can update
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const body = await request.json();

    // Whitelist allowed fields
    const allowedFields = [
      "company_name",
      "description",
      "key_capabilities",
      "postcode",
      "contact_email",
      "website_url",
      "contact_phone",
      "operation_locations",
      "certifications",
      "past_projects",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Auto-geocode when postcode or address changes
    if (isGeocodingEnabled() && ("postcode" in body || "address" in body)) {
      const geoQuery = buildCompanyGeoQuery(
        (body.address as string) ?? null,
        (body.postcode as string) ?? null,
      );
      if (geoQuery) {
        const coords = await geocodeLocation(geoQuery);
        if (coords) {
          updates.latitude = coords.lat;
          updates.longitude = coords.lng;
        }
      }
    }

    const { data, error } = await supabase
      .from("companies")
      .update(updates)
      .eq("id", companyId)
      .select()
      .single();

    if (error) throw error;

    return apiResponse({ company: data });
  } catch (error) {
    return handleApiError(error);
  }
}
