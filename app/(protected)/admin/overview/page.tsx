"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAdminStats } from "@/hooks/useAdminStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  FileText,
  Users2,
  AlertCircle,
  ClipboardCheck,
  ShieldCheck,
  UserPlus,
  ArrowRight,
} from "lucide-react";

export default function AdminOverviewPage() {
  const t = useTranslations("AdminOverview");
  const { data: stats, isLoading } = useAdminStats();

  const statCards = [
    {
      label: t("stats.totalCompanies"),
      value: stats?.totalCompanies ?? 0,
      icon: Building2,
    },
    {
      label: t("stats.totalUsers"),
      value: stats?.totalUsers ?? 0,
      icon: Users2,
    },
    {
      label: t("stats.activeTenders"),
      value: stats?.activeTenders ?? 0,
      icon: FileText,
    },
    {
      label: t("stats.pendingActions"),
      value: (stats?.pendingApprovalsTotal ?? 0) + (stats?.pendingVerificationTotal ?? 0),
      icon: AlertCircle,
    },
  ];

  const actionItems = [
    {
      label: t("actionItems.pendingUserApprovalsLabel"),
      count: stats?.pendingUserApprovals ?? 0,
      href: "/admin/approvals",
      icon: UserPlus,
      description: t("actionItems.pendingUserApprovalsDescription"),
    },
    {
      label: t("actionItems.pendingJoinRequestsLabel"),
      count: stats?.pendingJoinRequests ?? 0,
      href: "/admin/approvals",
      icon: ClipboardCheck,
      description: t("actionItems.pendingJoinRequestsDescription"),
    },
    {
      label: t("actionItems.verificationRequestsLabel"),
      count: stats?.pendingVerifications ?? 0,
      href: "/admin/verification",
      icon: ShieldCheck,
      description: t("actionItems.verificationRequestsDescription"),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : (
                  <p className="text-2xl font-bold text-foreground">
                    {stat.value}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-primary" />
            {t("attention.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {actionItems.map((item) => {
              const hasItems = item.count > 0;
              return (
                <div
                  key={item.label}
                  className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                    hasItems
                      ? "bg-accent/10 border border-accent/20"
                      : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        hasItems ? "bg-accent/20" : "bg-muted"
                      }`}
                    >
                      <item.icon
                        className={`w-4 h-4 ${
                          hasItems ? "text-accent" : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          hasItems ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {isLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <Badge
                        variant={hasItems ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {item.count}
                      </Badge>
                    )}
                    {hasItems && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={item.href}>
                          {t("attention.review")}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
