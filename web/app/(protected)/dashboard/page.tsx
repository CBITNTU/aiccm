"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Building2,
  Users,
  Target,
  Clock,
  ArrowRight,
} from "lucide-react";

interface DashboardStats {
  totalTenders: number;
  matchingResults: number;
  companies: number;
  projects: number;
  recentMatches: any[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [stats, setStats] = useState<DashboardStats>({
    totalTenders: 0,
    matchingResults: 0,
    companies: 0,
    projects: 0,
    recentMatches: [],
  });
  const [loading, setLoading] = useState(true);
  const [userCompanies, setUserCompanies] = useState<any[]>([]);

  // Initialize supabase client
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
      setLoading(false);
    }
  }, []);

  // Fetch dashboard data
  useEffect(() => {
    if (!supabase || !user) return;

    const fetchDashboardData = async () => {
      try {
        // Fetch user's companies
        const { data: userCompaniesData } = await supabase
          .from("companies")
          .select("*")
          .eq("user_id", user.id);

        if (userCompaniesData) {
          setUserCompanies(userCompaniesData);
        }

        // Fetch total tenders
        const { count: tenderCount } = await supabase
          .from("tenders")
          .select("*", { count: "exact", head: true });

        // Fetch matching results for user's companies
        let matchingResults: any[] = [];
        let matchCount = 0;

        if (userCompaniesData && userCompaniesData.length > 0) {
          const companyIds = userCompaniesData.map((c) => c.id);
          const { data: matchData, count } = await supabase
            .from("matching_results")
            .select(
              `
              *,
              tenders(title, buyer, deadline),
              companies(company_name)
            `,
              { count: "exact" }
            )
            .in("company_id", companyIds)
            .order("created_at", { ascending: false })
            .limit(5);

          matchingResults = matchData || [];
          matchCount = count || 0;
        }

        // Fetch projects count
        let projectsCount = 0;
        if (userCompaniesData && userCompaniesData.length > 0) {
          const { data: projects } = await supabase
            .from("virtual_organizations")
            .select("id")
            .in(
              "lead_company_id",
              userCompaniesData.map((c) => c.id)
            );
          projectsCount = projects?.length || 0;
        }

        setStats({
          totalTenders: tenderCount || 0,
          matchingResults: matchCount,
          companies: userCompaniesData?.length || 0,
          projects: projectsCount,
          recentMatches: matchingResults,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [supabase, user]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here&apos;s what&apos;s happening with your tenders and
          opportunities.
        </p>
      </div>

      {/* Stats Cards */}
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
            <p className="text-xs text-muted-foreground">
              Available opportunities
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/tenders")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Matched Opportunities
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.matchingResults}</div>
            <p className="text-xs text-muted-foreground">
              Based on your profile
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/profile")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.companies}</div>
            <p className="text-xs text-muted-foreground">Active companies</p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/vo")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Projects Created
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projects}</div>
            <p className="text-xs text-muted-foreground">
              Consulting projects
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Company Overview */}
      {userCompanies.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Your Companies
            </CardTitle>
            <CardDescription>
              Companies registered to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {userCompanies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <div>
                    <p className="font-medium">{company.company_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {company.description?.slice(0, 100) || "No description"}
                      {company.description?.length > 100 ? "..." : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      company.status === "active" ? "default" : "secondary"
                    }
                  >
                    {company.status || "active"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Matches */}
      {stats.recentMatches.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Matches
                </CardTitle>
                <CardDescription>
                  Your latest tender matching opportunities
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => router.push("/tenders")}>
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between p-4 border hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold">{match.tenders?.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {match.tenders?.buyer} • Due:{" "}
                      {match.tenders?.deadline
                        ? new Date(match.tenders.deadline).toLocaleDateString()
                        : "N/A"}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">
                        {match.companies?.company_name}
                      </Badge>
                      <Badge
                        variant={
                          match.overall_score >= 80 ? "default" : "secondary"
                        }
                      >
                        {match.overall_score}% Match
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/companies")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Manage Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Update your company profiles and capabilities
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/tenders")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Browse Tenders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Discover new tender opportunities
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/vo")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Partnerships
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Build consulting teams and partnerships
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
