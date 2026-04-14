"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
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

export interface MarketNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

interface MarketTreeSelectorProps {
  selectedMarketIds: string[];
  onSelectionChange: (marketIds: string[]) => void;
  onNameMapChange?: (map: Record<string, string>) => void;
  /** When provided, search is controlled externally and the built-in search/description are hidden. */
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  /** Additional className for the tree card container */
  className?: string;
  /** Called when the tree data has finished loading */
  onReady?: () => void;
}

interface TreeNode extends MarketNode {
  children: TreeNode[];
}

function buildTree(nodes: MarketNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots: TreeNode[] = [];
  nodes.forEach((n) => {
    const node = byId.get(n.id)!;
    if (!n.parentId) {
      roots.push(node);
    } else {
      const parent = byId.get(n.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  });
  roots.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  roots.forEach((r) => r.children.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
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
  onSelectionChange,
}: {
  node: TreeNode;
  depth: number;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelectionChange: (ids: string[]) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedIds.has(node.id);

  const handleSelect = (checked: boolean) => {
    onToggleSelect(node.id, checked);
  };

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
            onCheckedChange={(c) => handleSelect(c === true)}
            id={`market-${node.id}`}
          />
          <label htmlFor={`market-${node.id}`} className="flex-1 cursor-pointer text-sm">
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
              onSelectionChange={onSelectionChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MarketTreeSelector({
  selectedMarketIds,
  onSelectionChange,
  onNameMapChange,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
  className,
  onReady,
}: MarketTreeSelectorProps) {
  const t = useTranslations("CompanyPage");
  const isControlled = externalSearchTerm !== undefined;
  const [markets, setMarkets] = useState<MarketNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = isControlled ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = isControlled ? (onSearchTermChange ?? (() => {})) : setInternalSearchTerm;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const onNameMapChangeRef = useRef(onNameMapChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onNameMapChangeRef.current = onNameMapChange;
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const result = await api.getMarkets();
        const mks = result.markets || [];
        setMarkets(mks);
        onNameMapChangeRef.current?.(Object.fromEntries(mks.map((m) => [m.id, m.name])));
        const allIds = new Set(mks.map((m) => m.id));
        setExpandedIds(allIds);
      } catch (error) {
        console.error("Error fetching markets:", error);
      }
      setLoading(false);
      onReadyRef.current?.();
    };
    fetchMarkets();
  }, []);

  const tree = useMemo(() => buildTree(markets), [markets]);
  const filteredTree = useMemo(
    () => filterTreeBySearch(tree, searchTerm.trim().toLowerCase()),
    [tree, searchTerm],
  );
  const selectedSet = useMemo(
    () => new Set(selectedMarketIds),
    [selectedMarketIds],
  );

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelect = (marketId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedMarketIds, marketId]);
    } else {
      onSelectionChange(selectedMarketIds.filter((id) => id !== marketId));
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
    <div className={isControlled ? className : "space-y-4"}>
      {!isControlled && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("marketsTree.intro")}</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("marketsTree.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      )}
      <Card className={isControlled ? "h-full flex flex-col" : ""}>
        <CardContent className={isControlled ? "p-4 overflow-y-auto flex-1" : "p-4 max-h-[500px] overflow-y-auto"}>
          {filteredTree.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? t("marketsTree.noMatch") : t("marketsTree.noneAvailable")}
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
                  onSelectionChange={onSelectionChange}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {!isControlled && selectedMarketIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium">{t("marketsTree.selectedLabel")}</span>
          {selectedMarketIds.map((id) => {
            const m = markets.find((x) => x.id === id);
            return m ? (
              <Badge key={id} variant="secondary">
                {m.name}
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
