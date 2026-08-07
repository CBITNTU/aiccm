"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/**
 * Always-visible reminder that the current session belongs to somebody else,
 * with the way out.
 *
 * Rendered at the top of every authenticated page: an admin who forgets they
 * are impersonating would otherwise take real actions as that user.
 */
export function ImpersonationBanner() {
  const t = useTranslations("Impersonation");
  const { impersonatedBy, user } = useAuth();
  const [stopping, setStopping] = useState(false);

  if (!impersonatedBy) return null;

  const stop = async () => {
    setStopping(true);
    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(t("stopFailed"));
      // Full reload so every provider re-reads the restored admin session,
      // mirroring how impersonation is started.
      window.location.href = "/admin/approvals";
    } catch (error) {
      console.error("Failed to stop impersonating:", error);
      toast.error(t("stopFailed"));
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span className="flex items-center gap-2 font-medium">
        <Eye className="h-4 w-4" />
        {t("banner", { email: user?.email ?? "" })}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={stop}
        disabled={stopping}
        className="h-7"
      >
        {stopping ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : null}
        {t("stop")}
      </Button>
    </div>
  );
}
