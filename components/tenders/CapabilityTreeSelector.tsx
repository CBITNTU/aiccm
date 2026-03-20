"use client";

import { useState, useMemo, useEffect } from "react";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRight,
  ChevronDown,
  Search,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";

interface CapabilityTreeSelectorProps {
  selectedCapabilities: string[];
  onSelectionChange: (capabilityIds: string[]) => void;
}

interface Capability {
  id: string;
  name: string;
  category: string | null;
  parentId?: string | null;
}

interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
}

function TreeLevel({
  node,
  depth,
  selectedCapabilities,
  expandedTreeIds,
  onToggleExpand,
  onCapabilityToggle,
  isCapabilitySelected,
}: {
  node: TreeNode;
  depth: number;
  selectedCapabilities: string[];
  expandedTreeIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onCapabilityToggle: (id: string, checked: boolean) => void;
  isCapabilitySelected: (id: string) => boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedTreeIds.has(node.id);

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className="p-0.5 hover:bg-muted rounded"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>
        <div className="flex items-center gap-2 flex-1">
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-primary" />
            ) : (
              <Folder className="w-4 h-4 text-muted-foreground" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
          <Checkbox
            checked={isCapabilitySelected(node.id)}
            onCheckedChange={(c) => onCapabilityToggle(node.id, c === true)}
            id={`capability-${node.id}`}
          />
          <label
            htmlFor={`capability-${node.id}`}
            className="flex-1 cursor-pointer text-sm"
          >
            {node.name}
          </label>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-0">
          {node.children.map((child) => (
            <TreeLevel
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedCapabilities={selectedCapabilities}
              expandedTreeIds={expandedTreeIds}
              onToggleExpand={onToggleExpand}
              onCapabilityToggle={onCapabilityToggle}
              isCapabilitySelected={isCapabilitySelected}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CapabilityTreeSelector({
  selectedCapabilities,
  onSelectionChange,
}: CapabilityTreeSelectorProps) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTreeIds, setExpandedTreeIds] = useState<Set<string>>(
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

  // Build tree from parentId when present; otherwise group by category
  const hasParentId = useMemo(
    () => capabilities.some((c) => c.parentId != null && c.parentId !== ""),
    [capabilities],
  );

  const tree = useMemo((): TreeNode[] => {
    if (!hasParentId) return [];
    const byId = new Map<string, TreeNode>();
    capabilities.forEach((c) =>
      byId.set(c.id, { id: c.id, name: c.name, children: [] }),
    );
    const roots: TreeNode[] = [];
    capabilities.forEach((c) => {
      const node = byId.get(c.id)!;
      const parentId = c.parentId ?? null;
      if (!parentId || !byId.has(parentId)) {
        roots.push(node);
      } else {
        byId.get(parentId)!.children.push(node);
      }
    });
    roots.sort((a, b) => a.name.localeCompare(b.name));
    roots.forEach((r) =>
      r.children.sort((a, b) => a.name.localeCompare(b.name)),
    );
    return roots;
  }, [capabilities, hasParentId]);

  const groupedCapabilities = useMemo(() => {
    if (hasParentId) return [];
    const groups = new Map<string | null, Capability[]>();
    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(cap);
    });
    return Array.from(groups.entries())
      .map(([category, caps]) => ({
        category: category === "Uncategorized" ? null : category,
        capabilities: caps,
      }))
      .toSorted((a, b) => {
        if (a.category === null) return 1;
        if (b.category === null) return -1;
        return (a.category || "").localeCompare(b.category || "");
      });
  }, [capabilities, hasParentId]);

  const filteredTree = useMemo(() => {
    if (!hasParentId || !searchTerm.trim()) return tree;
    const searchLower = searchTerm.toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes
        .map((n) => ({
          ...n,
          children: filterNodes(n.children),
        }))
        .filter(
          (n) =>
            n.name.toLowerCase().includes(searchLower) ||
            n.children.length > 0,
        );
    return filterNodes(tree);
  }, [tree, hasParentId, searchTerm]);

  const filteredGroups = useMemo(() => {
    if (hasParentId) return [];
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
  }, [groupedCapabilities, hasParentId, searchTerm]);

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

  const isCapabilitySelected = (capabilityId: string): boolean => {
    return selectedCapabilities.includes(capabilityId);
  };

  const isCategoryExpanded = (category: string | null): boolean => {
    const categoryKey = category || "Uncategorized";
    return expandedCategories.has(categoryKey);
  };

  const toggleTreeId = (id: string) => {
    setExpandedTreeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      <Card>
        <CardContent className="p-4 max-h-[500px] overflow-y-auto">
          {hasParentId && filteredTree.length === 0 && !searchTerm ? (
            <div className="text-center py-8 text-muted-foreground">
              No capabilities available.
            </div>
          ) : hasParentId && filteredTree.length > 0 ? (
            <div className="space-y-1">
              {filteredTree.map((node) => (
                <TreeLevel
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedCapabilities={selectedCapabilities}
                  expandedTreeIds={expandedTreeIds}
                  onToggleExpand={toggleTreeId}
                  onCapabilityToggle={handleCapabilityToggle}
                  isCapabilitySelected={isCapabilitySelected}
                />
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
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
                      </div>
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
                              <div className="w-5" />{" "}
                              {/* Spacer for alignment */}
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

      {selectedCapabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium">Selected:</span>
          {selectedCapabilities.map((capId) => {
            const cap = capabilities.find((c) => c.id === capId);
            return cap ? (
              <Badge key={capId} variant="secondary">
                {cap.name}
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
