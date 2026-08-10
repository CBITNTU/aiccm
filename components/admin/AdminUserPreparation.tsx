"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Eye,
  Loader2,
  Mail,
  Briefcase,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminActingBanner } from "@/components/admin/AdminActingBanner";
import { AdminPreparationTabs } from "@/components/admin/AdminPreparationTabs";

interface PreparationCompany {
  id: string;
  companyName: string;
  status: string | null;
  verificationStatus: string;
  adminPreparedAt: string | null;
}

interface PreparationUser {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  approvalStatus: string;
  signupType: string;
  role: string;
  onboarding: {
    currentStep: number;
    currentStepName: string;
    completedAt: string | null;
    isComplete: boolean;
  };
}

interface PreparationData {
  user: PreparationUser;
  companies: PreparationCompany[];
  primaryCompanyId: string | null;
  adminPrepared: { at: string; by: string | null } | null;
}

/**
 * Pre-approval console: everything an admin needs to set an account up before
 * approving it, then see what the user will see.
 *
 * The Company / Tenders / Dashboard tabs render the very same components the
 * user gets, so the preview is the real thing rather than a reimplementation.
 */
export function AdminUserPreparation({ userId }: { userId: string }) {
  const t = useTranslations("AdminPreparation");
  const router = useRouter();

  const [data, setData] = useState<PreparationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  /**
   * Swap to a real session as this user and land on their dashboard. The
   * app-wide `ImpersonationBanner` is the way back.
   */
  const viewAsUser = async () => {
    setImpersonating(true);
    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || t("toasts.impersonateFailed"));
      }
      // Full reload so every provider re-reads the new session cookie.
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Error starting impersonation:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.impersonateFailed"),
      );
      setImpersonating(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/approvals/${userId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || t("toasts.loadFailed"));
      }
      setData(await response.json());
    } catch (error) {
      console.error("Error loading approval detail:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const decide = async (approved: boolean) => {
    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          approved,
          ...(approved ? {} : { rejectionReason: rejectionReason || undefined }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || t("toasts.actionFailed"));
      }
      toast.success(body.message || t("toasts.actionSuccess"));
      setRejectOpen(false);
      router.push("/admin/approvals");
    } catch (error) {
      console.error("Error deciding on user:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.actionFailed"),
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/admin/approvals")}
        >
          {t("backToApprovals")}
        </Button>
      </div>
    );
  }

  const { user, primaryCompanyId, adminPrepared } = data;
  const userName =
    `${user.firstName || ""} ${user.lastName || ""}`.trim() || t("unknownUser");
  const basePath = `/admin/approvals/${userId}`;
  const isPending = user.approvalStatus === "pending";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          onClick={() => router.push("/admin/approvals")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("backToApprovals")}
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-foreground">{userName}</h1>
              <Badge variant={isPending ? "destructive" : "secondary"}>
                {user.approvalStatus === "pending"
                  ? t("status.pending")
                  : user.approvalStatus === "approved"
                    ? t("status.approved")
                    : t("status.rejected")}
              </Badge>
              {adminPrepared && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  {t("preparedBadge")}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {user.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </span>
              )}
              {user.jobTitle && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {user.jobTitle}
                </span>
              )}
              {data.companies[0] && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {data.companies[0].companyName}
                </span>
              )}
            </div>
          </div>

          {isPending && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={viewAsUser}
                disabled={impersonating}
              >
                {impersonating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-1 h-4 w-4" />
                )}
                {t("viewAsButton")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={actionLoading}
              >
                <XCircle className="mr-1 h-4 w-4" />
                {t("rejectButton")}
              </Button>
              <Button onClick={() => decide(true)} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-1 h-4 w-4" />
                )}
                {t("approveButton")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <AdminActingBanner
        userName={userName}
        preparedAt={adminPrepared?.at ?? null}
      />

      {!primaryCompanyId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("noCompany")}
          </CardContent>
        </Card>
      ) : (
        <AdminPreparationTabs
          companyId={primaryCompanyId}
          basePath={basePath}
        />
      )}

      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectionReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("rejectDialog.title", { name: userName })}
            </DialogTitle>
            <DialogDescription>
              {t("rejectDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="admin-rejection-reason">
              {t("rejectDialog.reasonLabel")}
            </Label>
            <Textarea
              id="admin-rejection-reason"
              rows={3}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder={t("rejectDialog.reasonPlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t("rejectDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => decide(false)}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-1 h-4 w-4" />
              )}
              {t("rejectDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
