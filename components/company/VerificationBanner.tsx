"use client";

import { useState } from "react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { useSubmitVerification } from "@/hooks/useVerificationMutations";
import type { ReviewFeedback } from "@/lib/api/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle,
  Loader2,
  Info,
  AlertTriangle,
  FileEdit,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyRecord as Company } from "@/lib/api/types";
import { useTranslations } from "next-intl";
import { useDeployment } from "@/lib/deployment/client";

interface VerificationBannerProps {
  companyId: string;
  companyData?: Company;
  isOwner?: boolean;
  /**
   * The caller may edit only because they are a superadmin preparing this
   * account. Submitting for verification is the owner's act — and the POST
   * route is deliberately member-only — so the submit affordance is hidden.
   */
  isAdminOverride?: boolean;
  hasPendingChanges?: boolean;
  pendingReviewRequest?: {
    id: string;
    status: string;
    reviewFeedback: Record<string, unknown> | null;
    reviewNotes: string | null;
    createdAt: string;
  } | null;
  latestResolvedRequest?: {
    id: string;
    status: string;
    reviewFeedback: Record<string, unknown> | null;
    reviewNotes: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
}

export function VerificationBanner({
  companyId,
  companyData,
  isOwner = false,
  isAdminOverride = false,
  hasPendingChanges = false,
  pendingReviewRequest,
  latestResolvedRequest,
}: VerificationBannerProps) {
  const t = useTranslations("CompanyPage");
  const { brand } = useDeployment();
  const { data, isLoading } = useVerificationStatus(companyId);
  const submitMutation = useSubmitVerification();
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");

  if (isLoading || !data) return null;

  const { verificationStatus, verifiedAt, latestRequest } = data;

  // Check completeness for submission
  const missingFields: string[] = [];
  if (companyData) {
    if (!companyData.companyName) missingFields.push(t("verification.missingFields.companyName"));
    if (!companyData.contactEmail) missingFields.push(t("verification.missingFields.contactEmail"));
    if (!companyData.websiteUrl) missingFields.push(t("verification.missingFields.website"));
    if (!companyData.contactPhone) missingFields.push(t("verification.missingFields.phone"));
    if (!companyData.address) missingFields.push(t("verification.missingFields.address"));
  }
  const isComplete = missingFields.length === 0;

  const handleSubmit = () => {
    submitMutation.mutate(
      { companyId, notes: notes || undefined },
      {
        onSuccess: () => {
          toast.success(t("verification.successToast"));
          setShowDialog(false);
          setNotes("");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : t("verification.errorFallback"));
        },
      },
    );
  };

