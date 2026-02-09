"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities -- company/query result types; copy uses quotes */
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  Search,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface CompanySelectionStepProps {
  selectedCapabilityIds: string[];
  selectedCompanies: Company[];
  onSelectionChange: (companies: Company[]) => void;
}

interface CompanyWithCapabilities extends Company {
  capabilities?: Array<{ id: string; name: string }>;
}

export function CompanySelectionStep({
  selectedCapabilityIds,
  selectedCompanies,
  onSelectionChange,
}: CompanySelectionStepProps) {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );
  const [companies, setCompanies] = useState<CompanyWithCapabilities[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyDetail, setSelectedCompanyDetail] =
    useState<CompanyWithCapabilities | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (supabase && selectedCapabilityIds.length > 0) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when supabase/capabilities change
  }, [supabase, selectedCapabilityIds]);

  const fetchCompanies = async () => {
    if (!supabase || selectedCapabilityIds.length === 0) return;

    try {
      setLoading(true);

      console.log(
        `🔍 Fetching companies with ${selectedCapabilityIds.length} capability ID(s):`,
        selectedCapabilityIds,
      );

      // First, check if this capability exists in company_capabilities_ref
      const { data: capabilityCheck } = await supabase
        .from("company_capabilities_ref")
        .select("id, name, category")
        .in("id", selectedCapabilityIds);

      console.log(
        `📋 Capability check - Found ${capabilityCheck?.length || 0} capability(ies) in ref table:`,
        capabilityCheck?.map((c) => ({ id: c.id, name: c.name })),
      );

      // Check how many companies have capabilities assigned
      const { count: totalCompanyCapabilities } = await supabase
        .from("company_capabilities")
        .select("*", { count: "exact", head: true });

      console.log(
        `📊 Total company-capability links in database: ${totalCompanyCapabilities || 0}`,
      );

      if ((totalCompanyCapabilities || 0) === 0) {
        console.warn(
          "⚠️ WARNING: The company_capabilities junction table is empty!",
        );
        console.warn(
          "⚠️ Companies need to be processed by the AI service to populate capabilities.",
        );
        console.warn(
          "⚠️ Please run 'Regenerate All Company Capabilities' in the admin panel.",
        );
      }

      // First, check how many company_capabilities links exist for these capability IDs (without join)
      const { count: linkCount, error: _countError } = await supabase
        .from("company_capabilities")
        .select("*", { count: "exact", head: true })
        .in("capability_id", selectedCapabilityIds);

      console.log(
        `🔗 Found ${linkCount || 0} company-capability links for these capability IDs`,
      );

      // If no links exist for these capability IDs, they might be newly created capabilities
      // that haven't been assigned to companies yet
      if ((linkCount || 0) === 0) {
        console.warn(
          "⚠️ WARNING: No companies have these specific capabilities assigned!",
        );
        console.warn(
          "⚠️ These capabilities may have been newly created by AI but companies haven't been processed yet.",
        );
        console.warn("⚠️ Capability IDs:", selectedCapabilityIds);

        // Let's check if ANY companies have capabilities at all
        const { count: totalLinks } = await supabase
          .from("company_capabilities")
          .select("*", { count: "exact", head: true });
        console.log(
          `📊 Total company-capability links in entire database: ${totalLinks || 0}`,
        );
      }

      // Use a join query to avoid URL length issues with large company lists
      // This directly joins company_capabilities with companies
      const { data: companyCapabilitiesData, error: joinError } = await supabase
        .from("company_capabilities")
        .select(
          `
          company_id,
          capability_id,
          companies!inner(
            id,
            company_name,
            companies_house_number,
            contact_email,
            contact_phone,
            postcode,
            address,
            description,
            website_url,
            key_capabilities,
            certifications,
            status,
            user_id,
            is_system_company,
            created_at,
            updated_at
          )
        `,
        )
        .in("capability_id", selectedCapabilityIds);

      if (joinError) {
        console.error(
          "❌ Error fetching companies by capabilities:",
          joinError,
        );
        console.error(
          "❌ Join error details:",
          JSON.stringify(joinError, null, 2),
        );
        throw joinError;
      }

      console.log(
        `📊 Found ${companyCapabilitiesData?.length || 0} company-capability matches after join`,
      );

      // If we have links but no results after join, RLS might be filtering companies
      if (
        (linkCount || 0) > 0 &&
        (companyCapabilitiesData?.length || 0) === 0
      ) {
        console.warn(
          "⚠️ WARNING: Company-capability links exist but join returned 0 results!",
        );
        console.warn(
          "⚠️ This suggests RLS policies on 'companies' table are filtering out results.",
        );
      }

      // FALLBACK: If no companies found by capability IDs, try STRICT text search
      // Only search if the capability name contains specific industry terms, not generic words
      if (
        (companyCapabilitiesData?.length || 0) === 0 &&
        capabilityCheck &&
        capabilityCheck.length > 0
      ) {
        console.log(
          "🔄 FALLBACK: No companies found by capability IDs, trying strict text search...",
        );

        // Extract meaningful keywords from capability names (avoid generic words)
        const genericWords = new Set([
          "services",
          "service",
          "solutions",
          "solution",
          "management",
          "consulting",
          "consultancy",
          "design",
          "development",
          "installation",
          "maintenance",
          "support",
        ]);

        const searchKeywords = capabilityCheck
          .map((c) => {
            const words = c.name.toLowerCase().split(/\s+/);
            // Get the most specific/unique words (not generic)
            return words.filter((w) => w.length > 4 && !genericWords.has(w));
          })
          .flat()
          .filter((term, index, arr) => arr.indexOf(term) === index) // Unique
          .slice(0, 3); // Limit to 3 most specific keywords

        // Only do fallback if we have meaningful keywords
        if (searchKeywords.length === 0) {
          console.log(
            "⚠️ FALLBACK: No meaningful keywords extracted, skipping text search",
          );
        } else {
          console.log(
            `🔍 FALLBACK: Searching for specific keywords:`,
            searchKeywords,
          );

          // Build OR query - require ALL keywords to appear (more strict)
          // Search in description and key_capabilities only (not company name to avoid false matches)
          const orConditions = searchKeywords
            .map(
              (keyword) =>
                `description.ilike.%${keyword}%,key_capabilities.ilike.%${keyword}%`,
            )
            .join(",");

          // Search companies by description/key_capabilities text
          const { data: textSearchResults, error: textSearchError } =
            await supabase
              .from("companies")
              .select(
                "id, company_name, companies_house_number, contact_email, contact_phone, postcode, address, description, website_url, key_capabilities, certifications, status, user_id, is_system_company, created_at, updated_at",
              )
              .eq("status", "active")
              .or(orConditions)
              .limit(50); // Lower limit for fallback

          if (
            !textSearchError &&
            textSearchResults &&
            textSearchResults.length > 0
          ) {
            console.log(
              `✅ FALLBACK: Found ${textSearchResults.length} companies via text search`,
            );

            // FILTER: Only keep companies where the description/key_capabilities actually mentions the capability terms
            // This prevents false matches (e.g., cutlery company matching "asbestos" because it has "as" in the name)
            const filteredResults = textSearchResults.filter((company: any) => {
              const desc = (company.description || "").toLowerCase();
              const keyCaps = (company.key_capabilities || "").toLowerCase();
              const combined = `${desc} ${keyCaps}`;

              // Check if at least 2 of the search keywords appear in the description
              // OR if the full capability name appears
              const keywordMatches = searchKeywords.filter((keyword) =>
                combined.includes(keyword),
              ).length;
              const fullNameMatches = capabilityCheck.some((cap) => {
                const fullName = cap.name.toLowerCase();
                return (
                  combined.includes(fullName) ||
                  combined.includes(fullName.replace(/\s+/g, " "))
                );
              });

              // Require either: 2+ keyword matches OR full capability name match
              return (
                keywordMatches >= Math.min(2, searchKeywords.length) ||
                fullNameMatches
              );
            });

            console.log(
              `🔍 FALLBACK: Filtered to ${filteredResults.length} relevant companies (after relevance check)`,
            );

            if (filteredResults.length > 0) {
              // Convert to CompanyWithCapabilities format
              const fallbackCompanies = filteredResults.map((company: any) => ({
                ...company,
                capabilities: capabilityCheck.map((c) => ({
                  id: c.id,
                  name: c.name,
                })),
              }));

              // Deduplicate
              const uniqueFallbackCompanies = new Map<
                string,
                CompanyWithCapabilities
              >();
              fallbackCompanies.forEach((company: any) => {
                if (!uniqueFallbackCompanies.has(company.id)) {
                  uniqueFallbackCompanies.set(company.id, company);
                }
              });

              const companiesArray = Array.from(
                uniqueFallbackCompanies.values(),
              ).sort((a, b) => a.company_name.localeCompare(b.company_name));

              // Fetch capabilities for each company (only the selected ones) if they exist
              const companiesWithCapabilities = await Promise.all(
                companiesArray.map(async (company) => {
                  // Try to get actual capability links if they exist
                  const { data: capabilities } = await supabase
                    .from("company_capabilities")
                    .select("capability_id, company_capabilities_ref(id, name)")
                    .eq("company_id", company.id)
                    .in("capability_id", selectedCapabilityIds);

                  return {
                    ...company,
                    capabilities:
                      capabilities?.map((c: any) => ({
                        id: c.company_capabilities_ref.id,
                        name: c.company_capabilities_ref.name,
                      })) ||
                      capabilityCheck.map((c) => ({ id: c.id, name: c.name })),
                  };
                }),
              );

              console.log(
                `✅ Loaded ${companiesWithCapabilities.length} unique companies via strict text search fallback`,
              );
              setCompanies(companiesWithCapabilities);
              setLoading(false);
              return;
            } else {
              console.log(
                "⚠️ FALLBACK: Text search found companies but none passed relevance filter",
              );
            }
          } else {
            if (textSearchError) {
              console.error("⚠️ FALLBACK: Text search error:", textSearchError);
            } else {
              console.log("⚠️ FALLBACK: Text search also found 0 companies");
            }
          }
        }
      }

      // Deduplicate companies (a company may have multiple matching capabilities)
      // and filter by status
      const uniqueCompanies = new Map<string, CompanyWithCapabilities>();

      (companyCapabilitiesData || []).forEach((item: any) => {
        const company = item.companies;
        if (
          company &&
          (company.status === "active" ||
            company.status === "pending_review") &&
          !uniqueCompanies.has(company.id)
        ) {
          uniqueCompanies.set(company.id, {
            ...company,
            capabilities: [],
          });
        }
      });

      // Convert map to array and sort
      const companiesArray = Array.from(uniqueCompanies.values()).sort((a, b) =>
        a.company_name.localeCompare(b.company_name),
      );

      // Fetch capabilities for each company (only the selected ones)
      const companiesWithCapabilities = await Promise.all(
        companiesArray.map(async (company) => {
          const { data: capabilities } = await supabase
            .from("company_capabilities")
            .select("capability_id, company_capabilities_ref(id, name)")
            .eq("company_id", company.id)
            .in("capability_id", selectedCapabilityIds);

          return {
            ...company,
            capabilities:
              capabilities?.map((c: any) => ({
                id: c.company_capabilities_ref.id,
                name: c.company_capabilities_ref.name,
              })) || [],
          };
        }),
      );

      console.log(
        `✅ Loaded ${companiesWithCapabilities.length} unique companies with matching capabilities`,
      );
      setCompanies(companiesWithCapabilities);
    } catch (error) {
      console.error("❌ Error fetching companies:", error);
      toast.error(
        "Failed to load companies. Make sure companies have been processed and have capabilities assigned.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyToggle = (
    company: CompanyWithCapabilities,
    checked: boolean,
  ) => {
    if (checked) {
      onSelectionChange([...selectedCompanies, company]);
    } else {
      onSelectionChange(selectedCompanies.filter((c) => c.id !== company.id));
    }
  };

  const isCompanySelected = (companyId: string): boolean => {
    return selectedCompanies.some((c) => c.id === companyId);
  };

  const filteredCompanies = companies.filter((company) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      company.company_name.toLowerCase().includes(searchLower) ||
      company.description?.toLowerCase().includes(searchLower) ||
      company.postcode?.toLowerCase().includes(searchLower) ||
      company.contact_email?.toLowerCase().includes(searchLower)
    );
  });

  const viewCompanyDetails = (company: CompanyWithCapabilities) => {
    setSelectedCompanyDetail(company);
    setDetailDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading companies...</span>
      </div>
    );
  }

  if (selectedCapabilityIds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Please select capabilities in the previous step.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Select companies that have the capabilities you need. You can view
          full company profiles and select multiple companies for your project.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-muted-foreground">
              {companies.length === 0
                ? "No companies found with the selected capabilities."
                : "No companies match your search."}
            </p>
            {companies.length === 0 && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-left max-w-2xl mx-auto">
                <p className="text-sm text-yellow-900 dark:text-yellow-100 font-medium mb-2">
                  Why no companies are showing:
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                  The selected capabilities are not assigned to any companies
                  yet. This can happen when:
                </p>
                <ul className="text-sm text-yellow-800 dark:text-yellow-200 list-disc list-inside mb-2 space-y-1">
                  <li>
                    The AI created new capabilities that companies don't have
                    yet
                  </li>
                  <li>
                    Companies haven't been processed to have these specific
                    capabilities assigned
                  </li>
                </ul>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Solution:</strong> Go back to Step 2 and select
                  capabilities that companies actually have. If you're an admin,
                  you can run "Regenerate All Company Capabilities" to process
                  companies, but note that newly created capabilities won't be
                  assigned unless companies are manually updated.
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                  Tip: The AI should suggest capabilities from companies that
                  already exist, not create brand new ones.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredCompanies.map((company) => {
            const isSelected = isCompanySelected(company.id);
            return (
              <Card
                key={company.id}
                className={`transition-all ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handleCompanyToggle(company, checked === true)
                      }
                      id={`company-${company.id}`}
                      className="mt-1"
                    />

                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <label
                            htmlFor={`company-${company.id}`}
                            className="cursor-pointer"
                          >
                            <h3 className="font-semibold text-lg mb-1">
                              {company.company_name}
                            </h3>
                          </label>

                          {company.description && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                              {company.description}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2 mb-3">
                            {company.capabilities &&
                            company.capabilities.length > 0 ? (
                              company.capabilities.map((cap) => (
                                <Badge key={cap.id} variant="secondary">
                                  {cap.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No matching capabilities shown
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {company.postcode && (
                              <div>
                                <span className="text-muted-foreground">
                                  Location:{" "}
                                </span>
                                <span>{company.postcode}</span>
                              </div>
                            )}
                            {company.contact_email && (
                              <div>
                                <span className="text-muted-foreground">
                                  Email:{" "}
                                </span>
                                <span>{company.contact_email}</span>
                              </div>
                            )}
                            {company.certifications && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">
                                  Certifications:{" "}
                                </span>
                                <span className="line-clamp-1">
                                  {company.certifications}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewCompanyDetails(company)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Profile
                          </Button>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-primary mt-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedCompanies.length > 0 && (
        <Card className="bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {selectedCompanies.length} compan
                  {selectedCompanies.length === 1 ? "y" : "ies"} selected
                </p>
                <p className="text-sm text-muted-foreground">
                  Continue to review and create your project
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {selectedCompanyDetail?.company_name}
            </DialogTitle>
          </DialogHeader>

          {selectedCompanyDetail && (
            <div className="space-y-6 mt-4">
              {selectedCompanyDetail.description && (
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedCompanyDetail.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedCompanyDetail.postcode && (
                  <div>
                    <h4 className="font-semibold mb-1">Location</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedCompanyDetail.postcode}
                    </p>
                  </div>
                )}
                {selectedCompanyDetail.contact_email && (
                  <div>
                    <h4 className="font-semibold mb-1">Email</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedCompanyDetail.contact_email}
                    </p>
                  </div>
                )}
                {selectedCompanyDetail.contact_phone && (
                  <div>
                    <h4 className="font-semibold mb-1">Phone</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedCompanyDetail.contact_phone}
                    </p>
                  </div>
                )}
                {selectedCompanyDetail.website_url && (
                  <div>
                    <h4 className="font-semibold mb-1">Website</h4>
                    <a
                      href={selectedCompanyDetail.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {selectedCompanyDetail.website_url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {selectedCompanyDetail.certifications && (
                <div>
                  <h4 className="font-semibold mb-2">Certifications</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedCompanyDetail.certifications}
                  </p>
                </div>
              )}

              {selectedCompanyDetail.key_capabilities && (
                <div>
                  <h4 className="font-semibold mb-2">Key Capabilities</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedCompanyDetail.key_capabilities}
                  </p>
                </div>
              )}

              {selectedCompanyDetail.capabilities &&
                selectedCompanyDetail.capabilities.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">
                      Matching Capabilities
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedCompanyDetail.capabilities.map((cap) => (
                        <Badge key={cap.id} variant="secondary">
                          {cap.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
