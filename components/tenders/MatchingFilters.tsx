"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Filter,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface MatchingFiltersProps {
  onFiltersChange: (filters: MatchingFiltersState) => void;
  filters: MatchingFiltersState;
  onReset: () => void;
}

export interface MatchingFiltersState {
  keyword?: string;
  sortBy: string;
  sortDirection: string;
  minScore: number;
  maxScore: number;
  showApplied: string;
  quickFilter?: string | null;
}

export function MatchingFilters({
  onFiltersChange,
  filters,
  onReset,
}: MatchingFiltersProps) {
  const t = useTranslations("MatchingFilters");

  const handleFilterChange = (
    key: keyof MatchingFiltersState,
    value: string | number | null,
  ) => {
    const newFilters = { ...filters, [key]: value };
    onFiltersChange(newFilters);
  };

  const handleScoreRangeChange = (values: number[]) => {
    const newFilters = {
      ...filters,
      minScore: values[0],
      maxScore: values[1],
    };
    onFiltersChange(newFilters);
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Filter className="w-4 h-4" />
          <span>{t("title")}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="ml-auto"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {t("reset")}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Keyword Search */}
        <div className="space-y-2">
          <Label htmlFor="keyword" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {t("keywordLabel")}
          </Label>
          <Input
            id="keyword"
            placeholder={t("keywordPlaceholder")}
            value={filters.keyword || ""}
            onChange={(e) => handleFilterChange("keyword", e.target.value)}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sort By */}
          <div className="space-y-2">
            <Label>{t("sortBy")}</Label>
            <Select
              value={filters.sortBy || "overall_score"}
              onValueChange={(value) => handleFilterChange("sortBy", value)}
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
          </div>

          {/* Sort Direction */}
          <div className="space-y-2">
            <Label>{t("sortOrder")}</Label>
            <Select
              value={filters.sortDirection || "desc"}
              onValueChange={(value) =>
                handleFilterChange("sortDirection", value)
              }
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

          {/* Status Filter */}
          <div className="space-y-2">
            <Label>{t("show")}</Label>
            <Select
              value={filters.showApplied || "all"}
              onValueChange={(value) =>
                handleFilterChange("showApplied", value)
              }
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
        </div>

        {/* Score Range Filter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t("overallScoreRange")}</Label>
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
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("score0")}</span>
            <span>{t("score50")}</span>
            <span>{t("score100")}</span>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="space-y-2">
          <Label>{t("quickFilters")}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={
                filters.quickFilter === "high_score" ? "default" : "outline"
              }
              size="sm"
              onClick={() =>
                handleFilterChange(
                  "quickFilter",
                  filters.quickFilter === "high_score" ? null : "high_score",
                )
              }
            >
              {t("quickFilterHighScore")}
            </Button>
            <Button
              variant={filters.quickFilter === "urgent" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                handleFilterChange(
                  "quickFilter",
                  filters.quickFilter === "urgent" ? null : "urgent",
                )
              }
            >
              {t("quickFilterUrgent")}
            </Button>
            <Button
              variant={
                filters.quickFilter === "high_value" ? "default" : "outline"
              }
              size="sm"
              onClick={() =>
                handleFilterChange(
                  "quickFilter",
                  filters.quickFilter === "high_value" ? null : "high_value",
                )
              }
            >
              {t("quickFilterHighValue")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
