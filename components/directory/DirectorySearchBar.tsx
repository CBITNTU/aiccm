"use client";

import { useState } from "react";
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
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Filter, X, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { useTaxonomies } from "@/hooks/useTaxonomies";

interface DirectoryFiltersState {
  searchTerm: string;
  location: string;
  capability: string;
  selectedTaxonomies: string[];
}

interface DirectorySearchBarProps {
  filters: DirectoryFiltersState;
  onFiltersChange: (filters: DirectoryFiltersState) => void;
  onReset: () => void;
  uniqueLocations: string[];
  uniqueCapabilities: string[];
  placeholder?: string;
}

export function DirectorySearchBar({
  filters,
  onFiltersChange,
  onReset,
  uniqueLocations,
  uniqueCapabilities,
  placeholder = "Search companies...",
}: DirectorySearchBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tempTaxonomies, setTempTaxonomies] = useState<string[]>(
    filters.selectedTaxonomies
  );

  // Handle search term change
  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, searchTerm: value });
  };

  // Count active filters (excluding search)
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.location && filters.location !== "all") count++;
    if (filters.capability && filters.capability !== "all") count++;
    if (filters.selectedTaxonomies.length > 0) count++;
    return count;
  };

  // Get active filter pills
  const getActiveFilterPills = () => {
    const pills: { key: string; label: string; value: string }[] = [];

    if (filters.location && filters.location !== "all") {
      pills.push({
        key: "location",
        label: "Location",
        value: filters.location,
      });
    }
    if (filters.capability && filters.capability !== "all") {
      pills.push({
        key: "capability",
        label: "Capability",
        value: filters.capability,
      });
    }
    if (filters.selectedTaxonomies.length > 0) {
      pills.push({
        key: "taxonomies",
        label: "Categories",
        value: `${filters.selectedTaxonomies.length} selected`,
      });
    }

    return pills;
  };

  // Remove individual filter
  const removeFilter = (key: string) => {
    const newFilters = { ...filters };
    if (key === "location") newFilters.location = "all";
    if (key === "capability") newFilters.capability = "all";
    if (key === "taxonomies") newFilters.selectedTaxonomies = [];
    onFiltersChange(newFilters);
  };

  // Handle sheet open - sync temp taxonomies
  const handleSheetOpenChange = (open: boolean) => {
    if (open) {
      setTempTaxonomies(filters.selectedTaxonomies);
    }
    setSheetOpen(open);
  };

  // Apply filters from sheet
  const handleApplyFilters = () => {
    onFiltersChange({ ...filters, selectedTaxonomies: tempTaxonomies });
    setSheetOpen(false);
  };

  const activeFilterCount = getActiveFilterCount();
  const activeFilterPills = getActiveFilterPills();

  return (
    <div className="space-y-3 mb-6">
      {/* Search + Filter Button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 h-11"
            placeholder={placeholder}
            value={filters.searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 gap-2">
              <Filter className="h-4 w-4" />
              Filters
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
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filter Companies</SheetTitle>
              <SheetDescription>
                Refine your company search results
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              {/* Location Filter */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Location</Label>
                <Select
                  value={filters.location}
                  onValueChange={(value) =>
                    onFiltersChange({ ...filters, location: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {uniqueLocations.map((location) => {
                      const safeValue =
                        location && location.trim() ? location.trim() : "unknown";
                      return (
                        <SelectItem key={location} value={safeValue}>
                          {location}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Capability Filter */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Capability</Label>
                <Select
                  value={filters.capability}
                  onValueChange={(value) =>
                    onFiltersChange({ ...filters, capability: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All capabilities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All capabilities</SelectItem>
                    {uniqueCapabilities.map((capability) => {
                      const safeValue =
                        capability && capability.trim()
                          ? capability.trim()
                          : "unknown";
                      return (
                        <SelectItem key={capability} value={safeValue}>
                          {capability}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Taxonomy Filter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Categories</Label>
                  {tempTaxonomies.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {tempTaxonomies.length} selected
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
                Reset
              </Button>
              <SheetClose asChild>
                <Button className="flex-1" onClick={handleApplyFilters}>
                  Apply Filters
                </Button>
              </SheetClose>
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
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Taxonomy Filter Content for Sheet
function TaxonomyFilterContent({
  selectedTaxonomies,
  onTaxonomiesChange,
}: {
  selectedTaxonomies: string[];
  onTaxonomiesChange: (taxonomies: string[]) => void;
}) {
  const [expandedLevel1, setExpandedLevel1] = useState<Record<string, boolean>>({});
  const [expandedLevel2, setExpandedLevel2] = useState<Record<string, boolean>>({});
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
        Loading categories...
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
            <div
              key={level1Tax.id}
              className="border rounded-lg p-2.5 bg-card"
            >
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
                      <div key={level2Tax.id} className="border-l-2 border-muted pl-3 py-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`sheet-${level2Tax.id}`}
                            checked={selectedTaxonomies.includes(level2Tax.id)}
                            onCheckedChange={(checked) =>
                              handleTaxonomyToggle(level2Tax.id, checked as boolean)
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
                              <div key={level3Tax.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`sheet-${level3Tax.id}`}
                                  checked={selectedTaxonomies.includes(level3Tax.id)}
                                  onCheckedChange={(checked) =>
                                    handleTaxonomyToggle(level3Tax.id, checked as boolean)
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
