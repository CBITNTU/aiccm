"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserPlus,
  Mail,
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { InviteTeamMemberDialog } from "./InviteTeamMemberDialog";

interface JoinRequest {
  id: string;
  userId: string;
  companyId: string;
  companyNameRequested: string;
  message: string | null;
  status: string;
  createdAt: string;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  } | null;
}

interface Member {
  id: string;
  companyId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  } | null;
}

interface TeamMembersCardProps {
  companyId?: string;
  companyName?: string;
  variant?: "full" | "compact";
  showRequests?: boolean;
  isSmeOwner?: boolean;
  currentUserId?: string;
  onInviteSent?: () => void;
}

export function TeamMembersCard({
  companyId,
  companyName = "Company",
  variant = "full",
  showRequests = true,
  isSmeOwner = false,
  currentUserId,
  onInviteSent,
}: TeamMembersCardProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  // Rejection dialog state
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    id: string;
    name: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Remove member dialog state
  const [removeDialog, setRemoveDialog] = useState<{
    open: boolean;
    memberId: string;
    name: string;
    userId: string;
  } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = companyId
        ? `/api/company/approve-member?companyId=${companyId}`
        : "/api/company/approve-member";
      const response = await fetch(url);

      if (response.status === 403) {
        setHasAccess(false);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        // Filter by companyId if provided
        const filteredRequests = companyId
          ? (data.requests || []).filter(
              (r: JoinRequest) => r.companyId === companyId,
            )
          : data.requests || [];
        const filteredMembers = companyId
          ? (data.members || []).filter(
              (m: Member) => m.companyId === companyId,
            )
          : data.members || [];

        setRequests(filteredRequests);
        setMembers(filteredMembers);
        setHasAccess(true);
      }
    } catch (error) {
      console.error("Error fetching member data:", error);
      if (variant === "full") {
        toast.error("Failed to fetch member data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run on companyId change
  }, [companyId]);

  const handleApprove = async (requestId: string, userName: string) => {
    setActionLoading(requestId);
    try {
      const response = await fetch("/api/company/approve-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, approved: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve request");
      }

      toast.success(`${userName}'s request has been approved`);
      fetchData();
    } catch (error) {
      console.error("Error approving request:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to approve request",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;

    setActionLoading(rejectDialog.id);
    try {
      const response = await fetch("/api/company/approve-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: rejectDialog.id,
          approved: false,
          rejectionReason: rejectionReason || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reject request");
      }

      toast.success(`${rejectDialog.name}'s request has been rejected`);
      setRejectDialog(null);
      setRejectionReason("");
      fetchData();
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to reject request",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeDialog || !companyId) return;

    setActionLoading(removeDialog.memberId);
    try {
      const response = await fetch("/api/team/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: removeDialog.memberId,
          companyId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove member");
      }

      toast.success(`${removeDialog.name} has been removed from the team`);
      setRemoveDialog(null);
      fetchData();
    } catch (error) {
      console.error("Error removing member:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove member",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasAccess) {
    return null; // Don't show anything if user doesn't have access
  }

  const pendingCount = requests.length;

  // Compact variant for dashboard
  if (variant === "compact") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                {members.length} member{members.length !== 1 ? "s" : ""}
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingCount} pending
                  </Badge>
                )}
              </CardDescription>
            </div>
            {companyId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/my-company?tab=team")}
              >
                Manage Team
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.slice(0, 3).map((member) => {
              const userName = member.user
                ? `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim() ||
                  "Unknown"
                : "Unknown";
              const isAdmin = member.role === "admin";
              const isPendingPlatformApproval =
                member.status === "pending_platform_approval";

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${isPendingPlatformApproval ? "bg-yellow-100" : "bg-primary/10"}`}
                  >
                    {isPendingPlatformApproval ? (
                      <Clock className="w-3 h-3 text-yellow-600" />
                    ) : isAdmin ? (
                      <Shield className="w-3 h-3 text-primary" />
                    ) : (
                      <Users className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="truncate">{userName}</span>
                  {isPendingPlatformApproval ? (
                    <Badge
                      variant="outline"
                      className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200"
                    >
                      Pending
                    </Badge>
                  ) : (
                    isAdmin && (
                      <Badge variant="secondary" className="text-xs">
                        Admin
                      </Badge>
                    )
                  )}
                </div>
              );
            })}
            {members.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{members.length - 3} more
              </p>
            )}
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground">No members yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full variant
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Manage team members and review join requests
              </CardDescription>
            </div>
            {isSmeOwner && companyId && (
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pending Requests */}
          {showRequests && requests.length > 0 && (
            <div>
              <h4 className="font-semibold flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4" />
                Pending Requests
                <Badge variant="destructive">{pendingCount}</Badge>
              </h4>
              <div className="space-y-3">
                {requests.map((request) => {
                  const userName = request.user
                    ? `${request.user.firstName || ""} ${request.user.lastName || ""}`.trim() ||
                      "Unknown"
                    : "Unknown";

                  return (
                    <div
                      key={request.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{userName}</span>
                            <Badge variant="outline">Pending</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {request.user?.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {request.user.email}
                              </div>
                            )}
                            {request.user?.jobTitle && (
                              <div className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {request.user.jobTitle}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(request.createdAt)}
                            </div>
                          </div>
                          {request.message && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              {request.message}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setRejectDialog({
                                open: true,
                                id: request.id,
                                name: userName,
                              })
                            }
                            disabled={actionLoading === request.id}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(request.id, userName)}
                            disabled={actionLoading === request.id}
                          >
                            {actionLoading === request.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4 mr-1" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current Members */}
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <Users className="w-4 h-4" />
              Current Members
              <Badge variant="secondary">{members.length}</Badge>
            </h4>
            {members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No team members yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const userName = member.user
                    ? `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim() ||
                      "Unknown"
                    : "Unknown";
                  const isAdmin = member.role === "admin";
                  const isSelf = currentUserId === member.userId;
                  const isPendingPlatformApproval =
                    member.status === "pending_platform_approval";
                  const adminCount = members.filter(
                    (m) => m.role === "admin",
                  ).length;
                  const canRemove =
                    isSmeOwner &&
                    !isSelf &&
                    !isPendingPlatformApproval &&
                    !(isAdmin && adminCount === 1);

                  return (
                    <div
                      key={member.id}
                      className={`flex items-center justify-between p-3 border rounded-lg ${isPendingPlatformApproval ? "bg-muted/30" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${isPendingPlatformApproval ? "bg-yellow-100" : "bg-primary/10"}`}
                        >
                          {isPendingPlatformApproval ? (
                            <Clock className="w-4 h-4 text-yellow-600" />
                          ) : isAdmin ? (
                            <Shield className="w-4 h-4 text-primary" />
                          ) : (
                            <Users className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{userName}</span>
                            {isPendingPlatformApproval && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200"
                              >
                                Pending Platform Approval
                              </Badge>
                            )}
                            {isAdmin && !isPendingPlatformApproval && (
                              <Badge className="bg-primary/10 text-primary text-xs">
                                Admin
                              </Badge>
                            )}
                            {isSelf && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {member.user?.email && (
                              <span>{member.user.email}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {isPendingPlatformApproval ? "Requested" : "Joined"}{" "}
                          {formatDate(member.createdAt)}
                        </span>
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setRemoveDialog({
                                open: true,
                                memberId: member.id,
                                name: userName,
                                userId: member.userId,
                              })
                            }
                            disabled={actionLoading === member.id}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {actionLoading === member.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      <Dialog
        open={rejectDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialog(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejectDialog?.name}&apos;s Request
            </DialogTitle>
            <DialogDescription>
              This will reject their request to join your company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Reason (optional)</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(null);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading === rejectDialog?.id}
            >
              {actionLoading === rejectDialog?.id ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-1" />
              )}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog
        open={removeDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveDialog(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeDialog?.name}</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removeDialog?.name} from the
              team? They will lose access to the company.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={actionLoading === removeDialog?.memberId}
            >
              {actionLoading === removeDialog?.memberId ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Team Member Dialog */}
      {companyId && (
        <InviteTeamMemberDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          companyId={companyId}
          companyName={companyName}
          onInviteSent={() => {
            fetchData();
            onInviteSent?.();
          }}
        />
      )}
    </>
  );
}
