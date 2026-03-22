"use client";

import { useState } from "react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { useSubmitVerification } from "@/hooks/useVerificationMutations";
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
    if (!companyData.description) missingFields.push("Description");
    if (!companyData.contactEmail) missingFields.push("Contact Email");
    if (!companyData.postcode) missingFields.push("Postcode");
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
          {latestRequest?.status === "rejected" && latestRequest.reviewNotes && (
            <p className="mt-2 text-sm">
              Previous feedback: {latestRequest.reviewNotes}
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Unverified state
  if (!isOwner) return null;

  return (
    <>
      <Alert className="border-blue-200 bg-blue-50">
        <ShieldAlert className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-800">Get Your Company Verified</AlertTitle>
        <AlertDescription className="text-blue-700">
          <p>Verified companies get access to:</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-sm">
            <li>More active projects</li>
            <li>Unlimited competencies</li>
            <li>A verified badge in the directory</li>
          </ul>
          {latestRequest?.status === "rejected" && latestRequest.reviewNotes && (
            <p className="mt-2 text-sm bg-red-50 border border-red-200 rounded p-2">
              Previous review feedback: {latestRequest.reviewNotes}
            </p>
          )}
          <Button
            size="sm"
            className="mt-3"
            onClick={() => setShowDialog(true)}
          >
            <ShieldCheck className="h-4 w-4 mr-1" />
            Submit for Verification
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Verification</DialogTitle>
            <DialogDescription>
              Our team will review your company profile to verify your business details and capabilities.
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
                placeholder="Any additional information you'd like to provide..."
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
              Submit for Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
