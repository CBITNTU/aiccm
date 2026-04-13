"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useProjectInvitations } from "@/hooks/useProjectInvitations";
import { useTranslations } from "next-intl";

interface InvitationsBannerProps {
  userId: string | null;
}

export function InvitationsBanner({ userId }: InvitationsBannerProps) {
  const t = useTranslations("InvitationsBanner");
  const { data } = useProjectInvitations(userId);

  const count = data?.invitations?.length ?? 0;

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-blue-600 dark:bg-blue-700 rounded-lg shadow-sm">
      <Mail className="h-5 w-5 text-white/80 shrink-0" />
      <p className="text-sm text-white flex-1">
        {t("message", { count })}
      </p>
      <Link
        href="/projects/invitations"
        className="text-sm font-semibold text-white bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 rounded-md whitespace-nowrap"
      >
        {t("viewButton")}
      </Link>
    </div>
  );
}
