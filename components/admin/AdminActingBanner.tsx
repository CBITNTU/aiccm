"use client";

import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";

interface AdminActingBannerProps {
  /** Display name of the user whose account is being prepared. */
  userName: string;
  /** Set once a superadmin has curated this company. */
  preparedAt?: string | null;
  /**
   * Overrides the default user-centric headline. The company-scoped console
   * opens on companies that may have no owner at all, where "you are preparing
   * X's account" would be wrong.
   */
  title?: string;
}

/**
 * Persistent reminder that the current screen edits somebody else's account.
 *
 * Without this an admin can easily mistake the pre-approval console for their
 * own company page — the two render the same component tree.
 */
export function AdminActingBanner({
  userName,
  preparedAt,
  title,
}: AdminActingBannerProps) {
  const t = useTranslations("AdminPreparation");

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            {title ?? t("banner.title", { name: userName })}
          </p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-200">
            {t("banner.description")}
          </p>
          {preparedAt && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              {t("banner.prepared", {
                date: new Date(preparedAt).toLocaleString("en-GB"),
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
