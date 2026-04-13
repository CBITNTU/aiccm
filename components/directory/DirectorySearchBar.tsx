"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Filter,
  X,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  MapPin,
  Loader2,
} from "lucide-react";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import { useGeocode } from "@/hooks/useGeocode";
import { useTranslations } from "next-intl";

export interface DirectoryFiltersState {
  searchTerm: string;
  selectedTaxonomies: string[];
  locationQuery?: string;
  radiusMiles?: number;
  lat?: number;
  lng?: number;
  locationDisplayName?: string;
}

interface DirectorySearchBarProps {
  filters: DirectoryFiltersState;
  onFiltersChange: (filters: DirectoryFiltersState) => void;
  onReset: () => void;
  placeholder?: string;
  defaultLocationQuery?: string;
}

export function DirectorySearchBar({
  filters,
  onFiltersChange,
  onReset,
  placeholder,
  defaultLocationQuery,
}: DirectorySearchBarProps) {
  const t = useTranslations("Directory");
  const [sheetOpen, setSheetOpen] = useState(false);

  const RADIUS_OPTIONS = [
    { value: "any", label: t("searchBar.anyDistance") },
    { value: "25", label: t("searchBar.within25Miles") },
    { value: "50", label: t("searchBar.within50Miles") },
    { value: "100", label: t("searchBar.within100Miles") },
    { value: "200", label: t("searchBar.within200Miles") },
  ];
  const [tempTaxonomies, setTempTaxonomies] = useState<string[]>(
    filters.selectedTaxonomies,
  );
  const [tempLocationQuery, setTempLocationQuery] = useState(
    filters.locationQuery ?? "",
  );
  const [tempRadius, setTempRadius] = useState(
    filters.radiusMiles?.toString() ?? "any",
  );
  const { geocode, isGeocoding, isEnabled } = useGeocode();
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Pre-fill default location on first mount
  useEffect(() => {
    if (defaultLocationQuery && !filters.locationQuery && !filters.lat) {
      setTempLocationQuery(defaultLocationQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLocationQuery]);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, searchTerm: value });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.selectedTaxonomies.length > 0) count++;
    if (filters.lat != null && filters.lng != null) count++;
    return count;
  };

  const getActiveFilterPills = () => {
    const pills: { key: string; label: string; value: string }[] = [];

    if (filters.selectedTaxonomies.length > 0) {
      pills.push({
        key: "taxonomies",
        label: t("searchBar.categoriesLabel"),
        value: `${filters.selectedTaxonomies.length} ${t("searchBar.selected")}`,
      });
    }

    if (filters.lat != null && filters.lng != null) {
      const locationLabel = filters.locationDisplayName || filters.locationQuery || "Location";
      const radiusLabel = filters.radiusMiles
        ? `Within ${filters.radiusMiles}mi of`
        : "Near";
      pills.push({
        key: "location",
        label: radiusLabel,
        value: locationLabel,
      });
    }

    return pills;
  };

  const removeFilter = (key: string) => {
    const newFilters = { ...filters };
    if (key === "taxonomies") {
      newFilters.selectedTaxonomies = [];
    } else if (key === "location") {
      newFilters.locationQuery = undefined;
      newFilters.radiusMiles = undefined;
      newFilters.lat = undefined;
      newFilters.lng = undefined;
      newFilters.locationDisplayName = undefined;
    }
    onFiltersChange(newFilters);
  };

  const handleSheetOpenChange = (open: boolean) => {
    if (open) {
      setTempTaxonomies(filters.selectedTaxonomies);
      setTempLocationQuery(filters.locationQuery ?? defaultLocationQuery ?? "");
      setTempRadius(filters.radiusMiles?.toString() ?? "any");
      setGeocodeError(null);
    }
    setSheetOpen(open);
  };

  const handleApplyFilters = async () => {
    let lat = filters.lat;
    let lng = filters.lng;
    let displayName = filters.locationDisplayName;
    const locationQuery = tempLocationQuery.trim();
    const radiusMiles = tempRadius && tempRadius !== "any" ? parseInt(tempRadius) : undefined;

    if (locationQuery) {
      const locationChanged = locationQuery !== filters.locationQuery;
      if (locationChanged || lat == null || lng == null) {
        setGeocodeError(null);
        const result = await geocode(locationQuery);
        if (result) {
          lat = result.lat;
          lng = result.lng;
          displayName = result.displayName;
        } else {
          if (isEnabled === false) {
            setGeocodeError(t("searchBar.errorLocationNotConfigured"));
          } else {
            setGeocodeError(t("searchBar.errorLocationNotFound"));
          }
          return;
        }
      }
    } else {
      lat = undefined;
      lng = undefined;
      displayName = undefined;
    }

    onFiltersChange({
      ...filters,
      selectedTaxonomies: tempTaxonomies,
      locationQuery: locationQuery || undefined,
      radiusMiles,
      lat,
      lng,
      locationDisplayName: displayName,
    });
    setSheetOpen(false);
  };

  const activeFilterCount = getActiveFilterCount();
  const activeFilterPills = getActiveFilterPills();

  return (
    <div className="space-y-3 mb-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 h-11"
            placeholder={placeholder ?? t("searchBar.placeholder")}
            value={filters.searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 gap-2">
              <Filter className="h-4 w-4" />
              {t("searchBar.filtersButton")}
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-full sm:max-w-md overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>{t("searchBar.filterTitle")}</SheetTitle>
              <SheetDescription>
                {t("searchBar.filterDescription")}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              {/* Location Filter — only shown when geocoding is configured */}
              {isEnabled !== false && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("searchBar.locationLabel")}
                  </Label>
                  <Input
                    placeholder={t("searchBar.locationPlaceholder")}
                    value={tempLocationQuery}
                    onChange={(e) => {
                      setTempLocationQuery(e.target.value);
                      setGeocodeError(null);
                    }}
                  />
                  <Select value={tempRadius} onValueChange={setTempRadius}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("searchBar.anyDistance")} />
                    </SelectTrigger>
                    <SelectContent>
                      {RADIUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {geocodeError && (
                    <p className="text-sm text-destructive">{geocodeError}</p>
                  )}
                </div>
              )}

              {/* Taxonomy Filter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t("searchBar.categoriesLabel")}</Label>
                  {tempTaxonomies.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {tempTaxonomies.length} {t("searchBar.selected")}
                    </Badge>
                  )}
                </div>
                <TaxonomyFilterContent
                  selectedTaxonomies={tempTaxonomies}
                  onTaxonomiesChange={setTempTaxonomies}
                />
              </div>
            </div>

            <SheetFooter className="flex gap-2 sm:flex-row">
              <Button variant="outline" onClick={onReset} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("searchBar.reset")}
              </Button>
              <Button
                className="flex-1"
                onClick={handleApplyFilters}
                disabled={isGeocoding}
              >
                {isGeocoding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("searchBar.applyFilters")}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Active Filter Pills */}
      {activeFilterPills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilterPills.map((pill) => (
            <Badge
              key={pill.key}
              variant="secondary"
              className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => removeFilter(pill.key)}
            >
              {pill.label}: {pill.value}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {activeFilterPills.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={onReset}
            >
              {t("searchBar.clearAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TaxonomyFilterContent({
  selectedTaxonomies,
  onTaxonomiesChange,
}: {
  selectedTaxonomies: string[];
  onTaxonomiesChange: (taxonomies: string[]) => void;
}) {
  const t = useTranslations("Directory");
  const [expandedLevel1, setExpandedLevel1] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedLevel2, setExpandedLevel2] = useState<Record<string, boolean>>(
    {},
  );
  const { getLevel1, getLevel2, getLevel3, loading } = useTaxonomies();

  const handleTaxonomyToggle = (taxonomyId: string, checked: boolean) => {
    if (checked) {
      onTaxonomiesChange([...selectedTaxonomies, taxonomyId]);
    } else {
      onTaxonomiesChange(selectedTaxonomies.filter((id) => id !== taxonomyId));
    }
  };

  const toggleLevel1 = (id: string) => {
    setExpandedLevel1((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLevel2 = (id: string) => {
    setExpandedLevel2((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        {t("searchBar.loadingCategories")}
      </div>
    );
  }

  const level1Options = getLevel1();

  return (
    <ScrollArea className="h-[300px] pr-2">
      <div className="space-y-2">
        {level1Options.map((level1Tax) => {
          const level2Options = getLevel2(level1Tax.id);
          const isLevel1Expanded = expandedLevel1[level1Tax.id];

          return (
            <div key={level1Tax.id} className="border rounded-lg p-2.5 bg-card">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`sheet-${level1Tax.id}`}
                  checked={selectedTaxonomies.includes(level1Tax.id)}
                  onCheckedChange={(checked) =>
                    handleTaxonomyToggle(level1Tax.id, checked as boolean)
                  }
                />
                <Label
                  htmlFor={`sheet-${level1Tax.id}`}
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  {level1Tax.name}
                </Label>
                {level2Options.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleLevel1(level1Tax.id)}
                    className="h-6 w-6 p-0"
                  >
                    {isLevel1Expanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>

              {isLevel1Expanded && level2Options.length > 0 && (
                <div className="ml-6 mt-2 space-y-1.5">
                  {level2Options.map((level2Tax) => {
                    const level3Options = getLevel3(level2Tax.id);
                    const isLevel2Expanded = expandedLevel2[level2Tax.id];

                    return (
                      <div
                        key={level2Tax.id}
                        className="border-l-2 border-muted pl-3 py-1"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`sheet-${level2Tax.id}`}
                            checked={selectedTaxonomies.includes(level2Tax.id)}
                            onCheckedChange={(checked) =>
                              handleTaxonomyToggle(
                                level2Tax.id,
                                checked as boolean,
                              )
                            }
                          />
                          <Label
                            htmlFor={`sheet-${level2Tax.id}`}
                            className="text-xs cursor-pointer flex-1"
                          >
                            {level2Tax.name}
                          </Label>
                          {level3Options.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleLevel2(level2Tax.id)}
                              className="h-5 w-5 p-0"
                            >
                              {isLevel2Expanded ? (
                                <ChevronDown className="h-2.5 w-2.5" />
                              ) : (
                                <ChevronRight className="h-2.5 w-2.5" />
                              )}
                            </Button>
                          )}
                        </div>

                        {isLevel2Expanded && level3Options.length > 0 && (
                          <div className="ml-5 mt-1 space-y-1">
                            {level3Options.map((level3Tax) => (
                              <div
                                key={level3Tax.id}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={`sheet-${level3Tax.id}`}
                                  checked={selectedTaxonomies.includes(
                                    level3Tax.id,
                                  )}
                                  onCheckedChange={(checked) =>
                                    handleTaxonomyToggle(
                                      level3Tax.id,
                                      checked as boolean,
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={`sheet-${level3Tax.id}`}
                                  className="text-xs cursor-pointer text-muted-foreground"
                                >
                                  {level3Tax.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
