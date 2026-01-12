"use client";

import { useState, useMemo } from "react";
import type { ReactElement } from "react";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, ChevronDown, Search, Folder, FolderOpen } from "lucide-react";
import { Loader2 } from "lucide-react";

interface TaxonomyTreeSelectorProps {
  selectedTaxonomies: string[];
  onSelectionChange: (taxonomyIds: string[]) => void;
}

interface TaxonomyNode {
  id: string;
  name: string;
  level: number;
  description: string | null;
  parent_id: string | null;
  children: TaxonomyNode[];
}

export function TaxonomyTreeSelector({
  selectedTaxonomies,
  onSelectionChange,
}: TaxonomyTreeSelectorProps) {
  const { taxonomies, loading, getLevel1, getLevel2, getLevel3 } = useTaxonomies();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Build tree structure
  const tree = useMemo(() => {
    const buildTree = (): TaxonomyNode[] => {
      const level1 = getLevel1();
      return level1.map((tax) => ({
        id: tax.id,
        name: tax.name,
        level: tax.level,
        description: tax.description,
        parent_id: tax.parent_id,
        children: buildChildren(tax.id),
      }));
    };

    const buildChildren = (parentId: string): TaxonomyNode[] => {
      const level2 = getLevel2(parentId);
      return level2.map((tax) => {
        const level3 = getLevel3(tax.id);
        return {
          id: tax.id,
          name: tax.name,
          level: tax.level,
          description: tax.description,
          parent_id: tax.parent_id,
          children: level3.map((child) => ({
            id: child.id,
            name: child.name,
            level: child.level,
            description: child.description,
            parent_id: child.parent_id,
            children: [],
          })),
        };
      });
    };

    return buildTree();
  }, [taxonomies, getLevel1, getLevel2, getLevel3]);

  // Filter tree based on search
  const filteredTree = useMemo(() => {
    if (!searchTerm.trim()) return tree;

    const searchLower = searchTerm.toLowerCase();
    const filterNode = (node: TaxonomyNode): TaxonomyNode | null => {
      const matchesSearch =
        node.name.toLowerCase().includes(searchLower) ||
        node.description?.toLowerCase().includes(searchLower);

      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is TaxonomyNode => n !== null);

      if (matchesSearch || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    };

    return tree.map(filterNode).filter((n): n is TaxonomyNode => n !== null);
  }, [tree, searchTerm]);

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleTaxonomyToggle = (taxonomyId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedTaxonomies, taxonomyId]);
    } else {
      // Remove this taxonomy and all its children
      const removeTaxonomyAndChildren = (id: string, list: string[]): string[] => {
        const taxonomy = taxonomies.find((t) => t.id === id);
        if (!taxonomy) return list;

        // Remove this taxonomy
        let filtered = list.filter((tid) => tid !== id);

        // Remove all children
        const children = taxonomies.filter((t) => t.parent_id === id);
        for (const child of children) {
          filtered = removeTaxonomyAndChildren(child.id, filtered);
        }

        return filtered;
      };

      onSelectionChange(removeTaxonomyAndChildren(taxonomyId, selectedTaxonomies));
    }
  };

  const isTaxonomySelected = (taxonomyId: string): boolean => {
    return selectedTaxonomies.includes(taxonomyId);
  };

  const renderNode = (node: TaxonomyNode, depth: number = 0): ReactElement => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = isTaxonomySelected(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 ${
            isSelected ? "bg-primary/10" : ""
          }`}
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.id)}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-5" /> // Spacer for alignment
          )}

          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) =>
              handleTaxonomyToggle(node.id, checked === true)
            }
            id={`taxonomy-${node.id}`}
          />

          <label
            htmlFor={`taxonomy-${node.id}`}
            className="flex-1 cursor-pointer flex items-center gap-2"
          >
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-primary" />
              ) : (
                <Folder className="w-4 h-4 text-muted-foreground" />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
            <span className="font-medium">{node.name}</span>
            {node.description && (
              <span className="text-xs text-muted-foreground">
                - {node.description}
              </span>
            )}
          </label>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-4">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
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
          Select the capabilities needed for this project. You can select multiple
          capabilities from different categories.
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
          {filteredTree.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No capabilities found matching your search." : "No capabilities available."}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTree.map((node) => renderNode(node))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTaxonomies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium">Selected:</span>
          {selectedTaxonomies.map((taxId) => {
            const tax = taxonomies.find((t) => t.id === taxId);
            return tax ? (
              <Badge key={taxId} variant="secondary">
                {tax.name}
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

