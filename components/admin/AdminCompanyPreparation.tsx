"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  User,
  UserCheck,
} from "lucide-react";
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
import { api } from "@/lib/api/client";
import type { AdminCompanyPreparation as PreparationData } from "@/lib/api/types";
import { AdminActingBanner } from "@/components/admin/AdminActingBanner";
import { AdminPreparationTabs } from "@/components/admin/AdminPreparationTabs";

/**
 * Company-scoped preparation console at /admin/companies/[companyId].
 *
 * Same job as the pre-approval console, entered from the other end: the admin
 * picked a company from the directory rather than a pending signup, so this
 * works for live accounts and for companies nobody owns. Account-level
 * decisions (approve/reject) stay on /admin/approvals/[userId], which is one
 * click away when an owner exists.
 */
export function AdminCompanyPreparation({ companyId }: { companyId: string }) {
  const t = useTranslations("AdminCompanyPreparation");
  const router = useRouter();

  const [data, setData] = useState<PreparationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setData(await api.adminGetCompanyPreparation(companyId));
    } catch (error) {
      console.error("Error loading company preparation:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Swap to a real session as the owner and land on their dashboard. The
   * app-wide `ImpersonationBanner` is the way back.
   */
  const viewAsUser = async (userId: string) => {
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

  const clearPrepared = async () => {
    setClearing(true);
    try {
      await api.adminClearCompanyPrepared(companyId);
      toast.success(t("toasts.clearSuccess"));
      setClearOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Error clearing prepared marker:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.clearFailed"),
      );
    } finally {
      setClearing(false);
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
          onClick={() => router.push("/admin/companies")}
        >
          {t("backToCompanies")}
        </Button>
      </div>
    );
  }

  const { company, owner, adminPrepared } = data;
  const ownerName =
    `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() ||
    owner?.email ||
    "";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          onClick={() => router.push("/admin/companies")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("backToCompanies")}
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-foreground">
                {company.companyName}
              </h1>
              {company.verificationStatus === "verified" ? (
                <Badge variant="default" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {t("verified")}
                </Badge>
              ) : (
                <Badge variant="outline">{t("unverified")}</Badge>
              )}
              {adminPrepared && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  {t("preparedBadge")}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {company.status && (
                <span className="capitalize">{company.status}</span>
              )}
              {owner ? (
                <>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {ownerName || t("unknownUser")}
                  </span>
                  {owner.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {owner.email}
                    </span>
                  )}
                </>
              ) : (
                <span>{t("noOwner")}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {adminPrepared && (
              <Button variant="outline" onClick={() => setClearOpen(true)}>
                <RotateCcw className="mr-1 h-4 w-4" />
                {t("clearPreparedButton")}
              </Button>
            )}
            {owner && (
              <>
                <Button
                  variant="outline"
                  onClick={() => viewAsUser(owner.userId)}
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
                  onClick={() =>
                    router.push(`/admin/approvals/${owner.userId}`)
                  }
                >
                  <UserCheck className="mr-1 h-4 w-4" />
                  {t("approvalConsoleButton")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <AdminActingBanner
        userName={ownerName}
        preparedAt={adminPrepared?.at ?? null}
        title={
          owner
            ? t("banner.title", { name: ownerName || t("unknownUser") })
            : t("banner.titleNoOwner", { name: company.companyName })
        }
      />

      <AdminPreparationTabs
        companyId={companyId}
        basePath={`/admin/companies/${companyId}`}
      />

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("clearDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              {t("clearDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={clearPrepared}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-4 w-4" />
              )}
              {t("clearDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
