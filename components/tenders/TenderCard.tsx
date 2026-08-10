"use client";

import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Banknote, ChevronDown } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { translateTaxonomyName } from "@/lib/taxonomyTranslations";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import type { TenderRecord } from "@/lib/api/types";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";
import { getTenderSourceLabel } from "@/lib/tenders/externalNoticeLink";

interface Taxonomy {
  id: string;
  name: string;
}

interface TenderCardProps {
  tender: TenderRecord;
  taxonomies?: Taxonomy[];
  onClick?: () => void;
}

export function TenderCard({ tender, taxonomies, onClick }: TenderCardProps) {
  const t = useTranslations("TenderCard");
  const locale = useLocale();
  const { currency } = useDeployment();
  const tenderCurrency = resolveCurrencyConfig(tender.currency, currency);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const sourceLabel = getTenderSourceLabel(tender.documents);

  const formatBudget = (min?: number, max?: number) => {
    if (!min && !max) return t("budgetNotDisclosed");
    if (min && max && min !== max)
      return `${formatCurrency(min, tenderCurrency)} - ${formatCurrency(max, tenderCurrency)}`;
    if (min) return formatCurrency(min, tenderCurrency);
    if (max) return formatCurrency(max, tenderCurrency);
    return t("budgetNotDisclosed");
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return t("notSpecified");
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {sourceLabel && (
            <Badge variant="secondary" className="text-xs font-normal">
              {sourceLabel}
            </Badge>
          )}
          {tender.deadline && isDeadlineSoon(tender.deadline) && (
            <Badge variant="destructive" className="text-xs">
              {t("closingSoon")}
            </Badge>
          )}
          <TenderStatusBadge status={tender.status} size="sm" />
        </div>
      </div>

      {/* Buyer info */}
      <p className="text-sm text-muted-foreground mb-2">
        {tender.referenceNumber && (
          <span className="text-xs mr-2">Ref: {tender.referenceNumber}</span>
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
          <Banknote className="h-3 w-3" />
          {formatBudget(tender.budgetMin ?? undefined, tender.budgetMax ?? undefined)}
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
            {t("category", { count: taxonomies.length })}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${
                categoriesOpen ? "rotate-180" : ""
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1 mt-2">
              {taxonomies.map((taxonomy) => (
                <Badge key={taxonomy.id} variant="outline" className="text-xs">
                  {translateTaxonomyName(taxonomy.name, locale)}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
