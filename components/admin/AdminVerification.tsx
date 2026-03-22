"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Clock,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

export function AdminVerification() {
  return (
    <div className="space-y-8">
      <VerificationRequests />
      <CompetencyRequests />
    </div>
  );
}

// ============================================================================
// Verification Requests Section
// ============================================================================
function VerificationRequests() {
  const queryClient = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState<{
    requestId: string;
    action: "approve" | "reject";
    companyName: string;
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminVerificationRequests(),
    queryFn: () => api.adminGetVerificationRequests(),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      requestId,
      action,
      reviewNotes,
    }: {
      requestId: string;
      action: "approve" | "reject";
      reviewNotes?: string;
    }) => api.adminReviewVerification(requestId, action, reviewNotes),
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === "approve"
          ? "Company verified successfully"
          : "Verification request rejected",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.adminVerificationRequests() });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to review request");
    },
  });

  const pendingRequests = data?.requests?.filter((r) => r.status === "pending") ?? [];
  const reviewedRequests = data?.requests?.filter((r) => r.status !== "pending") ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Verification Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive">{pendingRequests.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No pending verification requests.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((req) => {
                const snapshot = req.companySnapshot as Record<string, string> | null;
                return (
                  <div
                    key={req.id}
                    className="flex items-start justify-between gap-4 p-4 border rounded-lg"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{req.companyName}</span>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      </div>
                      {req.submissionNotes && (
                        <p className="text-sm text-muted-foreground">
                          Notes: {req.submissionNotes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Submitted: {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                      {snapshot && (
                        <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                          {snapshot.contactEmail && <p>Email: {snapshot.contactEmail}</p>}
                          {snapshot.postcode && <p>Postcode: {snapshot.postcode}</p>}
                          {snapshot.websiteUrl && <p>Website: {snapshot.websiteUrl}</p>}
                          {snapshot.companiesHouseNumber && (
                            <p>Companies House: {snapshot.companiesHouseNumber}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() =>
                          setReviewDialog({
                            requestId: req.id,
                            action: "approve",
                            companyName: req.companyName,
                          })
                        }
                        className="gap-1"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setReviewDialog({
                            requestId: req.id,
                            action: "reject",
                            companyName: req.companyName,
                          })
                        }
                        className="gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {reviewedRequests.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Recently Reviewed
              </h4>
              <div className="space-y-2">
                {reviewedRequests.slice(0, 5).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{req.companyName}</span>
                      <Badge
                        variant={req.status === "approved" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {req.status === "approved" ? "Verified" : "Rejected"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {req.reviewedAt
                        ? new Date(req.reviewedAt).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approve" ? "Approve" : "Reject"}{" "}
              Verification for {reviewDialog?.companyName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Add review notes (optional)..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === "approve" ? "default" : "destructive"}
              disabled={reviewMutation.isPending}
              onClick={() => {
                if (!reviewDialog) return;
                reviewMutation.mutate({
                  requestId: reviewDialog.requestId,
                  action: reviewDialog.action,
                  reviewNotes: reviewNotes || undefined,
                });
              }}
            >
              {reviewMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {reviewDialog?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// Competency Change Requests Section
// ============================================================================
function CompetencyRequests() {
  const queryClient = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState<{
    requestId: string;
    action: "approve" | "reject";
    companyName: string;
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminCompetencyRequests(),
    queryFn: () => api.adminGetCompetencyRequests(),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      requestId,
      action,
      reviewNotes,
    }: {
      requestId: string;
      action: "approve" | "reject";
      reviewNotes?: string;
    }) => api.adminReviewCompetencyRequest(requestId, action, reviewNotes),
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === "approve"
          ? "Competency changes approved and applied"
          : "Competency change request rejected",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCompetencyRequests() });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to review request");
    },
  });

  const pendingRequests = data?.requests?.filter((r) => r.status === "pending") ?? [];
  const capabilityMap = data?.capabilityMap ?? {};

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Competency Change Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive">{pendingRequests.length}</Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Competency changes from verified companies require approval.
          </p>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No pending competency change requests.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((req) => {
                const additions = (req.proposedAdditions ?? []) as string[];
                const removals = (req.proposedRemovals ?? []) as string[];
                return (
                  <div
                    key={req.id}
                    className="flex items-start justify-between gap-4 p-4 border rounded-lg"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{req.companyName}</span>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      </div>
                      {additions.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-emerald-600">
                            Add ({additions.length}):
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {additions.map((id) => (
                              <Badge
                                key={id}
                                variant="outline"
                                className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                              >
                                + {capabilityMap[id] || id}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {removals.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-red-600">
                            Remove ({removals.length}):
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {removals.map((id) => (
                              <Badge
                                key={id}
                                variant="outline"
                                className="text-xs bg-red-50 text-red-700 border-red-200"
                              >
                                - {capabilityMap[id] || id}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Submitted: {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() =>
                          setReviewDialog({
                            requestId: req.id,
                            action: "approve",
                            companyName: req.companyName,
                          })
                        }
                        className="gap-1"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setReviewDialog({
                            requestId: req.id,
                            action: "reject",
                            companyName: req.companyName,
                          })
                        }
                        className="gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approve" ? "Approve" : "Reject"}{" "}
              competency changes for {reviewDialog?.companyName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Add review notes (optional)..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === "approve" ? "default" : "destructive"}
              disabled={reviewMutation.isPending}
              onClick={() => {
                if (!reviewDialog) return;
                reviewMutation.mutate({
                  requestId: reviewDialog.requestId,
                  action: reviewDialog.action,
                  reviewNotes: reviewNotes || undefined,
                });
              }}
            >
              {reviewMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {reviewDialog?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
