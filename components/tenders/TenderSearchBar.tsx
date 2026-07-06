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
  ArrowUpDown,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency } from "@/lib/format/currency";

// Database filters interface
interface TenderFiltersState {
  keyword?: string;
  location?: string;
  status?: string;
  source?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  selectedTaxonomies?: string[];
  sortBy?: string;
  sortDirection?: string;
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
  tenderStatus?: string;
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
  const t = useTranslations("TenderSearchBar");
  const { currency } = useDeployment();
  const [sheetOpen, setSheetOpen] = useState(false);

  const DATABASE_SORT_OPTIONS = [
    { value: "deadline:desc", label: t("sortDeadlineNewest") },
    { value: "deadline:asc", label: t("sortDeadlineOldest") },
    { value: "publication_date:desc", label: t("sortPublishedNewest") },
    { value: "publication_date:asc", label: t("sortPublishedOldest") },
    { value: "budget_max:desc", label: t("sortBudgetHighest") },
    { value: "budget_min:asc", label: t("sortBudgetLowest") },
    { value: "title:asc", label: t("sortTitleAZ") },
  ] as const;

  const SOURCE_LABELS: Record<string, string> = {
    all: t("allSources"),
    ted: t("sourceTed"),
    "find-tender": t("sourceFindATender"),
    "contracts-finder": t("sourceContractsFinder"),
  };

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
      if (databaseFilters.source) count++;
      if (databaseFilters.budgetMin) count++;
      if (databaseFilters.budgetMax) count++;
      if (databaseFilters.dateFrom) count++;
      if (databaseFilters.dateTo) count++;
      if (
        databaseFilters.selectedTaxonomies &&
        databaseFilters.selectedTaxonomies.length > 0
      )
        count++;
      if (databaseFilters.sortBy && databaseFilters.sortBy !== "deadline") count++;
      if (databaseFilters.sortDirection && databaseFilters.sortDirection !== "asc") count++;
      return count;
    } else if (filterType === "matching" && matchingFilters) {
      let count = 0;
      if (matchingFilters.sortBy !== "overall_score") count++;
      if (matchingFilters.sortDirection !== "desc") count++;
      if (matchingFilters.minScore > 0 || matchingFilters.maxScore < 100)
        count++;
      if (matchingFilters.showApplied !== "all") count++;
      if (matchingFilters.quickFilter) count++;
      if (matchingFilters.tenderStatus && matchingFilters.tenderStatus !== "active") count++;
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
          label: t("pillLocation"),
          value: databaseFilters.location,
        });
      if (databaseFilters.status)
        pills.push({
          key: "status",
          label: t("pillStatus"),
          value: databaseFilters.status,
        });
      if (databaseFilters.source) {
        pills.push({
          key: "source",
          label: t("pillSource"),
          value: SOURCE_LABELS[databaseFilters.source] || databaseFilters.source,
        });
      }
      if (databaseFilters.budgetMin)
        pills.push({
          key: "budgetMin",
          label: t("pillMinBudget"),
          value: formatCurrency(databaseFilters.budgetMin, currency),
        });
      if (databaseFilters.budgetMax)
        pills.push({
          key: "budgetMax",
          label: t("pillMaxBudget"),
          value: formatCurrency(databaseFilters.budgetMax, currency),
        });
      if (databaseFilters.dateFrom)
        pills.push({
          key: "dateFrom",
          label: t("pillFrom"),
          value: databaseFilters.dateFrom,
        });
      if (databaseFilters.dateTo)
        pills.push({
          key: "dateTo",
          label: t("pillTo"),
          value: databaseFilters.dateTo,
        });
      if (databaseFilters.sortBy && databaseFilters.sortBy !== "deadline") {
        const sortOption = DATABASE_SORT_OPTIONS.find(
          (o) => o.value === `${databaseFilters.sortBy}:${databaseFilters.sortDirection || "asc"}`
        );
        pills.push({
          key: "sort",
          label: t("pillSort"),
          value: sortOption?.label || `${databaseFilters.sortBy}`,
        });
      }
    } else if (filterType === "matching" && matchingFilters) {
      if (matchingFilters.tenderStatus && matchingFilters.tenderStatus !== "active") {
        const statusLabels: Record<string, string> = {
          all: t("statusAllStatuses"),
          open: t("tenderStatusOpen"),
          closed: t("tenderStatusClosed"),
          awarded: t("tenderStatusAwarded"),
        };
        pills.push({
          key: "tenderStatus",
          label: t("pillStatus"),
          value: statusLabels[matchingFilters.tenderStatus] || matchingFilters.tenderStatus,
        });
      }
      if (matchingFilters.minScore > 0 || matchingFilters.maxScore < 100)
        pills.push({
          key: "scoreRange",
          label: t("pillScore"),
          value: `${matchingFilters.minScore}-${matchingFilters.maxScore}%`,
        });
      if (matchingFilters.showApplied !== "all")
        pills.push({
          key: "showApplied",
          label: t("pillShow"),
          value: matchingFilters.showApplied,
        });
      if (matchingFilters.quickFilter)
        pills.push({
          key: "quickFilter",
          label: t("pillQuick"),
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
      if (key === "source") newFilters.source = undefined;
      if (key === "budgetMin") newFilters.budgetMin = undefined;
      if (key === "budgetMax") newFilters.budgetMax = undefined;
      if (key === "dateFrom") newFilters.dateFrom = undefined;
      if (key === "dateTo") newFilters.dateTo = undefined;
      if (key === "sort") {
        newFilters.sortBy = "deadline";
        newFilters.sortDirection = "asc";
      }
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
      if (key === "tenderStatus") newFilters.tenderStatus = "active";
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
        {filterType === "database" && databaseFilters && onDatabaseFiltersChange && (
          <Select
            value={`${databaseFilters.sortBy || "deadline"}:${databaseFilters.sortDirection || "asc"}`}
            onValueChange={(value) => {
              const [sortBy, sortDirection] = value.split(":");
              onDatabaseFiltersChange({ ...databaseFilters, sortBy, sortDirection });
            }}
          >
            <SelectTrigger className="h-11 w-[220px] shrink-0">
              <ArrowUpDown className="h-4 w-4 mr-2 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATABASE_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 gap-2">
              <Filter className="h-4 w-4" />
              {t("filtersButton")}
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
                  ? t("filterSheetTitle")
                  : t("matchingSheetTitle")}
              </SheetTitle>
              <SheetDescription>
                {filterType === "database"
                  ? t("filterSheetDescription")
                  : t("matchingSheetDescription")}
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
                {t("reset")}
              </Button>
              <SheetClose asChild>
                <Button className="flex-1">{t("applyFilters")}</Button>
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
              {t("clearAll")}
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
  const t = useTranslations("TenderSearchBar");

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
        <Label className="text-sm font-medium">{t("dateRangeLabel")}</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              {t("fromLabel")}
            </Label>
            <Input
              type="date"
              value={formatDateForInput(filters.dateFrom)}
              onChange={(e) => handleChange("dateFrom", e.target.value || null)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              {t("toLabel")}
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
        <Label className="text-sm font-medium">{t("budgetRangeLabel")}</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              {t("minimumLabel")}
            </Label>
            <Input
              type="number"
              placeholder={t("budgetMinPlaceholder")}
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
              {t("maximumLabel")}
            </Label>
            <Input
              type="number"
              placeholder={t("budgetMaxPlaceholder")}
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
        <Label className="text-sm font-medium">{t("statusLabel")}</Label>
        <Select
          value={filters.status || "all"}
          onValueChange={(value) =>
            handleChange("status", value === "all" ? null : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={t("allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="open">{t("statusOpen")}</SelectItem>
            <SelectItem value="closing_soon">{t("statusClosingSoon")}</SelectItem>
            <SelectItem value="framework">{t("statusFramework")}</SelectItem>
            <SelectItem value="closed">{t("statusClosed")}</SelectItem>
            <SelectItem value="awarded">{t("statusAwarded")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Source */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("sourceLabel")}</Label>
        <Select
          value={filters.source || "all"}
          onValueChange={(value) =>
            handleChange("source", value === "all" ? null : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={t("allSources")} />
          </SelectTrigger>
          <SelectContent>
            {(["all", "ted", "find-tender", "contracts-finder"] as const).map((val) => (
              <SelectItem key={val} value={val}>
                {val === "all" ? t("allSources")
                  : val === "ted" ? t("sourceTed")
                  : val === "find-tender" ? t("sourceFindATender")
                  : t("sourceContractsFinder")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("locationLabel")}</Label>
        <Input
          placeholder={t("locationPlaceholder")}
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
  const t = useTranslations("TenderSearchBar");

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
        <Label className="text-sm font-medium">{t("sortBy")}</Label>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={filters.sortBy || "overall_score"}
            onValueChange={(value) => handleChange("sortBy", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overall_score">{t("sortOverallScore")}</SelectItem>
              <SelectItem value="capability_score">{t("sortCapabilityMatch")}</SelectItem>
              <SelectItem value="experience_score">{t("sortExperienceMatch")}</SelectItem>
              <SelectItem value="location_score">{t("sortLocationMatch")}</SelectItem>
              <SelectItem value="certification_score">{t("sortCertificationMatch")}</SelectItem>
              <SelectItem value="created_at">{t("sortDateAnalyzed")}</SelectItem>
              <SelectItem value="deadline">{t("sortTenderDeadline")}</SelectItem>
              <SelectItem value="budget">{t("sortBudget")}</SelectItem>
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
                  {t("sortHighToLow")}
                </div>
              </SelectItem>
              <SelectItem value="asc">
                <div className="flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {t("sortLowToHigh")}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status Filter */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("showLabel")}</Label>
        <Select
          value={filters.showApplied || "all"}
          onValueChange={(value) => handleChange("showApplied", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("showAll")}</SelectItem>
            <SelectItem value="not_applied">{t("showNotApplied")}</SelectItem>
            <SelectItem value="applied">{t("showApplied")}</SelectItem>
            <SelectItem value="bookmarked">{t("showBookmarked")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tender Status */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("tenderStatusLabel")}</Label>
        <Select
          value={filters.tenderStatus || "active"}
          onValueChange={(value) => handleChange("tenderStatus", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("tenderStatusActive")}</SelectItem>
            <SelectItem value="all">{t("tenderStatusAll")}</SelectItem>
            <SelectItem value="open">{t("tenderStatusOpen")}</SelectItem>
            <SelectItem value="closed">{t("tenderStatusClosed")}</SelectItem>
            <SelectItem value="awarded">{t("tenderStatusAwarded")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Score Range */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("scoreRangeLabel")}</Label>
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
        <Label className="text-sm font-medium">{t("quickFiltersLabel")}</Label>
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
            {t("quickFilterHighScore")}
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
            {t("quickFilterUrgent")}
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
            {t("quickFilterHighValue")}
          </Button>
        </div>
      </div>
    </>
  );
}

