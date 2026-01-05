"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Search, ExternalLink, CheckCircle2, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface CompanySelectionStepProps {
  selectedTaxonomyIds: string[];
  selectedCompanies: Company[];
  onSelectionChange: (companies: Company[]) => void;
}

interface CompanyWithTaxonomies extends Company {
  taxonomies?: Array<{ id: string; name: string }>;
}

export function CompanySelectionStep({
  selectedTaxonomyIds,
  selectedCompanies,
  onSelectionChange,
}: CompanySelectionStepProps) {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [companies, setCompanies] = useState<CompanyWithTaxonomies[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState<CompanyWithTaxonomies | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (supabase && selectedTaxonomyIds.length > 0) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setLoading(false);
    }
  }, [supabase, selectedTaxonomyIds]);

  const fetchCompanies = async () => {
    if (!supabase || selectedTaxonomyIds.length === 0) return;

    try {
      setLoading(true);

      // Find companies that have at least one of the selected taxonomies
      const { data: companyTaxonomies, error: ctError } = await supabase
        .from("company_taxonomies")
        .select("company_id")
        .in("taxonomy_id", selectedTaxonomyIds);

      if (ctError) throw ctError;

      const companyIds = [
        ...new Set(companyTaxonomies?.map((ct) => ct.company_id) || []),
      ];

      if (companyIds.length === 0) {
        setCompanies([]);
        setLoading(false);
        return;
      }

      // Fetch company details (include active and pending_review companies)
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select("*")
        .in("id", companyIds)
        .in("status", ["active", "pending_review"])
        .order("company_name", { ascending: true });

      if (companiesError) throw companiesError;

      // Fetch taxonomies for each company
      const companiesWithTaxonomies = await Promise.all(
        (companiesData || []).map(async (company) => {
          const { data: taxonomies } = await supabase
            .from("company_taxonomies")
            .select("taxonomy_id, taxonomies(id, name)")
            .eq("company_id", company.id)
            .in("taxonomy_id", selectedTaxonomyIds);

          return {
            ...company,
            taxonomies: taxonomies?.map((t: any) => ({
              id: t.taxonomies.id,
              name: t.taxonomies.name,
            })) || [],
          };
        })
      );

      setCompanies(companiesWithTaxonomies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyToggle = (company: CompanyWithTaxonomies, checked: boolean) => {
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

  const viewCompanyDetails = (company: CompanyWithTaxonomies) => {
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

  if (selectedTaxonomyIds.length === 0) {
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
          Select companies that have the capabilities you need. You can view full
          company profiles and select multiple companies for your project.
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
          <CardContent className="py-12 text-center text-muted-foreground">
            {companies.length === 0
              ? "No companies found with the selected capabilities."
              : "No companies match your search."}
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
                            {company.taxonomies && company.taxonomies.length > 0 ? (
                              company.taxonomies.map((tax) => (
                                <Badge key={tax.id} variant="secondary">
                                  {tax.name}
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
                                <span className="text-muted-foreground">Location: </span>
                                <span>{company.postcode}</span>
                              </div>
                            )}
                            {company.contact_email && (
                              <div>
                                <span className="text-muted-foreground">Email: </span>
                                <span>{company.contact_email}</span>
                              </div>
                            )}
                            {company.certifications && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Certifications: </span>
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
                  {selectedCompanies.length} compan{selectedCompanies.length === 1 ? "y" : "ies"} selected
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

              {selectedCompanyDetail.taxonomies && selectedCompanyDetail.taxonomies.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Matching Capabilities</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCompanyDetail.taxonomies.map((tax) => (
                      <Badge key={tax.id} variant="secondary">
                        {tax.name}
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

