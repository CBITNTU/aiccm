"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { useGeocode } from "@/hooks/useGeocode";
import { useOrg } from "@/hooks/useOrg";

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

interface CompaniesStepProps {
  selectedCapabilityIds: string[];
  selectedCompanies: Company[];
  onSelectionChange: (companies: Company[]) => void;
  leadCompanyId?: string | null;
}

interface CompanyWithCapabilities extends Company {
  capabilities?: Array<{ id: string; name: string }>;
}

const RADIUS_OPTIONS = [
  { value: "any", label: "Any distance" },
  { value: "25", label: "25 mi" },
  { value: "50", label: "50 mi" },
  { value: "100", label: "100 mi" },
  { value: "200", label: "200 mi" },
];

export function CompaniesStep({
  selectedCapabilityIds,
  selectedCompanies,
  onSelectionChange,
  leadCompanyId,
}: CompaniesStepProps) {
  const [companies, setCompanies] = useState<CompanyWithCapabilities[]>([]);
  const [distanceMap, setDistanceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyDetail, setSelectedCompanyDetail] =
    useState<CompanyWithCapabilities | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const { selectedOrg } = useOrg();
  const [locationInput, setLocationInput] = useState(
    selectedOrg?.address || selectedOrg?.postcode || "",
  );
  const [radius, setRadius] = useState("any");
  const { geocode, coords, isGeocoding, isEnabled } = useGeocode();

  // Geocode org location on mount
  useEffect(() => {
    const defaultLoc = selectedOrg?.address || selectedOrg?.postcode;
    if (defaultLoc) {
      setLocationInput(defaultLoc);
      geocode(defaultLoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCompanies = useCallback(async () => {
    if (selectedCapabilityIds.length === 0) return;

    try {
      setLoading(true);
      const locationParams = coords
        ? {
            lat: coords.lat,
            lng: coords.lng,
            ...(radius !== "any" && { radiusMiles: parseInt(radius) }),
          }
        : {};

      const result = await api.getCompaniesByCapabilities({
        capabilityIds: selectedCapabilityIds,
        excludeCompanyIds: leadCompanyId ? [leadCompanyId] : [],
        ...locationParams,
      });
      setCompanies(
        (result.companies as unknown as CompanyWithCapabilities[]) || [],
      );
      setDistanceMap(
        (result.distanceByCompany as Record<string, number>) ?? {},
      );
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error(
        "Failed to load companies. Make sure companies have been processed and have capabilities assigned.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedCapabilityIds, coords, radius, leadCompanyId]);

  useEffect(() => {
    if (selectedCapabilityIds.length > 0) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setLoading(false);
    }
  }, [fetchCompanies, selectedCapabilityIds]);

  const handleApplyLocation = async () => {
    const trimmed = locationInput.trim();
    if (trimmed) {
      await geocode(trimmed);
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

  console.log(companies);
  const filteredCompanies = companies.filter((company) => {
    console.log(company);
    const searchLower = searchTerm.toLowerCase();
    return (
      company.companyName?.toLowerCase().includes(searchLower) ||
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

        {/* Location filter — only shown when geocoding is configured */}
        {isEnabled !== false && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Location (city, postcode...)"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyLocation();
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={radius} onValueChange={setRadius}>
              <SelectTrigger className="w-[110px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={handleApplyLocation}
              disabled={isGeocoding}
            >
              {isGeocoding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Apply"
              )}
            </Button>
          </div>
        )}

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

      {/* Selected count badge */}
      {selectedCompanies.length > 0 && (
        <div className="sticky top-0 z-10 bg-background py-2">
          <Badge variant="secondary" className="text-sm">
            {selectedCompanies.length} compan
            {selectedCompanies.length === 1 ? "y" : "ies"} selected
          </Badge>
        </div>
      )}

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
                    The AI created new capabilities that companies don&apos;t
                    have yet
                  </li>
                  <li>
                    Companies haven&apos;t been processed to have these specific
                    capabilities assigned
                  </li>
                </ul>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Solution:</strong> Go back to Step 2 and select
                  capabilities that companies actually have.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {filteredCompanies.map((company) => {
            const isSelected = isCompanySelected(company.id);
            const distance = distanceMap[company.id];
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

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`company-${company.id}`}
                            className="cursor-pointer"
                          >
                            <h3 className="font-semibold text-base truncate">
                              {company.companyName}
                            </h3>
                          </label>

                          {company.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {company.description}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-1 mb-2">
                            {company.capabilities &&
                            company.capabilities.length > 0 ? (
                              company.capabilities.slice(0, 3).map((cap) => (
                                <Badge
                                  key={cap.id}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {cap.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No matching capabilities shown
                              </span>
                            )}
                            {company.capabilities &&
                              company.capabilities.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{company.capabilities.length - 3} more
                                </Badge>
                              )}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {company.postcode && (
                              <span>{company.postcode}</span>
                            )}
                            {distance != null && (
                              <span className="text-primary font-medium">
                                {distance < 1
                                  ? "< 1 mi"
                                  : `${distance.toFixed(1)} mi`}
                              </span>
                            )}
                            {company.contactEmail && (
                              <span className="truncate max-w-[150px]">
                                {company.contactEmail}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewCompanyDetails(company)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-primary mx-auto" />
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

      {selectedCompanies.length > 0 ? (
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
      ) : (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              You can proceed with just your company, or add partners above.
              Click Next to continue.
            </p>
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

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => {
                    const isSelected = isCompanySelected(
                      selectedCompanyDetail.id,
                    );
                    handleCompanyToggle(selectedCompanyDetail, !isSelected);
                    setDetailDialogOpen(false);
                  }}
                >
                  {isCompanySelected(selectedCompanyDetail.id)
                    ? "Remove from Selection"
                    : "Add to Selection"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
