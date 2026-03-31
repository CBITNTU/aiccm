"use client";

import { Badge } from "@/components/ui/badge";
import { Building2, PoundSterling } from "lucide-react";

interface PastProjectParsed {
  name?: string;
  description?: string;
  client?: string;
  value?: string;
  year?: string;
  sector?: string;
}

function parsePastProjects(raw: string): PastProjectParsed[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // not JSON
  }
  return [];
}

/**
 * Renders a pastProjects string (JSON array or plain text) as formatted project cards.
 * Use this anywhere pastProjects is displayed to avoid showing raw JSON.
 */
export function PastProjectsDisplay({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value || value === "[]") {
    return <p className="text-sm text-muted-foreground italic">No past projects listed</p>;
  }

  const projects = parsePastProjects(value);

  if (projects.length === 0) {
    // Plain text fallback
    return <p className={`text-sm text-muted-foreground ${className ?? ""}`}>{value}</p>;
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {projects.map((p, idx) => (
        <div key={idx} className="p-3 bg-muted/30 rounded-lg space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium">{p.name || "Untitled"}</span>
            {p.year && (
              <Badge variant="outline" className="text-xs shrink-0">
                {p.year}
              </Badge>
            )}
          </div>
          {p.description && (
            <p className="text-sm text-muted-foreground">{p.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {p.client && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {p.client}
              </span>
            )}
            {p.value && (
              <span className="flex items-center gap-1">
                <PoundSterling className="h-3 w-3" />
                {p.value}
              </span>
            )}
            {p.sector && (
              <Badge variant="secondary" className="text-xs">
                {p.sector}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Formats a pastProjects string as React nodes for use in diff views.
 * Returns structured cards for JSON, plain text for legacy, "Empty" for null/empty.
 */
export function formatPastProjectsValue(raw: string | null): React.ReactNode {
  if (!raw || raw === "[]") return <span className="text-muted-foreground italic">Empty</span>;

  const projects = parsePastProjects(raw);

  if (projects.length > 0) {
    return (
      <div className="space-y-2">
        {projects.map((p, idx) => (
          <div key={idx} className="text-sm space-y-0.5">
            <div className="font-medium">
              {p.name || "Untitled"}
              {p.year && <span className="text-muted-foreground font-normal"> ({p.year})</span>}
            </div>
            {p.description && <div className="text-muted-foreground text-xs">{p.description}</div>}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {p.client && <span>Client: {p.client}</span>}
              {p.value && <span>Value: {p.value}</span>}
              {p.sector && <span>Sector: {p.sector}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return raw;
}
