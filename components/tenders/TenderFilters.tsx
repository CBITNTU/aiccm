"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, RotateCcw, Search } from "lucide-react";
import { useTranslations } from "next-intl";

interface TenderFilters {
  keyword?: string;
  location?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  selectedTaxonomies?: string[];
}

interface TenderFiltersProps {
  onFiltersChange: (filters: TenderFilters) => void;
  filters: TenderFilters;
  onReset: () => void;
}

export function TenderFilters({
  onFiltersChange,
  filters,
  onReset,
}: TenderFiltersProps) {
  const t = useTranslations("TenderFilters");

  const handleFilterChange = (key: string, value: string | number | null) => {
    const newFilters = { ...filters, [key]: value };
    onFiltersChange(newFilters);
  };

  const formatDateForInput = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().split("T")[0];
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div className="space-y-2">
            <Label htmlFor="dateFrom">{t("dateFrom")}</Label>
            <Input
              id="dateFrom"
              type="date"
              value={formatDateForInput(filters.dateFrom || null)}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateTo">{t("dateTo")}</Label>
            <Input
              id="dateTo"
              type="date"
              value={formatDateForInput(filters.dateTo || null)}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              className="w-full"
            />
          </div>

          {/* Budget Range */}
          <div className="space-y-2">
            <Label htmlFor="budgetMin">{t("budgetMin")}</Label>
            <Input
              id="budgetMin"
              type="number"
              placeholder={t("budgetMinPlaceholder")}
              value={filters.budgetMin || ""}
              onChange={(e) =>
                handleFilterChange(
                  "budgetMin",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budgetMax">{t("budgetMax")}</Label>
            <Input
              id="budgetMax"
              type="number"
              placeholder={t("budgetMaxPlaceholder")}
              value={filters.budgetMax || ""}
              onChange={(e) =>
                handleFilterChange(
                  "budgetMax",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <Label>{t("statusLabel")}</Label>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                handleFilterChange("status", value === "all" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("statusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("statusAllStatuses")}</SelectItem>
                <SelectItem value="open">{t("statusOpen")}</SelectItem>
                <SelectItem value="closing_soon">{t("statusClosingSoon")}</SelectItem>
                <SelectItem value="framework">{t("statusFramework")}</SelectItem>
                <SelectItem value="closed">{t("statusClosed")}</SelectItem>
                <SelectItem value="awarded">{t("statusAwarded")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location Filter */}
          <div className="space-y-2">
            <Label htmlFor="location">{t("locationLabel")}</Label>
            <Input
              id="location"
              placeholder={t("locationPlaceholder")}
              value={filters.location || ""}
              onChange={(e) => handleFilterChange("location", e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
