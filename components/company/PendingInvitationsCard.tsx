"use client";

import { useState, useEffect } from "react";
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
import {
  Mail,
  Clock,
  XCircle,
  Loader2,
  Send,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface Invitation {
  id: string;
  email: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
}

interface PendingInvitationsCardProps {
  companyId?: string;
  refreshTrigger?: number;
}

export function PendingInvitationsCard({
  companyId,
  refreshTrigger,
}: PendingInvitationsCardProps) {
  const t = useTranslations("CompanyPage");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean;
    id: string;
    email: string;
  } | null>(null);

  const fetchInvitations = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/team/invite?companyId=${companyId}`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations || []);
      }
    } catch (error) {
      console.error("Error fetching invitations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run on companyId/refreshTrigger
  }, [companyId, refreshTrigger]);

  const handleCancel = async () => {
    if (!cancelDialog) return;

    setActionLoading(cancelDialog.id);
    try {
      const response = await fetch("/api/team/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: cancelDialog.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel invitation");
      }

      toast.success(t("invitations.cancelled"));
      setCancelDialog(null);
      fetchInvitations();
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel invitation",
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

  const getStatusBadge = (invitation: Invitation) => {
    const now = new Date();
    const expiresAt = new Date(invitation.expiresAt);
    const isExpired = expiresAt < now;

    if (invitation.status === "accepted") {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Accepted
        </Badge>
      );
    }

    if (invitation.status === "cancelled") {
      return (
        <Badge variant="secondary">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </Badge>
      );
    }

    if (isExpired || invitation.status === "expired") {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Expired
        </Badge>
      );
    }

    return (
      <Badge className="bg-amber-100 text-amber-800">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  };

  // Filter to show pending invitations
  const pendingInvitations = invitations.filter((inv) => {
    const now = new Date();
    const expiresAt = new Date(inv.expiresAt);
    return inv.status === "pending" && expiresAt >= now;
  });

  const recentInvitations = invitations
    .filter((inv) => {
      const now = new Date();
      const expiresAt = new Date(inv.expiresAt);
      return inv.status !== "pending" || expiresAt < now;
    })
    .slice(0, 5);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!companyId || invitations.length === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="w-5 h-5" />
            Sent Invitations
          </CardTitle>
          <CardDescription>
            Track invitations you&apos;ve sent to potential team members
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">
                Pending ({pendingInvitations.length})
              </h4>
              <div className="space-y-2">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {invitation.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Expires {formatDate(invitation.expiresAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(invitation)}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setCancelDialog({
                            open: true,
                            id: invitation.id,
                            email: invitation.email,
                          })
                        }
                        disabled={actionLoading === invitation.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {actionLoading === invitation.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {recentInvitations.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">Recent Activity</h4>
              <div className="space-y-2">
                {recentInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-2 border rounded-lg opacity-70"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{invitation.email}</span>
                    </div>
                    {getStatusBadge(invitation)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog
        open={cancelDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setCancelDialog(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Invitation</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel the invitation to{" "}
              {cancelDialog?.email}? They won&apos;t be able to use the
              invitation link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>
              Keep Invitation
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading === cancelDialog?.id}
            >
              {actionLoading === cancelDialog?.id ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-1" />
              )}
              Cancel Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
