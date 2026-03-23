"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { FileEdit } from "lucide-react";

interface DraftBlockProps {
  label?: string;
  children: ReactNode;
}

export function DraftBlock({ label = "Draft", children }: DraftBlockProps) {
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <FileEdit className="h-3 w-3 text-amber-600" />
        <span className="text-xs font-medium text-amber-700">{label}</span>
      </div>
      {children}
    </div>
  );
}

interface DraftRelationChangesProps {
  added: string[];
  removed: string[];
  nameMap: Record<string, string>;
  loading?: boolean;
}

export function DraftRelationChanges({
  added,
  removed,
  nameMap,
  loading = false,
}: DraftRelationChangesProps) {
  if (added.length === 0 && removed.length === 0) return null;

  const getName = (id: string) => nameMap[id] ?? id;

  return (
    <DraftBlock label="Pending changes">
      {loading && (
        <p className="text-xs text-amber-600">Loading...</p>
      )}
      {added.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {added.map((id) => (
            <Badge
              key={id}
              variant="outline"
              className="text-xs bg-amber-50 border-amber-300 text-amber-900 border-dashed"
            >
              + {getName(id)}
            </Badge>
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {removed.map((id) => (
            <Badge
              key={id}
              variant="outline"
              className="text-xs bg-red-50 border-red-200 text-red-700 line-through"
            >
              - {getName(id)}
            </Badge>
          ))}
        </div>
      )}
    </DraftBlock>
  );
}
