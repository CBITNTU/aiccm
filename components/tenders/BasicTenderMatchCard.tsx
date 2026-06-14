"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Eye,
  Loader2,
  MapPin,
  Sparkles,
  Target,
} from "lucide-react";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";

export interface BasicTenderMatchItem {
  tenderId: string;
  title: string;
  buyer: string;
  location: string | null;
  deadline: Date | string | null;
  status: string | null;
  similarity: number;
  band: "high" | "medium" | "low";
}

interface BasicTenderMatchCardProps {
  match: BasicTenderMatchItem;
  companyId: string;
  onDeepResearch?: () => void;
  deepResearchPending?: boolean;
  readOnly?: boolean;
}

function bandClasses(band: BasicTenderMatchItem["band"]): string {
  switch (band) {
    case "high":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300";
    case "medium":
      return "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300";
    case "low":
      return "bg-slate-500/15 text-slate-600 border-slate-300 dark:text-slate-300";
  }
}

export function BasicTenderMatchCard({
  match,
  companyId,
  onDeepResearch,
  deepResearchPending,
  readOnly,
}: BasicTenderMatchCardProps) {
  const t = useTranslations("TenderMatching");

  const deadlineLabel =
    match.deadline != null
      ? new Date(match.deadline).toLocaleDateString("en-GB")
      : null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              {t("basicMatchBadge")}
            </Badge>
            <Badge variant="outline" className={bandClasses(match.band)}>
              {match.band}
            </Badge>
            {match.status ? (
              <TenderStatusBadge status={match.status} />
            ) : null}
          </div>
          <h3 className="font-semibold leading-snug">{match.title}</h3>
          <p className="text-sm text-muted-foreground">{match.buyer}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums">
            {Math.round(match.similarity * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">{t("basicScore")}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {match.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {match.location}
          </span>
        ) : null}
        {deadlineLabel ? (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {deadlineLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild size="sm" variant="outline">
          <Link href={`/tenders/${match.tenderId}?companyId=${companyId}`}>
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {t("viewDetails")}
          </Link>
        </Button>
        {onDeepResearch && !readOnly ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onDeepResearch}
            disabled={deepResearchPending}
          >
            {deepResearchPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Target className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("deepResearch")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
