"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Building2, Users, Target } from "lucide-react";
import type { DashboardStats } from "./types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/tenders")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tenders</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalTenders}</div>
          <p className="text-xs text-muted-foreground">Active tenders</p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/tenders?tab=matches")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Matched Opportunities
          </CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.matchingResults}</div>
          <p className="text-xs text-muted-foreground">Matched to your company</p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/my-company")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">My Company</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.companies}</div>
          <p className="text-xs text-muted-foreground">Active companies</p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/projects")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Projects Created
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.projects}</div>
          <p className="text-xs text-muted-foreground">Consulting projects</p>
        </CardContent>
      </Card>
    </div>
  );
}
