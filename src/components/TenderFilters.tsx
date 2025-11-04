import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Filter, RotateCcw, Search } from "lucide-react";

interface TenderFiltersProps {
  onFiltersChange: (filters: any) => void;
  filters: any;
  onReset: () => void;
}

export const TenderFilters: React.FC<TenderFiltersProps> = ({
  onFiltersChange,
  filters,
  onReset
}) => {
  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value };
    onFiltersChange(newFilters);
  };

  const formatDateForInput = (date: Date | string | null) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Filter className="w-4 h-4" />
          <span>Filters</span>
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
            placeholder="Search by title, description, buyer, or location..."
            value={filters.keyword || ''}
            onChange={(e) => handleFilterChange('keyword', e.target.value)}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div className="space-y-2">
            <Label htmlFor="dateFrom">Date From</Label>
            <Input
              id="dateFrom"
              type="date"
              value={formatDateForInput(filters.dateFrom)}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dateTo">Date To</Label>
            <Input
              id="dateTo"
              type="date"
              value={formatDateForInput(filters.dateTo)}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full"
            />
          </div>

          {/* Budget Range */}
          <div className="space-y-2">
            <Label htmlFor="budgetMin">Min Budget (£)</Label>
            <Input
              id="budgetMin"
              type="number"
              placeholder="e.g. 10000"
              value={filters.budgetMin || ''}
              onChange={(e) => handleFilterChange('budgetMin', e.target.value ? Number(e.target.value) : null)}
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="budgetMax">Max Budget (£)</Label>
            <Input
              id="budgetMax"
              type="number"
              placeholder="e.g. 1000000"
              value={filters.budgetMax || ''}
              onChange={(e) => handleFilterChange('budgetMax', e.target.value ? Number(e.target.value) : null)}
              className="w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={filters.status || 'all'}
              onValueChange={(value) => handleFilterChange('status', value === 'all' ? null : value)}
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

          {/* Location Filter */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g. London, Manchester"
              value={filters.location || ''}
              onChange={(e) => handleFilterChange('location', e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};