"use client";

import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, PoundSterling, ChevronDown } from "lucide-react";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

interface Taxonomy {
  id: string;
  name: string;
}

interface TenderCardProps {
  tender: {
    id: string;
    title: string;
    description: string;
    buyer: string;
    location: string;
    status: string;
    publication_date: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
    reference_number: string;
    cpv_codes?: string[];
  };
  taxonomies?: Taxonomy[];
  onClick?: () => void;
}

export function TenderCard({ tender, taxonomies, onClick }: TenderCardProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const formatBudget = (min?: number, max?: number) => {
    if (!min && !max) return "Not disclosed";
    if (min && max && min !== max)
      return `${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${min.toLocaleString()}`;
    if (max) return `${max.toLocaleString()}`;
    return "Not disclosed";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Not specified";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string) => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div
      className="group border rounded-lg p-5 hover:shadow-md transition-all cursor-pointer bg-card"
      onClick={onClick}
    >
      {/* Header: Title + Status */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="font-semibold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {tender.title}
        </h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tender.deadline && isDeadlineSoon(tender.deadline) && (
            <Badge variant="destructive" className="text-xs">
              Closing Soon
            </Badge>
          )}
          <TenderStatusBadge status={tender.status} size="sm" />
        </div>
      </div>

      {/* Buyer info */}
      <p className="text-sm text-muted-foreground mb-2">
        {tender.reference_number && (
          <span className="text-xs mr-2">Ref: {tender.reference_number}</span>
        )}
        {tender.buyer}
      </p>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
        {tender.description}
      </p>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {tender.location && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted rounded-md">
            <MapPin className="h-3 w-3" />
            {tender.location}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted rounded-md">
          <PoundSterling className="h-3 w-3" />
          {formatBudget(tender.budget_min, tender.budget_max)}
        </span>
        {tender.deadline && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md ${
              isDeadlineSoon(tender.deadline)
                ? "bg-destructive/10 text-destructive"
                : "bg-muted"
            }`}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(tender.deadline)}
          </span>
        )}
      </div>

      {/* Categories - collapsible */}
      {taxonomies && taxonomies.length > 0 && (
        <Collapsible
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
          className="mt-3"
        >
          <CollapsibleTrigger
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {taxonomies.length}{" "}
            {taxonomies.length === 1 ? "category" : "categories"}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${
                categoriesOpen ? "rotate-180" : ""
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1 mt-2">
              {taxonomies.map((t) => (
                <Badge key={t.id} variant="outline" className="text-xs">
                  {t.name}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
