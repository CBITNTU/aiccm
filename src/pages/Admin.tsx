import { useState, useEffect } from "react";
import { BarChart3, Building2, FileText, Users2, Settings, Database, Activity, AlertCircle, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Tags, UserCog } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminDataImport from "@/components/AdminDataImport";
import AdminCompanyManager from "@/components/AdminCompanyManager";
import AdminTenderImport from "@/components/AdminTenderImport";
import AdminTaxonomyEditor from "@/components/AdminTaxonomyEditor";
import AdminUsers from "@/pages/AdminUsers";

interface OverviewStats {
  totalCompanies: number;
  totalCompaniesChange: number;
  activeTenders: number;
  activeTendersChange: number;
  consultingTeams: number;
  consultingTeamsChange: number;
  aiExtractionsToday: number;
  aiExtractionsChange: number;
  totalUsers: number;
  totalUsersChange: number;
  matchingResults: number;
  matchingResultsChange: number;
}

interface OnboardingMetrics {
  totalOnboarded: number;
  completedProfiles: number;
  incompleteProfiles: number;
  completionRate: number;
  avgCompletionTime: number;
}

interface DataQualityMetrics {
  companiesWithCompleteData: number;
  companiesWithIncompleteData: number;
  dataCompletenessRate: number;
  companiesWithAIAnalysis: number;
  companiesWithoutAIAnalysis: number;
}

interface RecentActivity {
  type: "Company" | "Tender" | "VO" | "User";
  action: string;
  entity: string;
  time: string;
  timestamp: string;
}

