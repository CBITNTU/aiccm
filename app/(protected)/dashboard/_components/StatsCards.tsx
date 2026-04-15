"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Building2, Users, Target } from "lucide-react";
import type { DashboardStats } from "./types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const t = useTranslations("Dashboard");
  const router = useRouter();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/tenders")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.totalTenders")}</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalTenders}</div>
          <p className="text-xs text-muted-foreground">{t("stats.activeTenders")}</p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/tenders?tab=matches")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t("stats.matchedOpportunities")}
          </CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.matchingResults}</div>
          <p className="text-xs text-muted-foreground">{t("stats.matchedToCompany")}</p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/my-company")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.myCompany")}</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.companies}</div>
          <p className="text-xs text-muted-foreground">{t("stats.activeCompanies")}</p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/projects")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t("stats.projectsCreated")}
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.projects}</div>
          <p className="text-xs text-muted-foreground">{t("stats.consultingProjects")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
