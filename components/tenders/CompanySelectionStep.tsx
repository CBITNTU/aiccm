"use client";

/* eslint-disable react/no-unescaped-entities -- company/query result types; copy uses quotes */
import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
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

interface Company {
  id: string;
  companyName: string;
  companiesHouseNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  postcode?: string | null;
  address?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  keyCapabilities?: string | null;
  certifications?: string | null;
  status?: string | null;
  userId?: string | null;
  isSystemCompany?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

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
  const [companies, setCompanies] = useState<CompanyWithCapabilities[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyDetail, setSelectedCompanyDetail] =
    useState<CompanyWithCapabilities | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    if (selectedCapabilityIds.length > 0) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when capabilities change
  }, [selectedCapabilityIds]);

  const fetchCompanies = async () => {
    if (selectedCapabilityIds.length === 0) return;

    try {
      setLoading(true);
      const result = await api.getCompaniesByCapabilities({
        capabilityIds: selectedCapabilityIds,
      });
      setCompanies((result.companies as unknown as CompanyWithCapabilities[]) || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
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
      company.companyName.toLowerCase().includes(searchLower) ||
      company.description?.toLowerCase().includes(searchLower) ||
      company.postcode?.toLowerCase().includes(searchLower) ||
      company.contactEmail?.toLowerCase().includes(searchLower)
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
                              {company.companyName}
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
                            {company.contactEmail && (
                              <div>
                                <span className="text-muted-foreground">
                                  Email:{" "}
                                </span>
                                <span>{company.contactEmail}</span>
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
              {selectedCompanyDetail?.companyName}
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
                {selectedCompanyDetail.contactEmail && (
                  <div>
                    <h4 className="font-semibold mb-1">Email</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedCompanyDetail.contactEmail}
                    </p>
                  </div>
                )}
                {selectedCompanyDetail.contactPhone && (
                  <div>
                    <h4 className="font-semibold mb-1">Phone</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedCompanyDetail.contactPhone}
                    </p>
                  </div>
                )}
                {selectedCompanyDetail.websiteUrl && (
                  <div>
                    <h4 className="font-semibold mb-1">Website</h4>
                    <a
                      href={selectedCompanyDetail.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {selectedCompanyDetail.websiteUrl}
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

              {selectedCompanyDetail.keyCapabilities && (
                <div>
                  <h4 className="font-semibold mb-2">Key Capabilities</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedCompanyDetail.keyCapabilities}
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
