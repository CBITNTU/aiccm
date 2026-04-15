"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  MapPin,
  Building2,
  PoundSterling,
  ExternalLink,
  Tag as TagIcon,
  Plus,
} from "lucide-react";
import { formatCpvCode } from "@/lib/cpvCodes";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import type { TenderRecord } from "@/lib/api/types";
import { resolveExternalNoticeLink } from "@/lib/tenders/externalNoticeLink";

interface TenderViewDialogProps {
  tender: TenderRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateProject?: (tenderId: string) => void;
  readOnly?: boolean;
}

export function TenderViewDialog({
  tender,
  open,
  onOpenChange,
  onCreateProject,
  readOnly: _readOnly = false,
}: TenderViewDialogProps) {
  const t = useTranslations("TenderViewDialog");

  if (!tender) return null;

  const formatBudget = (min?: number | null, max?: number | null) => {
    if (!min && !max) return t("budgetNotDisclosed");
    if (min && max)
      return t("budgetRange", { min: min.toLocaleString(), max: max.toLocaleString() });
    if (min) return t("budgetFrom", { amount: min.toLocaleString() });
    if (max) return t("budgetUpTo", { amount: max.toLocaleString() });
    return t("budgetNotDisclosed");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  const externalNoticeLink = resolveExternalNoticeLink({
    documents: tender.documents,
    referenceNumber: tender.referenceNumber,
  });

  const viewExternalLabel = (() => {
    if (externalNoticeLink.source === "ted") return t("viewOnTed");
    if (externalNoticeLink.source === "find-a-tender")
      return t("viewOnFindATender");
    return t("viewOriginalNotice");
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl">{tender.title}</DialogTitle>
              <DialogDescription className="mt-2">
                {tender.referenceNumber && (
                  <span className="text-sm">
                    {t("ref", { ref: tender.referenceNumber })}
                  </span>
                )}
              </DialogDescription>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {tender.deadline && isDeadlineSoon(tender.deadline) && (
                <Badge variant="destructive">{t("deadlineSoon")}</Badge>
              )}
              <TenderStatusBadge status={tender.status} />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Key Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("buyer")}</p>
                <p className="font-medium">{tender.buyer}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("location")}</p>
                <p className="font-medium">
                  {tender.location || t("notSpecified")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("published")}</p>
                <p className="font-medium">
                  {tender.publicationDate
                    ? formatDate(tender.publicationDate)
                    : t("notSpecified")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("deadline")}</p>
                <p className="font-medium">
                  {tender.deadline
                    ? formatDate(tender.deadline)
                    : t("notSpecified")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <PoundSterling className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("budget")}</p>
                <p className="font-medium">
                  {formatBudget(tender.budgetMin, tender.budgetMax)}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* AI Summary (if available) */}
          {tender.aiSummary && (
            <>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="text-blue-500">✨</span>
                  {t("aiSummary")}
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  {tender.aiSummary}
                </p>
              </div>
              <Separator />
            </>
          )}

          {/* Description */}
          <div>
            <h4 className="font-semibold mb-2">{t("description")}</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {tender.description || t("noDescription")}
            </p>
          </div>

          {/* CPV Codes */}
          {tender.cpvCodes && tender.cpvCodes.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TagIcon className="w-4 h-4" />
                  {t("cpvCodes")}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {tender.cpvCodes.map((code) => {
                    const cpv = formatCpvCode(code);
                    return (
                      <Badge key={code} variant="outline">
                        {cpv.code} - {cpv.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <Separator />
          <div className="flex justify-between gap-2">
            {onCreateProject && (
              <Button
                onClick={() => {
                  onCreateProject(tender.id);
                  onOpenChange(false);
                }}
                variant="default"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("createProject")}
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              {externalNoticeLink.url && (
                <Button asChild variant="outline">
                  <a
                    href={externalNoticeLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {viewExternalLabel}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