const Admin = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Stats
  const [stats, setStats] = useState<OverviewStats>({
    totalCompanies: 0,
    totalCompaniesChange: 0,
    activeTenders: 0,
    activeTendersChange: 0,
    consultingTeams: 0,
    consultingTeamsChange: 0,
    aiExtractionsToday: 0,
    aiExtractionsChange: 0,
    totalUsers: 0,
    totalUsersChange: 0,
    matchingResults: 0,
    matchingResultsChange: 0,
  });

  const [onboardingMetrics, setOnboardingMetrics] = useState<OnboardingMetrics>({
    totalOnboarded: 0,
    completedProfiles: 0,
    incompleteProfiles: 0,
    completionRate: 0,
    avgCompletionTime: 0,
  });

  const [dataQuality, setDataQuality] = useState<DataQualityMetrics>({
    companiesWithCompleteData: 0,
    companiesWithIncompleteData: 0,
    dataCompletenessRate: 0,
    companiesWithAIAnalysis: 0,
    companiesWithoutAIAnalysis: 0,
  });

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  // Check admin access
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast.error("Admin access required");
      navigate("/dashboard");
    }
  }, [isAdmin, roleLoading, navigate]);

  const fetchDashboardData = async () => {
    if (!isAdmin) return;
    
    try {
      setRefreshing(true);

      // Get current date ranges for comparison
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const lastWeekStart = new Date(todayStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastMonthStart = new Date(todayStart);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

      // Fetch all stats in parallel
      const [
        companiesRes,
        companiesLastWeekRes,
        tendersRes,
        tendersLastWeekRes,
        projectsRes,
        projectsLastWeekRes,
        usersRes,
        usersLastWeekRes,
        matchesRes,
        matchesLastWeekRes,
        companiesTodayRes,
        companiesLastWeekTodayRes,
        profilesRes,
        companiesDataQualityRes,
        companiesWithAnalysisRes,
        recentCompaniesRes,
        recentTendersRes,
        recentProjectsRes,
        recentUsersRes,
      ] = await Promise.all([
        // Total companies
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('companies').select('*', { count: 'exact', head: true }).lt('created_at', lastWeekStart.toISOString()),
        
        // Active tenders
        supabase.from('tenders').select('*', { count: 'exact', head: true }).in('status', ['open', 'closing_soon', 'framework']),
        supabase.from('tenders').select('*', { count: 'exact', head: true }).in('status', ['open', 'closing_soon', 'framework']).lt('created_at', lastWeekStart.toISOString()),
        
        // Consulting teams (virtual organizations)
        supabase.from('virtual_organizations').select('*', { count: 'exact', head: true }),
        supabase.from('virtual_organizations').select('*', { count: 'exact', head: true }).lt('created_at', lastWeekStart.toISOString()),
        
        // Total users
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).lt('created_at', lastWeekStart.toISOString()),
        
        // Matching results
        supabase.from('matching_results').select('*', { count: 'exact', head: true }),
        supabase.from('matching_results').select('*', { count: 'exact', head: true }).lt('created_at', lastWeekStart.toISOString()),
        
        // AI extractions today (companies with ai_analysis updated today)
        supabase.from('companies').select('id', { count: 'exact', head: true }).not('ai_analysis', 'is', null).gte('updated_at', todayStart.toISOString()),
        supabase.from('companies').select('id', { count: 'exact', head: true }).not('ai_analysis', 'is', null).gte('updated_at', yesterdayStart.toISOString()).lt('updated_at', todayStart.toISOString()),
        
        // Profiles for onboarding metrics
        supabase.from('profiles').select('created_at'),
        
        // Data quality - companies with complete data
        supabase.from('companies').select('id, description, key_capabilities, certifications, postcode, contact_email').eq('status', 'active'),
        
        // Companies with AI analysis
        supabase.from('companies').select('id', { count: 'exact', head: true }).not('ai_analysis', 'is', null),
        
        // Recent activity - companies
        supabase.from('companies').select('company_name, created_at, status').order('created_at', { ascending: false }).limit(5),
        
        // Recent activity - tenders
        supabase.from('tenders').select('title, created_at, status').order('created_at', { ascending: false }).limit(5),
        
        // Recent activity - projects
        supabase.from('virtual_organizations').select('name, created_at, status').order('created_at', { ascending: false }).limit(5),
        
        // Recent activity - users
        supabase.from('profiles').select('email, created_at').order('created_at', { ascending: false }).limit(5),
      ]);

      // Calculate stats with changes
      const totalCompanies = companiesRes.count || 0;
      const totalCompaniesLastWeek = companiesLastWeekRes.count || 0;
      const totalCompaniesChange = totalCompanies - totalCompaniesLastWeek;

      const activeTenders = tendersRes.count || 0;
      const activeTendersLastWeek = tendersLastWeekRes.count || 0;
      const activeTendersChange = activeTenders - activeTendersLastWeek;

      const consultingTeams = projectsRes.count || 0;
      const consultingTeamsLastWeek = projectsLastWeekRes.count || 0;
      const consultingTeamsChange = consultingTeams - consultingTeamsLastWeek;

      const totalUsers = usersRes.count || 0;
      const totalUsersLastWeek = usersLastWeekRes.count || 0;
      const totalUsersChange = totalUsers - totalUsersLastWeek;

      const matchingResults = matchesRes.count || 0;
      const matchingResultsLastWeek = matchesLastWeekRes.count || 0;
      const matchingResultsChange = matchingResults - matchingResultsLastWeek;

      const aiExtractionsToday = companiesTodayRes.count || 0;
      const aiExtractionsYesterday = companiesLastWeekTodayRes.count || 0;
      const aiExtractionsChange = aiExtractionsToday - aiExtractionsYesterday;

      setStats({
        totalCompanies,
        totalCompaniesChange,
        activeTenders,
        activeTendersChange,
        consultingTeams,
        consultingTeamsChange,
        aiExtractionsToday,
        aiExtractionsChange,
        totalUsers,
        totalUsersChange,
        matchingResults,
        matchingResultsChange,
      });

      // Calculate onboarding metrics
      const profiles = profilesRes.data || [];
      const totalOnboarded = profiles.length;
      const companiesData = companiesDataQualityRes.data || [];
      
      // Check for complete company profiles (has essential fields)
      const completedProfiles = companiesData.filter(c => 
        c.description && 
        c.description.trim().length > 0 &&
        c.key_capabilities && 
        Array.isArray(c.key_capabilities) && 
        c.key_capabilities.length > 0 &&
        c.postcode && 
        c.postcode.trim().length > 0 &&
        c.contact_email &&
        c.contact_email.trim().length > 0
      ).length;
      
      const incompleteProfiles = companiesData.length - completedProfiles;
      const completionRate = companiesData.length > 0 
        ? Math.round((completedProfiles / companiesData.length) * 100) 
        : 0;

      // Calculate average completion time (simplified - would need proper user_id join)
      // For now, we'll use a placeholder
      const avgCompletionTime = 0; // Placeholder - would need proper calculation with user_id joins

      setOnboardingMetrics({
        totalOnboarded: companiesData.length, // Use companies count as onboarded count
        completedProfiles,
        incompleteProfiles,
        completionRate,
        avgCompletionTime, // In hours (placeholder for now)
      });

      // Calculate data quality metrics
      const companiesWithCompleteData = completedProfiles;
      const companiesWithIncompleteData = incompleteProfiles;
      const dataCompletenessRate = companiesData.length > 0 
        ? Math.round((companiesWithCompleteData / companiesData.length) * 100) 
        : 0;
      const companiesWithAIAnalysis = companiesWithAnalysisRes.count || 0;
      const companiesWithoutAIAnalysis = companiesData.length - companiesWithAIAnalysis;

      setDataQuality({
        companiesWithCompleteData,
        companiesWithIncompleteData,
        dataCompletenessRate,
        companiesWithAIAnalysis,
        companiesWithoutAIAnalysis,
      });

      // Build recent activity feed
      const activities: RecentActivity[] = [];
      
      // Add recent companies
      (recentCompaniesRes.data || []).forEach((company: any) => {
        activities.push({
          type: "Company",
          action: company.status === 'active' ? "Onboarded" : "Created",
          entity: company.company_name,
          time: formatTimeAgo(company.created_at),
          timestamp: company.created_at,
        });
      });

      // Add recent tenders
      (recentTendersRes.data || []).forEach((tender: any) => {
        activities.push({
          type: "Tender",
          action: "Published",
          entity: tender.title,
          time: formatTimeAgo(tender.created_at),
          timestamp: tender.created_at,
        });
      });

      // Add recent projects
      (recentProjectsRes.data || []).forEach((project: any) => {
        activities.push({
          type: "VO",
          action: "Formed",
          entity: project.name,
          time: formatTimeAgo(project.created_at),
          timestamp: project.created_at,
        });
      });

      // Add recent users
      (recentUsersRes.data || []).forEach((user: any) => {
        activities.push({
          type: "User",
          action: "Registered",
          entity: user.email || "New User",
          time: formatTimeAgo(user.created_at),
          timestamp: user.created_at,
        });
      });

      // Sort by timestamp and take most recent 10
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activities.slice(0, 10));

    } catch (error) {
      console.error('Error fetching admin dashboard data:', error);
      toast.error('Failed to load admin dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchDashboardData();
    }
  }, [isAdmin]);

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const overviewStats = [
    { 
      label: "Total Companies", 
      value: stats.totalCompanies, 
      change: stats.totalCompaniesChange, 
      icon: Building2, 
      color: "text-primary" 
    },
    { 
      label: "Active Tenders", 
      value: stats.activeTenders, 
      change: stats.activeTendersChange, 
      icon: FileText, 
      color: "text-secondary" 
    },
    { 
      label: "Consulting Teams", 
      value: stats.consultingTeams, 
      change: stats.consultingTeamsChange,
      icon: Users2, 
      color: "text-accent" 
    },
    { 
      label: "AI Extractions Today", 
      value: stats.aiExtractionsToday, 
      change: stats.aiExtractionsChange, 
      icon: Activity, 
      color: "text-primary" 
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Operational": return "bg-secondary text-secondary-foreground";
      case "Issues": return "bg-accent text-accent-foreground";
      case "Down": return "bg-destructive text-destructive-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "Company": return Building2;
      case "Tender": return FileText;
      case "VO": return Users2;
      case "User": return Users2;
      default: return Activity;
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading admin dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You do not have admin access. Redirecting to dashboard...
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Admin Console</h1>
            <p className="text-muted-foreground">
              Monitor platform performance, manage configurations, and view system analytics.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={fetchDashboardData}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
            {[
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "companies", label: "Companies", icon: Building2 },
              { id: "tenders", label: "Tenders", icon: FileText },
              { id: "users", label: "Users", icon: UserCog },
              { id: "taxonomy", label: "Taxonomy", icon: Tags },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                onClick={() => setActiveTab(tab.id)}
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
              {overviewStats.map((stat, index) => (
                <Card key={stat.label} className="card-professional">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center`}>
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      {stat.change !== 0 && (
                        <Badge variant={stat.change > 0 ? "default" : "destructive"} className="text-xs flex items-center gap-1">
                          {stat.change > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {stat.change > 0 ? "+" : ""}{stat.change}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      {stat.change !== 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {stat.change > 0 ? "↑" : "↓"} vs last week
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Additional Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users2 className="w-5 h-5" />
                    User Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Users</span>
                      <span className="text-lg font-semibold">{stats.totalUsers}</span>
                    </div>
                    {stats.totalUsersChange !== 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Change (7 days)</span>
                        <Badge variant={stats.totalUsersChange > 0 ? "default" : "destructive"}>
                          {stats.totalUsersChange > 0 ? "+" : ""}{stats.totalUsersChange}
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Matches</span>
                      <span className="text-lg font-semibold">{stats.matchingResults}</span>
                    </div>
                    {stats.matchingResultsChange !== 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Change (7 days)</span>
                        <Badge variant={stats.matchingResultsChange > 0 ? "default" : "destructive"}>
                          {stats.matchingResultsChange > 0 ? "+" : ""}{stats.matchingResultsChange}
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Onboarding Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Onboarded</span>
                      <span className="text-lg font-semibold">{onboardingMetrics.totalOnboarded}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Completed Profiles</span>
                      <span className="text-lg font-semibold">{onboardingMetrics.completedProfiles}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Incomplete Profiles</span>
                      <span className="text-lg font-semibold">{onboardingMetrics.incompleteProfiles}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Completion Rate</span>
                      <Badge variant={onboardingMetrics.completionRate >= 70 ? "default" : "secondary"}>
                        {onboardingMetrics.completionRate}%
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Data Quality Monitor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Data Quality Monitor
                </CardTitle>
                <CardDescription>
                  Monitor data completeness and quality across the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Data Completeness Rate</span>
                        <Badge variant={dataQuality.dataCompletenessRate >= 70 ? "default" : "secondary"}>
                          {dataQuality.dataCompletenessRate}%
                        </Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${dataQuality.dataCompletenessRate >= 70 ? 'bg-primary' : 'bg-accent'}`}
                          style={{ width: `${dataQuality.dataCompletenessRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Companies with Complete Data</span>
                      <span className="font-semibold text-green-600">{dataQuality.companiesWithCompleteData}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Companies with Incomplete Data</span>
                      <span className="font-semibold text-orange-600">{dataQuality.companiesWithIncompleteData}</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">AI Analysis Coverage</span>
                        <Badge variant={dataQuality.companiesWithAIAnalysis > 0 ? "default" : "secondary"}>
                          {dataQuality.companiesWithAIAnalysis} analyzed
                        </Badge>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">With AI Analysis</span>
                      <span className="font-semibold text-green-600">{dataQuality.companiesWithAIAnalysis}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Without AI Analysis</span>
                      <span className="font-semibold text-orange-600">{dataQuality.companiesWithoutAIAnalysis}</span>
                    </div>
                  </div>
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
                <CardDescription>
                  Latest platform activity and changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentActivity.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent activity
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentActivity.map((activity, index) => {
                      const IconComponent = getActivityIcon(activity.type);
                      return (
                        <div key={index} className="flex items-center space-x-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <IconComponent className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {activity.action} <span className="text-primary">{activity.entity}</span>
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {activity.time}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Companies Tab */}
        {activeTab === "companies" && (
          <div className="space-y-6">
            <AdminDataImport />
            <AdminCompanyManager />
          </div>
        )}

        {/* Tenders Tab */}
        {activeTab === "tenders" && (
          <div className="space-y-6">
            <AdminTenderImport />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <AdminUsers />
        )}

        {/* Taxonomy Tab */}
        {activeTab === "taxonomy" && (
          <div className="space-y-6">
            <AdminTaxonomyEditor />
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
