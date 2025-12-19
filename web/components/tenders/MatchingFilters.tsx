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
  const handleFilterChange = (
    key: keyof MatchingFiltersState,
    value: string | number | null
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
          <span>Filter & Sort Matches</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="ml-auto"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Keyword Search */}
        <div className="space-y-2">
          <Label htmlFor="keyword" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Keyword Search
          </Label>
          <Input
            id="keyword"
            placeholder="Search by tender title, buyer, location, or description..."
            value={filters.keyword || ""}
            onChange={(e) => handleFilterChange("keyword", e.target.value)}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sort By */}
          <div className="space-y-2">
            <Label>Sort By</Label>
            <Select
              value={filters.sortBy || "overall_score"}
              onValueChange={(value) => handleFilterChange("sortBy", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall_score">Overall Score</SelectItem>
                <SelectItem value="capability_score">
                  Capability Match
                </SelectItem>
                <SelectItem value="experience_score">
                  Experience Match
                </SelectItem>
                <SelectItem value="location_score">Location Match</SelectItem>
                <SelectItem value="certification_score">
                  Certification Match
                </SelectItem>
                <SelectItem value="created_at">Date Analyzed</SelectItem>
                <SelectItem value="deadline">Tender Deadline</SelectItem>
                <SelectItem value="budget">Budget</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort Direction */}
          <div className="space-y-2">
            <Label>Sort Order</Label>
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

          {/* Status Filter */}
          <div className="space-y-2">
            <Label>Show</Label>
            <Select
              value={filters.showApplied || "all"}
              onValueChange={(value) => handleFilterChange("showApplied", value)}
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
        </div>

        {/* Score Range Filter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Overall Score Range</Label>
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
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="space-y-2">
          <Label>Quick Filters</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={
                filters.quickFilter === "high_score" ? "default" : "outline"
              }
              size="sm"
              onClick={() =>
                handleFilterChange(
                  "quickFilter",
                  filters.quickFilter === "high_score" ? null : "high_score"
                )
              }
            >
              High Score (80%+)
            </Button>
            <Button
              variant={filters.quickFilter === "urgent" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                handleFilterChange(
                  "quickFilter",
                  filters.quickFilter === "urgent" ? null : "urgent"
                )
              }
            >
              Urgent (7 days)
            </Button>
            <Button
              variant={
                filters.quickFilter === "high_value" ? "default" : "outline"
              }
              size="sm"
              onClick={() =>
                handleFilterChange(
                  "quickFilter",
                  filters.quickFilter === "high_value" ? null : "high_value"
                )
              }
            >
              High Value (£1M+)
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
