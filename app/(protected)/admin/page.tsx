"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Building2,
  FileText,
  Users2,
  Settings,
  Database,
  Activity,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminDataImport } from "@/components/admin/AdminDataImport";
import { AdminCompanyManager } from "@/components/admin/AdminCompanyManager";
import { AdminCSVImport } from "@/components/admin/AdminCSVImport";
import { AdminTenderImport } from "@/components/admin/AdminTenderImport";
import { AdminTenderSyncSchedule } from "@/components/admin/AdminTenderSyncSchedule";
import { AdminTenderSyncProvider } from "@/components/admin/AdminTenderSyncContext";
import { TenderAIRegeneration } from "@/components/admin/TenderAIRegeneration";
import { CompanyAIRegeneration } from "@/components/admin/CompanyAIRegeneration";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminTaxonomyEditor from "@/components/admin/AdminTaxonomyEditor";
import AdminApprovals from "@/components/admin/AdminApprovals";
import AdminOnboarding from "@/components/admin/AdminOnboarding";
import { AdminDemoSync } from "@/components/admin/AdminDemoSync";
import { AdminAISettings } from "@/components/admin/AdminAISettings";
import {
  UserCog,
  Tags,
  ClipboardCheck,
  UserPlus,
  FlaskConical,
  SlidersHorizontal,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

const overviewStats = [
  {
    label: "Total Companies",
    value: 247,
    change: +12,
    icon: Building2,
    color: "text-primary",
  },
  {
    label: "Active Tenders",
    value: 89,
    change: +7,
    icon: FileText,
    color: "text-secondary",
  },
  {
    label: "Consulting Teams",
    value: 23,
    change: +3,
    icon: Users2,
    color: "text-accent",
  },
  {
    label: "AI Extractions Today",
    value: 45,
    change: +8,
    icon: Activity,
    color: "text-primary",
  },
];

const systemHealth = [
  { service: "Company Data Extraction", status: "Operational", uptime: 99.9 },
  { service: "Tender Matching Engine", status: "Operational", uptime: 99.7 },
  { service: "VO Composer", status: "Operational", uptime: 98.9 },
  { service: "TNDRX Tender Feed", status: "Issues", uptime: 95.2 },
  { service: "OpenAI API", status: "Operational", uptime: 99.8 },
];

const recentActivity = [
  {
    type: "Company",
    action: "Onboarded",
    entity: "Midlands Construction Ltd",
    time: "2 hours ago",
  },
  {
    type: "Tender",
    action: "Published",
    entity: "Leicester Sports Complex",
    time: "3 hours ago",
  },
  {
    type: "VO",
    action: "Formed",
    entity: "Nottingham Infrastructure Group",
    time: "5 hours ago",
  },
  {
    type: "System",
    action: "AI Model Updated",
    entity: "GPT-5 Nano",
    time: "6 hours ago",
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "Operational":
      return "bg-secondary text-secondary-foreground";
    case "Issues":
      return "bg-accent text-accent-foreground";
    case "Down":
      return "bg-destructive text-destructive-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getActivityIcon = (type: string) => {
  switch (type) {
    case "Company":
      return Building2;
    case "Tender":
      return FileText;
    case "VO":
      return Users2;
    case "System":
      return Settings;
    default:
      return Activity;
  }
};

export default function AdminPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl || "overview");
  const { isAdmin, loading: roleLoading } = useUserRole();
  const router = useRouter();

  // Sync tab with URL parameter
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab state from URL
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  // Check admin access
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast.error("Superadmin access required");
      router.push("/dashboard");
    }
  }, [isAdmin, roleLoading, router]);

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">
                Loading superadmin access...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You do not have superadmin access. Redirecting to dashboard...
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Admin Console
          </h1>
          <p className="text-muted-foreground">
            Monitor platform performance, manage configurations, and view system
            analytics.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
            {[
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "approvals", label: "Approvals", icon: ClipboardCheck },
              { id: "onboarding", label: "Onboarding", icon: UserPlus },
              { id: "companies", label: "Companies", icon: Building2 },
              { id: "tenders", label: "Tenders", icon: FileText },
              { id: "users", label: "Users", icon: UserCog },
              { id: "taxonomy", label: "Taxonomy", icon: Tags },
              { id: "settings", label: "Settings", icon: SlidersHorizontal },
              { id: "demo-sync", label: "Demo sync", icon: FlaskConical },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                onClick={() => {
                  setActiveTab(tab.id);
                  router.push(`/admin?tab=${tab.id}`);
                }}
                className="flex items-center space-x-2"
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {overviewStats.map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <Badge
                        variant={stat.change > 0 ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {stat.change > 0 ? "+" : ""}
                        {stat.change}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {stat.value}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {stat.label}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* System Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-primary" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemHealth.map((service) => (
                    <div
                      key={service.service}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {service.status === "Issues" && (
                            <AlertCircle className="w-4 h-4 text-accent" />
                          )}
                          <span className="font-medium text-foreground">
                            {service.service}
                          </span>
                        </div>
                        <Badge className={getStatusColor(service.status)}>
                          {service.status}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          {service.uptime}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Uptime
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="w-5 h-5 mr-2 text-primary" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity, index) => {
                    const IconComponent = getActivityIcon(activity.type);
                    return (
                      <div
                        key={index}
                        className="flex items-center space-x-3 p-3 hover:bg-muted/50 rounded-lg transition-colors"
                      >
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <IconComponent className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {activity.action}{" "}
                            <span className="text-primary">
                              {activity.entity}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.time}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Approvals Tab */}
        {activeTab === "approvals" && <AdminApprovals />}

        {/* Onboarding Tab */}
        {activeTab === "onboarding" && <AdminOnboarding />}

        {/* Companies Tab */}
        {activeTab === "companies" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Company Management</h3>
                <CompanyAIRegeneration />
              </div>
              <AdminCSVImport />
              <AdminDataImport />
              <AdminCompanyManager />
            </div>
          </div>
        )}

        {/* Tenders Tab */}
        {activeTab === "tenders" && (
          <AdminTenderSyncProvider>
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Tender Management</h3>
                  <TenderAIRegeneration />
                </div>
                <AdminTenderSyncSchedule />
                <AdminTenderImport />
              </div>
            </div>
          </AdminTenderSyncProvider>
        )}

        {/* Users Tab */}
        {activeTab === "users" && <AdminUsers />}

        {/* Taxonomy Tab */}
        {activeTab === "taxonomy" && (
          <div className="space-y-6">
            <AdminTaxonomyEditor />
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <AdminAISettings />
          </div>
        )}

        {/* Demo sync (test mode) Tab */}
        {activeTab === "demo-sync" && <AdminDemoSync />}

        {/* Other tabs placeholder */}
        {activeTab !== "overview" &&
          activeTab !== "approvals" &&
          activeTab !== "onboarding" &&
          activeTab !== "companies" &&
          activeTab !== "tenders" &&
          activeTab !== "users" &&
          activeTab !== "taxonomy" &&
          activeTab !== "settings" &&
          activeTab !== "demo-sync" && (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Settings className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}{" "}
                  Management
                </h3>
                <p className="text-muted-foreground">
                  This section is under development. Advanced {activeTab}{" "}
                  management features will be available soon.
                </p>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
