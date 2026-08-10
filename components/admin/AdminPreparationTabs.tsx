"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyDetailPage } from "@/components/company/CompanyDetailPage";
import { AdminTenderPreview } from "@/components/admin/AdminTenderPreview";
import { AdminDashboardPreview } from "@/components/admin/AdminDashboardPreview";
import { AdminMatchCuration } from "@/components/admin/AdminMatchCuration";

interface AdminPreparationTabsProps {
  companyId: string;
  /** Where the company page writes its `?tab=` state — the console's own URL. */
  basePath: string;
}

/**
 * The body of both preparation consoles: the company page, tender matches and
 * dashboard the user themselves would see, rendered from the very same
 * components so the preview is the real thing rather than a reimplementation.
 *
 * Editing works because the caller is a superadmin — the override lives in
 * lib/api/companyAccess.ts, not in any prop here.
 */
export function AdminPreparationTabs({
  companyId,
  basePath,
}: AdminPreparationTabsProps) {
  const t = useTranslations("AdminPreparation");
  const [tab, setTab] = useState("company");

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="company">{t("tabs.company")}</TabsTrigger>
        <TabsTrigger value="tenders">{t("tabs.tenders")}</TabsTrigger>
        <TabsTrigger value="curation">{t("tabs.curation")}</TabsTrigger>
        <TabsTrigger value="dashboard">{t("tabs.dashboard")}</TabsTrigger>
      </TabsList>

      {/* The user's own company page, fully editable via admin override. */}
      <TabsContent value="company" className="-mx-4 sm:-mx-6 lg:-mx-8">
        <CompanyDetailPage
          key={companyId}
          companyId={companyId}
          basePath={basePath}
        />
      </TabsContent>

      <TabsContent value="tenders">
        <AdminTenderPreview companyId={companyId} />
      </TabsContent>

      {/* Ranking overrides for this company's feed. Admin-only surface — the
          overlay it writes is invisible on every user-facing route. */}
      <TabsContent value="curation">
        <AdminMatchCuration companyId={companyId} />
      </TabsContent>

      <TabsContent value="dashboard">
        <AdminDashboardPreview companyId={companyId} />
      </TabsContent>
    </Tabs>
  );
}
