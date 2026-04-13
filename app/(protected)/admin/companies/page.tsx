"use client";

import { useTranslations } from "next-intl";
import { AdminCompanyManager } from "@/components/admin/AdminCompanyManager";

export default function AdminCompaniesPage() {
  const t = useTranslations("AdminCompanies");
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <AdminCompanyManager />
    </div>
  );
}
