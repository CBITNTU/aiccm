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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Clock,
  Building2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { AdminVerificationReviewPanel } from "./AdminVerificationReviewPanel";

export function AdminVerification() {
  return (
    <div className="space-y-8">
      <VerificationRequests />
      <CompetencyRequests />
    </div>
  );
}

// ============================================================================
// Status Badge Helper
// ============================================================================
function RequestStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "destructive" | "outline" | "secondary"; label: string; icon: React.ReactNode }> = {
    pending: {
      variant: "outline",
      label: "Pending",
      icon: <Clock className="h-3 w-3" />,
    },
    approved: {
      variant: "default",
      label: "Verified",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    rejected: {
      variant: "destructive",
      label: "Rejected",
      icon: <XCircle className="h-3 w-3" />,
    },
    changes_requested: {
      variant: "secondary",
      label: "Changes Requested",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  };
  const c = config[status] ?? { variant: "outline" as const, label: status, icon: null };
  return (
    <Badge variant={c.variant} className="gap-1">
      {c.icon}
      {c.label}
    </Badge>
  );
}

// ============================================================================
// Verification Requests Section
// ============================================================================
function VerificationRequests() {
  const [reviewPanelRequestId, setReviewPanelRequestId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminVerificationRequests(),
    queryFn: () => api.adminGetVerificationRequests(),
  });

  const allRequests = data?.requests ?? [];

  const filteredRequests =
    statusFilter === "all"
      ? allRequests
      : allRequests.filter((r) => {
          if (statusFilter === "pending") return r.status === "pending";
          if (statusFilter === "changes_requested") return r.status === "changes_requested";
          if (statusFilter === "reviewed")
            return r.status === "approved" || r.status === "rejected";
          return r.status === statusFilter;
        });

  const pendingCount = allRequests.filter((r) => r.status === "pending").length;
  const changesRequestedCount = allRequests.filter((r) => r.status === "changes_requested").length;

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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Verification Requests
              {pendingCount > 0 && (
                <Badge variant="destructive">{pendingCount}</Badge>
              )}
              {changesRequestedCount > 0 && (
                <Badge variant="secondary">{changesRequestedCount}</Badge>
              )}
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending Review</SelectItem>
                <SelectItem value="changes_requested">Changes Requested</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No {statusFilter === "all" ? "" : statusFilter.replace("_", " ")} verification requests.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const snapshot = req.companySnapshot as Record<string, string> | null;
                return (
                  <div
                    key={req.id}
                    className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{req.companyName}</span>
                        <RequestStatusBadge status={req.status} />
                        {req.requestType === "change_review" && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            Change Review
                          </Badge>
                        )}
                      </div>
                      {req.submissionNotes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {req.submissionNotes}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Submitted: {new Date(req.createdAt).toLocaleDateString()}
                        </span>
                        {snapshot?.websiteUrl && (
                          <a
                            href={snapshot.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            Website
                          </a>
                        )}
                        {snapshot?.companiesHouseNumber && (
                          <span>CH: {snapshot.companiesHouseNumber}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewPanelRequestId(req.id)}
                        className="gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Review
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminVerificationReviewPanel
        key={reviewPanelRequestId ?? "none"}
        requestId={reviewPanelRequestId}
        onClose={() => setReviewPanelRequestId(null)}
      />
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
