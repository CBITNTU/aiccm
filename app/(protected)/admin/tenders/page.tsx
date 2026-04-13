"use client";

import { useTranslations } from "next-intl";
import { AdminTenderImport } from "@/components/admin/AdminTenderImport";
import { AdminTenderSyncSchedule } from "@/components/admin/AdminTenderSyncSchedule";
import { AdminTenderSyncProvider } from "@/components/admin/AdminTenderSyncContext";
import { TenderAIRegeneration } from "@/components/admin/TenderAIRegeneration";

export default function AdminTendersPage() {
  const t = useTranslations("AdminTenders");
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <AdminTenderSyncProvider>
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t("sectionTitle")}</h3>
              <TenderAIRegeneration />
            </div>
            <AdminTenderSyncSchedule />
            <AdminTenderImport />
          </div>
        </div>
      </AdminTenderSyncProvider>
    </div>
  );
}
