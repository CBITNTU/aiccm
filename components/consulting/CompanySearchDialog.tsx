"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Award, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGeocode } from "@/hooks/useGeocode";
import { useOrg } from "@/hooks/useOrg";

interface Company {
  id: string;
  companyName: string;
  keyCapabilities: string | null;
  certifications: string | null;
  postcode: string | null;
}

interface CompanySearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCompany: (companyId: string) => Promise<void>;
  excludeCompanyIds: string[];
  selectedCapabilityIds?: string[];
}

const RADIUS_OPTIONS = [
  { value: "any", label: "Any distance" },
  { value: "25", label: "25 mi" },
  { value: "50", label: "50 mi" },
  { value: "100", label: "100 mi" },
  { value: "200", label: "200 mi" },
];

export function CompanySearchDialog({
  open,
  onOpenChange,
  onAddCompany,
  excludeCompanyIds,
  selectedCapabilityIds = [],
}: CompanySearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [distanceMap, setDistanceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const { selectedOrg } = useOrg();
  const [locationInput, setLocationInput] = useState("");
  const [radius, setRadius] = useState("any");
  const { geocode, coords, isGeocoding, isEnabled } = useGeocode();

  // Pre-fill location from org on open
  useEffect(() => {
    if (open) {
      const defaultLoc = selectedOrg?.address || selectedOrg?.postcode || "";
      setLocationInput(defaultLoc);
      setRadius("any");
      if (defaultLoc) {
        geocode(defaultLoc);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const searchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const locationParams = coords
        ? {
            lat: coords.lat,
            lng: coords.lng,
            ...(radius !== "any" && { radiusMiles: parseInt(radius) }),
          }
        : {};

      if (selectedCapabilityIds && selectedCapabilityIds.length > 0) {
        const result = await api.getCompaniesByCapabilities({
          capabilityIds: selectedCapabilityIds,
          excludeCompanyIds,
          ...locationParams,
        });
        let filtered = (result.companies as unknown as Company[]) || [];

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              c.companyName.toLowerCase().includes(q) ||
              c.keyCapabilities?.toLowerCase().includes(q) ||
              c.postcode?.toLowerCase().includes(q),
          );
        }

        setCompanies(filtered);
        setDistanceMap(
          (result.distanceByCompany as Record<string, number>) ?? {},
        );
      } else {
        const result = await api.getDirectory({
          search: searchQuery || undefined,
          limit: 20,
          ...locationParams,
        });
        let filtered =
          (result.companies as unknown as Company[]) || [];

        if (excludeCompanyIds.length > 0) {
          filtered = filtered.filter(
            (c) => !excludeCompanyIds.includes(c.id),
          );
        }

        setCompanies(filtered);
        setDistanceMap(
          (result.distanceByCompany as Record<string, number>) ?? {},
        );
      }
    } catch (error: unknown) {
      console.error("Error searching companies:", error);
      toast.error("Failed to search companies");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCapabilityIds, excludeCompanyIds, coords, radius]);

  useEffect(() => {
    if (open) {
      searchCompanies();
    }
  }, [open, searchCompanies]);

  const handleApplyLocation = async () => {
    const trimmed = locationInput.trim();
    if (trimmed) {
      await geocode(trimmed);
    }
  };

  const handleAdd = async (companyId: string) => {
    try {
      setAdding(companyId);
      await onAddCompany(companyId);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error adding company:", error);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Company to Team</DialogTitle>
          <DialogDescription>
            Search and add companies from the platform to your consulting team
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by company name, capabilities, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

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

          <div className="h-[400px] overflow-y-auto overflow-x-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No companies found
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate">
                          {company.companyName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {company.postcode || "N/A"}
                          </span>
                          {distanceMap[company.id] != null && (
                            <span className="text-primary font-medium shrink-0">
                              {distanceMap[company.id] < 1
                                ? "< 1 mi"
                                : `${distanceMap[company.id].toFixed(1)} mi`}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => handleAdd(company.id)}
                        disabled={adding === company.id}
                      >
                        {adding === company.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>

                    {company.keyCapabilities && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {company.keyCapabilities}
                      </p>
                    )}

                    {company.certifications && (
                      <div className="text-sm text-muted-foreground flex items-start gap-2">
                        <Award className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1">
                          {company.certifications}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