  if (verificationStatus === "verified") {
    // Check if there's a pending change review
    if (pendingReviewRequest) {
      return (
        <Alert className="border-amber-200 bg-amber-50">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">{t("verification.underReview.title")}</AlertTitle>
          <AlertDescription className="text-amber-700">
            {t("verification.underReview.description")}
            {pendingReviewRequest.createdAt && (
              <span className="ml-1">
                {t("verification.underReview.submittedOn")}{new Date(pendingReviewRequest.createdAt).toLocaleDateString()}.
              </span>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    // Show feedback when admin has requested changes or rejected
    if (latestResolvedRequest?.status === "changes_requested" && hasPendingChanges) {
      const resolvedFeedback = latestResolvedRequest.reviewFeedback as ReviewFeedback | null;
      const hasResolvedStructuredFeedback = resolvedFeedback?.items?.some((i) => i.status === "needs_changes");

      return (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">{t("verification.changesRequested.title")}</AlertTitle>
          <AlertDescription className="text-amber-700">
            <div className="space-y-3">
              <p>
                {t("verification.changesRequested.description")}
              </p>

              {hasResolvedStructuredFeedback && (
                <div className="space-y-2">
                  {resolvedFeedback!.items
                    .filter((item) => item.status === "needs_changes")
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm bg-white/60 border border-amber-200 rounded p-2"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium text-amber-900">
                            {item.label}:
                          </span>{" "}
                          <span className="text-amber-800">{item.notes}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {resolvedFeedback?.overallNotes && (
                <p className="text-sm bg-white/60 border border-amber-200 rounded p-2">
                  {resolvedFeedback.overallNotes}
                </p>
              )}

              {!hasResolvedStructuredFeedback && latestResolvedRequest.reviewNotes && (
                <p className="text-sm bg-white/60 border border-amber-200 rounded p-2">
                  {latestResolvedRequest.reviewNotes}
                </p>
              )}

              {latestResolvedRequest.reviewedAt && (
                <p className="text-xs text-amber-600">
                  {t("verification.reviewedOn", { date: new Date(latestResolvedRequest.reviewedAt).toLocaleDateString() })}
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    if (latestResolvedRequest?.status === "rejected" && hasPendingChanges) {
      const resolvedFeedback = latestResolvedRequest.reviewFeedback as ReviewFeedback | null;

      return (
        <Alert className="border-red-200 bg-red-50">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">{t("verification.changesNotApproved.title")}</AlertTitle>
          <AlertDescription className="text-red-700">
            <div className="space-y-3">
              <p>
                {t("verification.changesNotApproved.description")}
              </p>

              {resolvedFeedback?.overallNotes && (
                <p className="text-sm bg-white/60 border border-red-200 rounded p-2">
                  {resolvedFeedback.overallNotes}
                </p>
              )}

              {latestResolvedRequest.reviewNotes && (
                <p className="text-sm bg-white/60 border border-red-200 rounded p-2">
                  {latestResolvedRequest.reviewNotes}
                </p>
              )}

              {latestResolvedRequest.reviewedAt && (
                <p className="text-xs text-red-600">
                  {t("verification.reviewedOn", { date: new Date(latestResolvedRequest.reviewedAt).toLocaleDateString() })}
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    if (hasPendingChanges) {
      return (
        <Alert className="border-amber-200 bg-amber-50">
          <FileEdit className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">{t("verification.draftChangesPending.title")}</AlertTitle>
          <AlertDescription className="text-amber-700">
            {t("verification.draftChangesPending.description")}
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="border-emerald-200 bg-emerald-50">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <AlertTitle className="text-emerald-800">{t("verification.verifiedCompany.title")}</AlertTitle>
        <AlertDescription className="text-emerald-700">
          {t("verification.verifiedCompany.description", { brand: brand.name })}
          {verifiedAt && (
            <span className="ml-1">
              {t("verification.verifiedOn", { date: new Date(verifiedAt).toLocaleDateString() })}
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (verificationStatus === "pending_verification") {
    return (
      <Alert className="border-amber-200 bg-amber-50">
        <Clock className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">{t("verification.pendingVerification.title")}</AlertTitle>
        <AlertDescription className="text-amber-700">
          {t("verification.pendingVerification.description")}
          {latestRequest?.createdAt && (
            <span className="ml-1">
              {t("verification.submittedOn", { date: new Date(latestRequest.createdAt).toLocaleDateString() })}
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Unverified state
  if (!isOwner) return null;

  const hasChangesRequested = latestRequest?.status === "changes_requested";
  const reviewFeedback = latestRequest?.reviewFeedback as ReviewFeedback | null;
  const hasStructuredFeedback =
    reviewFeedback?.items?.some((i) => i.status === "needs_changes");
  const wasRejected =
    latestRequest?.status === "rejected" && latestRequest.reviewNotes;

  return (
    <>
      <Alert
        className={
          hasChangesRequested
            ? "border-amber-200 bg-amber-50"
            : "border-blue-200 bg-blue-50"
        }
      >
        {hasChangesRequested ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-blue-600" />
        )}
        <AlertTitle
          className={hasChangesRequested ? "text-amber-800" : "text-blue-800"}
        >
          {hasChangesRequested
            ? t("verification.changesRequested.title")
            : t("verification.getVerifiedTitle")}
        </AlertTitle>
        <AlertDescription
          className={hasChangesRequested ? "text-amber-700" : "text-blue-700"}
        >
          {hasChangesRequested ? (
            <div className="space-y-3">
              <p>
                {t("verification.changesRequestedDescription")}
              </p>

              {/* Structured feedback display */}
              {hasStructuredFeedback && (
                <div className="space-y-2">
                  {reviewFeedback!.items
                    .filter((item) => item.status === "needs_changes")
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm bg-white/60 border border-amber-200 rounded p-2"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium text-amber-900">
                            {item.label}:
                          </span>{" "}
                          <span className="text-amber-800">{item.notes}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Overall reviewer notes */}
              {reviewFeedback?.overallNotes && (
                <p className="text-sm bg-white/60 border border-amber-200 rounded p-2">
                  {reviewFeedback.overallNotes}
                </p>
              )}

              {/* Fallback to reviewNotes if no structured feedback */}
              {!hasStructuredFeedback && latestRequest?.reviewNotes && (
                <p className="text-sm bg-white/60 border border-amber-200 rounded p-2">
                  {latestRequest.reviewNotes}
                </p>
              )}
            </div>
          ) : (
            <>
              <p>{t("verification.getVerifiedBenefitsAccess")}</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-sm">
                <li>{t("verification.getVerifiedBenefitActiveProjects")}</li>
                <li>{t("verification.getVerifiedBenefitCompetencies")}</li>
                <li>{t("verification.getVerifiedBenefitBadge")}</li>
              </ul>
              {wasRejected && (
                <p className="mt-2 text-sm bg-red-50 border border-red-200 rounded p-2">
                  {t("verification.previousFeedback")}{latestRequest.reviewNotes}
                </p>
              )}
            </>
          )}

          {/* An admin preparing this account can read the reviewer feedback
              above, but submitting for verification is the owner's act. */}
          {!isAdminOverride && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setShowDialog(true)}
            >
              <ShieldCheck className="h-4 w-4 mr-1" />
              {hasChangesRequested
                ? t("verification.resubmitButton")
                : t("verification.submitButton")}
            </Button>
          )}
        </AlertDescription>
      </Alert>

      <Dialog open={showDialog && !isAdminOverride} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasChangesRequested ? t("verification.dialog.resubmitTitle") : t("verification.dialog.submitTitle")}
            </DialogTitle>
            <DialogDescription>
              {hasChangesRequested
                ? t("verification.dialog.resubmitDescription")
                : t("verification.dialog.submitDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">{t("verification.dialog.profileCompleteness")}</h4>
              {isComplete ? (
                <div className="flex items-center gap-2 text-emerald-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  {t("verification.dialog.allFieldsComplete")}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <Info className="h-4 w-4" />
                    {t("verification.dialog.completeFieldsBefore")}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {missingFields.map((field) => (
                      <Badge key={field} variant="outline" className="text-xs text-red-600 border-red-200">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{t("verification.dialog.additionalNotes")}</label>
              <Textarea
                placeholder={
                  hasChangesRequested
                    ? t("verification.dialog.describeChangesPlaceholder")
                    : t("verification.dialog.additionalInfoPlaceholder")
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("verification.dialog.cancel")}
            </Button>
            <Button
              disabled={!isComplete || submitMutation.isPending}
              onClick={handleSubmit}
            >
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {hasChangesRequested ? t("verification.dialog.resubmit") : t("verification.dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
