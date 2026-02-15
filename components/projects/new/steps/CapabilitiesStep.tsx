"use client";

import { useState, useMemo, useEffect } from "react";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRight,
  ChevronDown,
  Search,
  Folder,
  FolderOpen,
  Loader2,
  CheckSquare,
} from "lucide-react";

interface CapabilitiesStepProps {
  selectedCapabilities: string[];
  onSelectionChange: (capabilityIds: string[]) => void;
}

interface Capability {
  id: string;
  name: string;
  category: string | null;
}

interface CapabilityGroup {
  category: string | null;
  capabilities: Capability[];
}

export function CapabilitiesStep({
  selectedCapabilities,
  onSelectionChange,
}: CapabilitiesStepProps) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const fetchCapabilities = async () => {
      try {
        const result = await api.getCapabilities();
        setCapabilities(result.capabilities || []);
        // Auto-expand all categories by default
        const categories = new Set(
          result.capabilities
            ?.map((c) => c.category)
            .filter(
              (cat): cat is string => cat !== null && cat !== undefined,
            ) || [],
        );
        setExpandedCategories(categories);
      } catch (error) {
        console.error("Error fetching capabilities:", error);
      }
      setLoading(false);
    };

    fetchCapabilities();
  }, []);

  // Group capabilities by category
  const groupedCapabilities = useMemo(() => {
    const groups = new Map<string | null, Capability[]>();

    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(cap);
    });

    const result: CapabilityGroup[] = Array.from(groups.entries())
      .map(([category, caps]) => ({
        category: category === "Uncategorized" ? null : category,
        capabilities: caps,
      }))
      .sort((a, b) => {
        if (a.category === null) return 1;
        if (b.category === null) return -1;
        return (a.category || "").localeCompare(b.category || "");
      });

    return result;
  }, [capabilities]);

  // Filter capabilities based on search
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groupedCapabilities;

    const searchLower = searchTerm.toLowerCase();
    return groupedCapabilities
      .map((group) => {
        const filtered = group.capabilities.filter(
          (cap) =>
            cap.name.toLowerCase().includes(searchLower) ||
            (group.category &&
              group.category.toLowerCase().includes(searchLower)),
        );
        return { ...group, capabilities: filtered };
      })
      .filter((group) => group.capabilities.length > 0);
  }, [groupedCapabilities, searchTerm]);

  const toggleCategory = (category: string | null) => {
    const categoryKey = category || "Uncategorized";
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey);
    } else {
      newExpanded.add(categoryKey);
    }
    setExpandedCategories(newExpanded);
  };

  const handleCapabilityToggle = (capabilityId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedCapabilities, capabilityId]);
    } else {
      onSelectionChange(
        selectedCapabilities.filter((id) => id !== capabilityId),
      );
    }
  };

  const handleSelectAllInCategory = (group: CapabilityGroup) => {
    const categoryCapIds = group.capabilities.map((c) => c.id);
    const allSelected = categoryCapIds.every((id) =>
      selectedCapabilities.includes(id),
    );

    if (allSelected) {
      // Deselect all in this category
      onSelectionChange(
        selectedCapabilities.filter((id) => !categoryCapIds.includes(id)),
      );
    } else {
      // Select all in this category
      const newSelection = new Set([
        ...selectedCapabilities,
        ...categoryCapIds,
      ]);
      onSelectionChange(Array.from(newSelection));
    }
  };

  const isCapabilitySelected = (capabilityId: string): boolean => {
    return selectedCapabilities.includes(capabilityId);
  };

  const isCategoryExpanded = (category: string | null): boolean => {
    const categoryKey = category || "Uncategorized";
    return expandedCategories.has(categoryKey);
  };

  const isCategoryFullySelected = (group: CapabilityGroup): boolean => {
    return group.capabilities.every((c) => selectedCapabilities.includes(c.id));
  };

  const isCategoryPartiallySelected = (group: CapabilityGroup): boolean => {
    const selectedCount = group.capabilities.filter((c) =>
      selectedCapabilities.includes(c.id),
    ).length;
    return selectedCount > 0 && selectedCount < group.capabilities.length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Select the capabilities needed for this project. You can select
          multiple capabilities from different categories.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search capabilities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Selected capabilities */}
      {selectedCapabilities.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium">Selected:</span>
          {selectedCapabilities.map((capId) => {
            const cap = capabilities.find((c) => c.id === capId);
            return cap ? (
              <Badge
                key={capId}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => handleCapabilityToggle(capId, false)}
              >
                {cap.name}
                <span className="ml-1 text-muted-foreground">&times;</span>
              </Badge>
            ) : null;
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-4 overflow-y-auto">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm
                ? "No capabilities found matching your search."
                : "No capabilities available."}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredGroups.map((group) => {
                const categoryKey = group.category || "Uncategorized";
                const isExpanded = isCategoryExpanded(group.category);
                const hasCapabilities = group.capabilities.length > 0;
                const isFullySelected = isCategoryFullySelected(group);
                const isPartiallySelected = isCategoryPartiallySelected(group);

                return (
                  <div key={categoryKey} className="select-none">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50">
                      {hasCapabilities && (
                        <button
                          onClick={() => toggleCategory(group.category)}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {!hasCapabilities && <div className="w-5" />}

                      <div className="flex items-center gap-2 flex-1">
                        {hasCapabilities ? (
                          isExpanded ? (
                            <FolderOpen className="w-4 h-4 text-primary" />
                          ) : (
                            <Folder className="w-4 h-4 text-muted-foreground" />
                          )
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                        <span className="font-medium">
                          {group.category || "Uncategorized"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({group.capabilities.length})
                        </span>
                      </div>

                      {/* Select All button for category */}
                      {hasCapabilities && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAllInCategory(group);
                          }}
                        >
                          <CheckSquare
                            className={`w-3 h-3 mr-1 ${
                              isFullySelected
                                ? "text-primary"
                                : isPartiallySelected
                                  ? "text-primary/50"
                                  : "text-muted-foreground"
                            }`}
                          />
                          {isFullySelected ? "Deselect All" : "Select All"}
                        </Button>
                      )}
                    </div>

                    {/* Capabilities List */}
                    {hasCapabilities && isExpanded && (
                      <div className="ml-6 space-y-1">
                        {group.capabilities.map((capability) => {
                          const isSelected = isCapabilitySelected(
                            capability.id,
                          );
                          return (
                            <div
                              key={capability.id}
                              className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 ${
                                isSelected ? "bg-primary/10" : ""
                              }`}
                            >
                              <div className="w-5" />
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  handleCapabilityToggle(
                                    capability.id,
                                    checked === true,
                                  )
                                }
                                id={`capability-${capability.id}`}
                              />
                              <label
                                htmlFor={`capability-${capability.id}`}
                                className="flex-1 cursor-pointer"
                              >
                                <span className="text-sm">
                                  {capability.name}
                                </span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
