"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Calendar,
  MapPin,
  Banknote,
  Sparkles,
  Eye,
  Bookmark,
  Trash2,
  Loader2,
  Target,
} from "lucide-react";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";

interface TenderMatchCardProps {
  variant: "deep" | "basic";
  tenderId: string;
  title: string;
  buyer: string;
  location: string | null;
  description: string | null;
  deadline: string | null;
  status: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  /** ISO currency code of the tender; falls back to the profile currency when absent. */
  currency?: string | null;
  /** Overall score (deep) or semantic similarity as a percentage (basic), 0-100. */
  score: number;

  // Deep-only fields
  capabilityScore?: number;
  experienceScore?: number;
  locationScore?: number;
  certificationScore?: number;
  matchReasons?: string[] | null;
  isBookmarked?: boolean;
  isApplied?: boolean;

  // Handlers
  onViewDetails: () => void;
  onBookmark?: () => void;
  onDelete?: () => void;
  onDeepResearch?: () => void;
  isDeleting?: boolean;
  deepResearchPending?: boolean;
  readOnly?: boolean;
}

export function TenderMatchCard({
  variant,
  title,
  buyer,
  location,
  description,
  deadline,
  status,
  budgetMin,
  budgetMax,
  currency,
  score,
  capabilityScore = 0,
  experienceScore = 0,
  locationScore = 0,
  certificationScore = 0,
  matchReasons,
  isBookmarked,
  isApplied,
  onViewDetails,
  onBookmark,
  onDelete,
  onDeepResearch,
  isDeleting,
  deepResearchPending,
  readOnly,
}: TenderMatchCardProps) {
  const t = useTranslations("TenderMatchCard");
  const { currency: profileCurrency } = useDeployment();
  const tenderCurrency = resolveCurrencyConfig(currency, profileCurrency);
  const isDeep = variant === "deep";

  const getScoreColor = (value: number) => {
    if (value >= 80) return "text-green-600";
    if (value >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const formatBudget = (min?: number | null, max?: number | null): string => {
    if (!min && !max) return t("notSpecified");
    if (min && max && min !== max) {
      return `${formatCurrency(min, tenderCurrency)} - ${formatCurrency(max, tenderCurrency)}`;
    }
    if (min) return formatCurrency(min, tenderCurrency);
    if (max) return formatCurrency(max, tenderCurrency);
    return t("notSpecified");
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return t("notSpecified");
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (value: string): boolean => {
    if (!value) return false;
    const deadlineDate = new Date(value);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div className="group border rounded-lg p-5 hover:shadow-md transition-all bg-card">
      {/* Header: badges + title + prominent score */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {isDeep ? (
              <Badge className="text-xs gap-1 border-transparent bg-emerald-600 text-white shadow-sm hover:bg-emerald-600 dark:bg-emerald-500 dark:text-emerald-950">
                <Target className="h-3 w-3" />
                {t("deepResearchTag")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1">
                <Sparkles className="h-3 w-3" />
                {t("basicMatchBadge")}
              </Badge>
            )}
            <TenderStatusBadge status={status} size="sm" />
            {isApplied && (
              <Badge variant="secondary" className="text-xs">
                {t("applied")}
              </Badge>
            )}
            {isBookmarked && (
              <Badge variant="outline" className="text-xs">
                {t("saved")}
              </Badge>
            )}
          </div>
          <h3
            className="font-semibold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors cursor-pointer"
            onClick={onViewDetails}
          >
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{buyer}</span>
            {location && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {location}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`text-2xl font-bold tabular-nums ${getScoreColor(score)}`}
          >
            {Math.round(score)}%
          </div>
        </div>
      </div>

      {/* Closed tender banner */}
      {status === "closed" && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-muted/50 rounded-md text-xs text-muted-foreground border border-muted">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {t("tenderClosed")}
        </div>
      )}

      {/* Detail section: score breakdown (deep) or hint (basic) */}
      {isDeep ? (
        <div className="mb-3">
          <div
            className="flex flex-wrap gap-3 cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors"
            onClick={onViewDetails}
          >
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("capability")}</span>
              <span className={`font-medium ${getScoreColor(capabilityScore)}`}>
                {Math.round(capabilityScore)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("experience")}</span>
              <span className={`font-medium ${getScoreColor(experienceScore)}`}>
                {Math.round(experienceScore)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("location")}</span>
              <span className={`font-medium ${getScoreColor(locationScore)}`}>
                {Math.round(locationScore)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("certification")}</span>
              <span
                className={`font-medium ${getScoreColor(certificationScore)}`}
              >
                {Math.round(certificationScore)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Target className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{t("basicNoBreakdownHint")}</span>
        </div>
      )}

      {/* Description */}
      {description && (
        <p
          className="text-sm text-muted-foreground line-clamp-2 mb-3 cursor-pointer"
          onClick={onViewDetails}
        >
          {description}
        </p>
      )}

      {/* Match reasons (deep only) */}
      {isDeep && matchReasons && matchReasons.length > 0 && (
        <div className="mb-3">
          <p className="text-sm font-medium text-blue-700 leading-relaxed">
            ✓{" "}
            {matchReasons[0].length > 120
              ? matchReasons[0].substring(0, 120) + "..."
              : matchReasons[0]}
            {matchReasons.length > 1 && (
              <span className="ml-1 text-xs opacity-75">
                {t("moreReasons", { count: matchReasons.length - 1 })}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Metadata + Actions */}
      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
            <Banknote className="h-3 w-3" />
            {formatBudget(budgetMin, budgetMax)}
          </span>
          {deadline && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${
                isDeadlineSoon(deadline)
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted"
              }`}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(deadline)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            <Eye className="h-4 w-4 mr-1" />
            {t("details")}
          </Button>
          {isDeep ? (
            <>
              <Button
                variant={isBookmarked ? "default" : "ghost"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onBookmark?.();
                }}
                disabled={readOnly}
                title={readOnly ? t("pendingAccountRestricted") : undefined}
              >
                <Bookmark
                  className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
                disabled={isDeleting || readOnly}
                title={readOnly ? t("pendingAccountRestricted") : undefined}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </>
          ) : (
            onDeepResearch &&
            !readOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeepResearch();
                }}
                disabled={deepResearchPending}
                className="cursor-pointer disabled:cursor-not-allowed"
              >
                {deepResearchPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Target className="h-4 w-4 mr-1" />
                )}
                {t("deepResearch")}
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
