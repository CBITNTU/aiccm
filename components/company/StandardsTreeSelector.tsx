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

export interface StandardNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

interface StandardsTreeSelectorProps {
  selectedStandardIds: string[];
  onSelectionChange: (standardIds: string[]) => void;
}

interface TreeNode extends StandardNode {
  children: TreeNode[];
}

function buildTree(nodes: StandardNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots: TreeNode[] = [];
  nodes.forEach((n) => {
    const node = byId.get(n.id)!;
    if (!n.parent_id) {
      roots.push(node);
    } else {
      const parent = byId.get(n.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  });
  roots.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  roots.forEach((r) => r.children.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
  return roots;
}

function filterTreeBySearch(tree: TreeNode[], searchLower: string): TreeNode[] {
  if (!searchLower) return tree;
  return tree
    .map((node) => {
      const match = node.name.toLowerCase().includes(searchLower);
      const filteredChildren = filterTreeBySearch(node.children, searchLower);
      if (match || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    })
    .filter((n): n is TreeNode => n !== null);
}

function TreeNodeRow({
  node,
  depth,
  selectedIds,
  expandedIds,
  onToggleExpand,
  onToggleSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedIds.has(node.id);

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
            checked={isSelected}
            onCheckedChange={(c) => onToggleSelect(node.id, c === true)}
            id={`standard-${node.id}`}
          />
          <label htmlFor={`standard-${node.id}`} className="flex-1 cursor-pointer text-sm">
            {node.name}
          </label>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-0">
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StandardsTreeSelector({
  selectedStandardIds,
  onSelectionChange,
}: StandardsTreeSelectorProps) {
  const [standards, setStandards] = useState<StandardNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchStandards = async () => {
      try {
        const result = await api.getStandards();
        setStandards(result.standards || []);
        const allIds = new Set((result.standards || []).map((s) => s.id));
        setExpandedIds(allIds);
      } catch (error) {
        console.error("Error fetching standards:", error);
      }
      setLoading(false);
    };
    fetchStandards();
  }, []);

  const tree = useMemo(() => buildTree(standards), [standards]);
  const filteredTree = useMemo(
    () => filterTreeBySearch(tree, searchTerm.trim().toLowerCase()),
    [tree, searchTerm],
  );
  const selectedSet = useMemo(
    () => new Set(selectedStandardIds),
    [selectedStandardIds],
  );

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelect = (standardId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedStandardIds, standardId]);
    } else {
      onSelectionChange(selectedStandardIds.filter((id) => id !== standardId));
    }
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
          Select the standards and certifications your company holds.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search standards..."
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
              {searchTerm ? "No standards found matching your search." : "No standards available."}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTree.map((node) => (
                <TreeNodeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedIds={selectedSet}
                  expandedIds={expandedIds}
                  onToggleExpand={handleToggleExpand}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {selectedStandardIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium">Selected:</span>
          {selectedStandardIds.map((id) => {
            const s = standards.find((x) => x.id === id);
            return s ? (
              <Badge key={id} variant="secondary">
                {s.name}
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
