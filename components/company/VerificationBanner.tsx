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
} from "lucide-react";
import { toast } from "sonner";
import { CompanyRecord as Company } from "@/lib/api/types";

interface VerificationBannerProps {
  companyId: string;
  companyData?: Company;
  isOwner?: boolean;
}

export function VerificationBanner({
  companyId,
  companyData,
  isOwner = false,
}: VerificationBannerProps) {
  const { data, isLoading } = useVerificationStatus(companyId);
  const submitMutation = useSubmitVerification();
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");

  if (isLoading || !data) return null;

  const { verificationStatus, verifiedAt, latestRequest } = data;

  // Check completeness for submission
  const missingFields: string[] = [];
  if (companyData) {
    if (!companyData.companyName) missingFields.push("Company Name");
    if (!companyData.contactEmail) missingFields.push("Contact Email");
    if (!companyData.websiteUrl) missingFields.push("Website");
    if (!companyData.contactPhone) missingFields.push("Phone");
    if (!companyData.address) missingFields.push("Address");
  }
  const isComplete = missingFields.length === 0;

  const handleSubmit = () => {
    submitMutation.mutate(
      { companyId, notes: notes || undefined },
      {
        onSuccess: () => {
          toast.success("Verification request submitted successfully!");
          setShowDialog(false);
          setNotes("");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to submit");
        },
      },
    );
  };

  if (verificationStatus === "verified") {
    return (
      <Alert className="border-emerald-200 bg-emerald-50">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <AlertTitle className="text-emerald-800">Verified Company</AlertTitle>
        <AlertDescription className="text-emerald-700">
          This company has been verified by TNDRX.
          {verifiedAt && (
            <span className="ml-1">
              Verified on {new Date(verifiedAt).toLocaleDateString()}.
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
        <AlertTitle className="text-amber-800">Verification Under Review</AlertTitle>
        <AlertDescription className="text-amber-700">
          Your verification request is being reviewed by our team.
          {latestRequest?.createdAt && (
            <span className="ml-1">
              Submitted on {new Date(latestRequest.createdAt).toLocaleDateString()}.
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
            ? "Changes Requested"
            : "Get Your Company Verified"}
        </AlertTitle>
        <AlertDescription
          className={hasChangesRequested ? "text-amber-700" : "text-blue-700"}
        >
          {hasChangesRequested ? (
            <div className="space-y-3">
              <p>
                Our team reviewed your verification request and has requested some
                changes. Please address the feedback below and resubmit.
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
              <p>Verified companies get access to:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-sm">
                <li>More active projects</li>
                <li>Unlimited competencies</li>
                <li>A verified badge in the directory</li>
              </ul>
              {wasRejected && (
                <p className="mt-2 text-sm bg-red-50 border border-red-200 rounded p-2">
                  Previous review feedback: {latestRequest.reviewNotes}
                </p>
              )}
            </>
          )}

          <Button
            size="sm"
            className="mt-3"
            onClick={() => setShowDialog(true)}
          >
            <ShieldCheck className="h-4 w-4 mr-1" />
            {hasChangesRequested
              ? "Resubmit for Verification"
              : "Submit for Verification"}
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasChangesRequested ? "Resubmit" : "Submit"} for Verification
            </DialogTitle>
            <DialogDescription>
              {hasChangesRequested
                ? "Please ensure you've addressed the feedback before resubmitting. Our team will review the updated profile."
                : "Our team will review your company profile to verify your business details and capabilities."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Profile Completeness</h4>
              {isComplete ? (
                <div className="flex items-center gap-2 text-emerald-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  All required fields are complete
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <Info className="h-4 w-4" />
                    Please complete these fields before submitting:
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
              <label className="text-sm font-medium">Additional Notes (optional)</label>
              <Textarea
                placeholder={
                  hasChangesRequested
                    ? "Describe what changes you've made..."
                    : "Any additional information you'd like to provide..."
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
              Cancel
            </Button>
            <Button
              disabled={!isComplete || submitMutation.isPending}
              onClick={handleSubmit}
            >
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {hasChangesRequested ? "Resubmit" : "Submit"} for Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
