"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  MapPin,
  PoundSterling,
  TrendingUp,
  Eye,
  Bookmark,
  Trash2,
  Loader2,
} from "lucide-react";

interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: Record<string, unknown>;
  is_bookmarked: boolean;
  is_applied: boolean;
  created_at: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
}

interface TenderMatchCardProps {
  result: MatchingResult;
  onViewDetails: () => void;
  onBookmark: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
  readOnly?: boolean;
}

export function TenderMatchCard({
  result,
  onViewDetails,
  onBookmark,
  onDelete,
  isDeleting,
  readOnly,
}: TenderMatchCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  const formatBudget = (min?: number, max?: number): string => {
    if (!min && !max) return "Not specified";
    if (min && max && min !== max) {
      return `${min.toLocaleString()} - ${max.toLocaleString()}`;
    }
    if (min) return `${min.toLocaleString()}`;
    if (max) return `${max.toLocaleString()}`;
    return "Not specified";
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "Not specified";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div className="group border rounded-lg p-5 hover:shadow-md transition-all bg-card">
      {/* Header: Title + Overall Score */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors cursor-pointer"
            onClick={onViewDetails}
          >
            {result.tenders.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{result.tenders.buyer}</span>
            {result.tenders.location && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {result.tenders.location}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {result.is_applied && (
            <Badge variant="secondary" className="text-xs">
              Applied
            </Badge>
          )}
          {result.is_bookmarked && (
            <Badge variant="outline" className="text-xs">
              Saved
            </Badge>
          )}
          <Badge
            variant={getScoreBadgeVariant(result.overall_score)}
            className="text-sm px-2.5 py-1 gap-1"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {Math.round(result.overall_score)}%
          </Badge>
        </div>
      </div>

      {/* Score breakdown - compact inline with explanations */}
      <div className="mb-3">
        <div
          className="flex flex-wrap gap-3 cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors"
          onClick={onViewDetails}
        >
          {(() => {
            return (
              <>
                <div className="flex flex-col gap-0.5 text-xs group">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Capability:</span>
                    <span
                      className={`font-medium ${getScoreColor(result.capability_score)}`}
                    >
                      {Math.round(result.capability_score)}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 text-xs group">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Experience:</span>
                    <span
                      className={`font-medium ${getScoreColor(result.experience_score)}`}
                    >
                      {Math.round(result.experience_score)}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 text-xs group">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Location:</span>
                    <span
                      className={`font-medium ${getScoreColor(result.location_score)}`}
                    >
                      {Math.round(result.location_score)}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 text-xs group">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">
                      Certification:
                    </span>
                    <span
                      className={`font-medium ${getScoreColor(result.certification_score)}`}
                    >
                      {Math.round(result.certification_score)}%
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Description */}
      <p
        className="text-sm text-muted-foreground line-clamp-2 mb-3 cursor-pointer"
        onClick={onViewDetails}
      >
        {result.tenders.description}
      </p>

      {/* Match reasons */}
      {result.match_reasons.length > 0 && (
        <div className="mb-3">
          <p className="text-sm font-medium text-blue-700 leading-relaxed">
            ✓{" "}
            {result.match_reasons[0].length > 120
              ? result.match_reasons[0].substring(0, 120) + "..."
              : result.match_reasons[0]}
            {result.match_reasons.length > 1 && (
              <span className="ml-1 text-xs opacity-75">
                (+{result.match_reasons.length - 1} more)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Metadata + Actions */}
      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
            <PoundSterling className="h-3 w-3" />
            {formatBudget(result.tenders.budget_min, result.tenders.budget_max)}
          </span>
          {result.tenders.deadline && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${
                isDeadlineSoon(result.tenders.deadline)
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted"
              }`}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(result.tenders.deadline)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            <Eye className="h-4 w-4 mr-1" />
            Details
          </Button>
          <Button
            variant={result.is_bookmarked ? "default" : "ghost"}
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onBookmark();
            }}
            disabled={readOnly}
            title={
              readOnly ? "Action restricted for pending accounts" : undefined
            }
          >
            <Bookmark
              className={`h-4 w-4 ${result.is_bookmarked ? "fill-current" : ""}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting || readOnly}
            title={
              readOnly ? "Action restricted for pending accounts" : undefined
            }
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
