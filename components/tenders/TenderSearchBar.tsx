"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import {
  Search,
  Filter,
  X,
  RotateCcw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// Database filters interface
interface TenderFiltersState {
  keyword?: string;
  location?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  selectedTaxonomies?: string[];
}

// Matching filters interface
interface MatchingFiltersState {
  keyword?: string;
  sortBy: string;
  sortDirection: string;
  minScore: number;
  maxScore: number;
  showApplied: string;
  quickFilter?: string | null;
}

type FilterType = "database" | "matching";

interface TenderSearchBarProps {
  filterType: FilterType;
  // Database filter props
  databaseFilters?: TenderFiltersState;
  onDatabaseFiltersChange?: (filters: TenderFiltersState) => void;
  // Matching filter props
  matchingFilters?: MatchingFiltersState;
  onMatchingFiltersChange?: (filters: MatchingFiltersState) => void;
  // Common
  onReset: () => void;
  placeholder?: string;
}

export function TenderSearchBar({
  filterType,
  databaseFilters,
  onDatabaseFiltersChange,
  matchingFilters,
  onMatchingFiltersChange,
  onReset,
  placeholder = "Search tenders...",
}: TenderSearchBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Get keyword based on filter type
  const keyword =
    filterType === "database"
      ? databaseFilters?.keyword || ""
      : matchingFilters?.keyword || "";

  // Handle keyword change
  const handleKeywordChange = (value: string) => {
    if (
      filterType === "database" &&
      onDatabaseFiltersChange &&
      databaseFilters
    ) {
      onDatabaseFiltersChange({ ...databaseFilters, keyword: value });
    } else if (
      filterType === "matching" &&
      onMatchingFiltersChange &&
      matchingFilters
    ) {
      onMatchingFiltersChange({ ...matchingFilters, keyword: value });
    }
  };

  // Count active filters (excluding keyword)
  const getActiveFilterCount = () => {
    if (filterType === "database" && databaseFilters) {
      let count = 0;
      if (databaseFilters.location) count++;
      if (databaseFilters.status) count++;
      if (databaseFilters.budgetMin) count++;
      if (databaseFilters.budgetMax) count++;
      if (databaseFilters.dateFrom) count++;
      if (databaseFilters.dateTo) count++;
      if (
        databaseFilters.selectedTaxonomies &&
        databaseFilters.selectedTaxonomies.length > 0
      )
        count++;
      return count;
    } else if (filterType === "matching" && matchingFilters) {
      let count = 0;
      if (matchingFilters.sortBy !== "overall_score") count++;
      if (matchingFilters.sortDirection !== "desc") count++;
      if (matchingFilters.minScore > 0 || matchingFilters.maxScore < 100)
        count++;
      if (matchingFilters.showApplied !== "all") count++;
      if (matchingFilters.quickFilter) count++;
      return count;
    }
    return 0;
  };

  // Get active filter pills
  const getActiveFilterPills = () => {
    const pills: { key: string; label: string; value: string }[] = [];

    if (filterType === "database" && databaseFilters) {
      if (databaseFilters.location)
        pills.push({
          key: "location",
          label: "Location",
          value: databaseFilters.location,
        });
      if (databaseFilters.status)
        pills.push({
          key: "status",
          label: "Status",
          value: databaseFilters.status,
        });
      if (databaseFilters.budgetMin)
        pills.push({
          key: "budgetMin",
          label: "Min Budget",
          value: `£${databaseFilters.budgetMin.toLocaleString()}`,
        });
      if (databaseFilters.budgetMax)
        pills.push({
          key: "budgetMax",
          label: "Max Budget",
          value: `£${databaseFilters.budgetMax.toLocaleString()}`,
        });
      if (databaseFilters.dateFrom)
        pills.push({
          key: "dateFrom",
          label: "From",
          value: databaseFilters.dateFrom,
        });
      if (databaseFilters.dateTo)
        pills.push({
          key: "dateTo",
          label: "To",
          value: databaseFilters.dateTo,
        });
    } else if (filterType === "matching" && matchingFilters) {
      if (matchingFilters.minScore > 0 || matchingFilters.maxScore < 100)
        pills.push({
          key: "scoreRange",
          label: "Score",
          value: `${matchingFilters.minScore}-${matchingFilters.maxScore}%`,
        });
      if (matchingFilters.showApplied !== "all")
        pills.push({
          key: "showApplied",
          label: "Show",
          value: matchingFilters.showApplied,
        });
      if (matchingFilters.quickFilter)
        pills.push({
          key: "quickFilter",
          label: "Quick",
          value: matchingFilters.quickFilter.replace("_", " "),
        });
    }

    return pills;
  };

  // Remove individual filter
  const removeFilter = (key: string) => {
    if (
      filterType === "database" &&
      onDatabaseFiltersChange &&
      databaseFilters
    ) {
      const newFilters = { ...databaseFilters };
      if (key === "location") newFilters.location = undefined;
      if (key === "status") newFilters.status = undefined;
      if (key === "budgetMin") newFilters.budgetMin = undefined;
      if (key === "budgetMax") newFilters.budgetMax = undefined;
      if (key === "dateFrom") newFilters.dateFrom = undefined;
      if (key === "dateTo") newFilters.dateTo = undefined;
      onDatabaseFiltersChange(newFilters);
    } else if (
      filterType === "matching" &&
      onMatchingFiltersChange &&
      matchingFilters
    ) {
      const newFilters = { ...matchingFilters };
      if (key === "scoreRange") {
        newFilters.minScore = 0;
        newFilters.maxScore = 100;
      }
      if (key === "showApplied") newFilters.showApplied = "all";
      if (key === "quickFilter") newFilters.quickFilter = null;
      onMatchingFiltersChange(newFilters);
    }
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
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
          />
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
          <SheetContent
            side="right"
            className="w-full sm:max-w-md overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>
                {filterType === "database"
                  ? "Filter Tenders"
                  : "Filter & Sort Matches"}
              </SheetTitle>
              <SheetDescription>
                {filterType === "database"
                  ? "Refine your tender search results"
                  : "Filter and sort your matching results"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              {filterType === "database" &&
                databaseFilters &&
                onDatabaseFiltersChange && (
                  <DatabaseFilterContent
                    filters={databaseFilters}
                    onFiltersChange={onDatabaseFiltersChange}
                  />
                )}
              {filterType === "matching" &&
                matchingFilters &&
                onMatchingFiltersChange && (
                  <MatchingFilterContent
                    filters={matchingFilters}
                    onFiltersChange={onMatchingFiltersChange}
                  />
                )}
            </div>

            <SheetFooter className="flex gap-2 sm:flex-row">
              <Button variant="outline" onClick={onReset} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <SheetClose asChild>
                <Button className="flex-1">Apply Filters</Button>
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

// Database Filter Content Component
function DatabaseFilterContent({
  filters,
  onFiltersChange,
}: {
  filters: TenderFiltersState;
  onFiltersChange: (filters: TenderFiltersState) => void;
}) {
  const handleChange = (key: string, value: string | number | null) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const formatDateForInput = (date: string | undefined) => {
    if (!date) return "";
    return date;
  };

  return (
    <>
      {/* Date Range */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Date Range</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              From
            </Label>
            <Input
              type="date"
              value={formatDateForInput(filters.dateFrom)}
              onChange={(e) => handleChange("dateFrom", e.target.value || null)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              To
            </Label>
            <Input
              type="date"
              value={formatDateForInput(filters.dateTo)}
              onChange={(e) => handleChange("dateTo", e.target.value || null)}
            />
          </div>
        </div>
      </div>

      {/* Budget Range */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Budget Range (£)</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Minimum
            </Label>
            <Input
              type="number"
              placeholder="e.g. 10,000"
              value={filters.budgetMin || ""}
              onChange={(e) =>
                handleChange(
                  "budgetMin",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Maximum
            </Label>
            <Input
              type="number"
              placeholder="e.g. 1,000,000"
              value={filters.budgetMax || ""}
              onChange={(e) =>
                handleChange(
                  "budgetMax",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Status</Label>
        <Select
          value={filters.status || "all"}
          onValueChange={(value) =>
            handleChange("status", value === "all" ? null : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closing_soon">Closing Soon</SelectItem>
            <SelectItem value="framework">Framework</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Location</Label>
        <Input
          placeholder="e.g. London, Manchester"
          value={filters.location || ""}
          onChange={(e) => handleChange("location", e.target.value || null)}
        />
      </div>
    </>
  );
}

// Matching Filter Content Component
function MatchingFilterContent({
  filters,
  onFiltersChange,
}: {
  filters: MatchingFiltersState;
  onFiltersChange: (filters: MatchingFiltersState) => void;
}) {
  const handleChange = (
    key: keyof MatchingFiltersState,
    value: string | number | null,
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleScoreRangeChange = (values: number[]) => {
    onFiltersChange({
      ...filters,
      minScore: values[0],
      maxScore: values[1],
    });
  };

  return (
    <>
      {/* Sort Options */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Sort By</Label>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={filters.sortBy || "overall_score"}
            onValueChange={(value) => handleChange("sortBy", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overall_score">Overall Score</SelectItem>
              <SelectItem value="capability_score">Capability Match</SelectItem>
              <SelectItem value="experience_score">Experience Match</SelectItem>
              <SelectItem value="location_score">Location Match</SelectItem>
              <SelectItem value="certification_score">
                Certification Match
              </SelectItem>
              <SelectItem value="created_at">Date Analyzed</SelectItem>
              <SelectItem value="deadline">Tender Deadline</SelectItem>
              <SelectItem value="budget">Budget</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.sortDirection || "desc"}
            onValueChange={(value) => handleChange("sortDirection", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">
                <div className="flex items-center">
                  <TrendingDown className="w-4 h-4 mr-2" />
                  High to Low
                </div>
              </SelectItem>
              <SelectItem value="asc">
                <div className="flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Low to High
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status Filter */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Show</Label>
        <Select
          value={filters.showApplied || "all"}
          onValueChange={(value) => handleChange("showApplied", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Matches</SelectItem>
            <SelectItem value="not_applied">Not Applied</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="bookmarked">Bookmarked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Score Range */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Score Range</Label>
          <Badge variant="secondary">
            {filters.minScore || 0} - {filters.maxScore || 100}%
          </Badge>
        </div>
        <Slider
          value={[filters.minScore || 0, filters.maxScore || 100]}
          onValueChange={handleScoreRangeChange}
          max={100}
          min={0}
          step={5}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Quick Filters</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={
              filters.quickFilter === "high_score" ? "default" : "outline"
            }
            size="sm"
            onClick={() =>
              handleChange(
                "quickFilter",
                filters.quickFilter === "high_score" ? null : "high_score",
              )
            }
          >
            High Score (80%+)
          </Button>
          <Button
            type="button"
            variant={filters.quickFilter === "urgent" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              handleChange(
                "quickFilter",
                filters.quickFilter === "urgent" ? null : "urgent",
              )
            }
          >
            Urgent (7 days)
          </Button>
          <Button
            type="button"
            variant={
              filters.quickFilter === "high_value" ? "default" : "outline"
            }
            size="sm"
            onClick={() =>
              handleChange(
                "quickFilter",
                filters.quickFilter === "high_value" ? null : "high_value",
              )
            }
          >
            High Value (£1M+)
          </Button>
        </div>
      </div>
    </>
  );
}
