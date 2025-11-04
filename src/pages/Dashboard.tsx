import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Building2, FileText, Users, Calendar, ArrowRight, Target, Award, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CompanySelector } from "@/components/CompanySelector";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";
import BusinessChatbot from "@/components/BusinessChatbot";
interface DashboardStats {
  totalTenders: number;
  matchingResults: number;
  companies: number;
  projects: number;
  recentMatches: any[];
  tendersByMonth: any[];
  matchScoreDistribution: any[];
}
interface CompanyAnalysis {
  technicalExpertise: number;
  safetyStandards: number;
  innovation: number;
  projectExperience: number;
  certifications: number;
  marketReputation: number;
  overallScore: number;
  analysis: string;
}
const Dashboard = () => {
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalTenders: 0,
    matchingResults: 0,
    companies: 0,
    projects: 0,
    recentMatches: [],
    tendersByMonth: [],
    matchScoreDistribution: []
  });
  const [loading, setLoading] = useState(true);
  const [companyAnalysis, setCompanyAnalysis] = useState<CompanyAnalysis | null>(null);
  const [userCompany, setUserCompany] = useState<any>(null);
  const [userCompanies, setUserCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);

  // Function to load stored analysis from company data
  const loadStoredAnalysis = () => {
    if (selectedCompany?.ai_analysis) {
      setCompanyAnalysis(selectedCompany.ai_analysis as CompanyAnalysis);
    } else {
      setCompanyAnalysis(null);
    }
  };

  // Function to fetch new analysis
  const fetchCompanyAnalysis = async () => {
    if (!selectedCompany?.id) return;
    setIsAnalyzing(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('analyze-company', {
        body: {
          companyId: selectedCompany.id
        }
      });
      if (error) {
        console.error('Error fetching analysis:', error);
        return;
      }
      if (data?.success && data?.analysis) {
        setCompanyAnalysis(data.analysis);

        // Refresh company data to get updated ai_analysis field
        const {
          data: updatedCompany,
          error: fetchError
        } = await supabase.from('companies').select('*').eq('id', selectedCompany.id).single();
        if (fetchError) {
          console.error('Error fetching updated company data:', fetchError);
        } else if (updatedCompany) {
          setSelectedCompany(updatedCompany);
          // Update in the companies list
          setUserCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
        }
      }
    } catch (error) {
      console.error('Error fetching company analysis:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  useEffect(() => {
    executeFetchDashboardData();
  }, []);
  useEffect(() => {
    if (selectedCompany) {
      // Load stored analysis instead of automatically analyzing
      loadStoredAnalysis();
    }
  }, [selectedCompany]);
  const radarData = companyAnalysis ? [{
    subject: 'Technical Expertise',
    A: companyAnalysis.technicalExpertise,
    fullMark: 100
  }, {
    subject: 'Safety Standards',
    A: companyAnalysis.safetyStandards,
    fullMark: 100
  }, {
    subject: 'Innovation',
    A: companyAnalysis.innovation,
    fullMark: 100
  }, {
    subject: 'Project Experience',
    A: companyAnalysis.projectExperience,
    fullMark: 100
  }, {
    subject: 'Certifications',
    A: companyAnalysis.certifications,
    fullMark: 100
  }, {
    subject: 'Market Reputation',
    A: companyAnalysis.marketReputation,
    fullMark: 100
  }] : [];
  const executeFetchDashboardData = async () => {
    try {
      // Fetch user's companies
      const {
        data: userCompaniesData
      } = await supabase.from('companies').select('*').eq('user_id', user?.id);
      if (userCompaniesData && userCompaniesData.length > 0) {
        setUserCompanies(userCompaniesData);
        // Set first company as selected by default
        setSelectedCompany(userCompaniesData[0]);
        // Keep backward compatibility
        setUserCompany(userCompaniesData[0]);
      }

      // Fetch total tenders
      const {
        count: tenderCount
      } = await supabase.from('tenders').select('*', {
        count: 'exact',
        head: true
      });

      // Fetch matching results for user's companies
      const {
        data: matchingResults,
        count: matchCount
      } = await supabase.from('matching_results').select(`
          *,
          tenders(title, buyer, deadline),
          companies(company_name)
        `, {
        count: 'exact'
      }).in('company_id', userCompaniesData?.map(c => c.id) || []).order('created_at', {
        ascending: false
      }).limit(5);

      // Fetch projects count (simplified to avoid type inference issues)
      let projectsCount = 0;
      if (userCompaniesData && userCompaniesData.length > 0) {
        // Using type assertion to avoid deep type instantiation error
        const supabaseClient: any = supabase;
        const { data: projects } = await supabaseClient
          .from('virtual_organizations')
          .select('id')
          .in('owner_company_id', userCompaniesData.map((c: any) => c.id));
        projectsCount = projects?.length || 0;
      }

      // Generate mock data for charts
      const tendersByMonth = [{
        month: 'Jan',
        tenders: 45
      }, {
        month: 'Feb',
        tenders: 52
      }, {
        month: 'Mar',
        tenders: 67
      }, {
        month: 'Apr',
        tenders: 58
      }, {
        month: 'May',
        tenders: 72
      }, {
        month: 'Jun',
        tenders: 84
      }];
      const matchScoreDistribution = [{
        range: '90-100',
        count: 5,
        color: '#22c55e'
      }, {
        range: '80-89',
        count: 12,
        color: '#3b82f6'
      }, {
        range: '70-79',
        count: 18,
        color: '#f59e0b'
      }, {
        range: '60-69',
        count: 8,
        color: '#ef4444'
      }];
      setStats({
        totalTenders: tenderCount || 0,
        matchingResults: matchCount || 0,
        companies: userCompaniesData?.length || 0,
        projects: projectsCount || 0,
        recentMatches: matchingResults || [],
        tendersByMonth,
        matchScoreDistribution
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded"></div>)}
            </div>
          </div>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <Header variant="app" />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome back! Here's what's happening with your tenders and opportunities.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/tenders')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tenders</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTenders}</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+12%</span> from last month
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/tenders?tab=matches')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Matched Opportunities</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.matchingResults}</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+8%</span> from last week
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/profile')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">My Companies</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.companies}</div>
              <p className="text-xs text-muted-foreground">
                Active companies
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/vo')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projects Created</CardTitle>
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

        {/* Company Performance Analysis */}
        {userCompanies.length > 0 && <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Select Company for Analysis
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CompanySelector selectedCompanyId={selectedCompany?.id} onCompanySelect={setSelectedCompany} showAddButton={true} />
              </CardContent>
            </Card>
          </div>}

        {selectedCompany && <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Company Performance Benchmark
                    </CardTitle>
                    <CardDescription>
                      AI-powered assessment of {selectedCompany.company_name}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {companyAnalysis && <Badge variant="default" className="text-lg px-3 py-1">
                        {companyAnalysis.overallScore}/100
                      </Badge>}
                    <Button variant="outline" size="sm" onClick={fetchCompanyAnalysis} disabled={isAnalyzing}>
                      {isAnalyzing ? 'Analyzing...' : companyAnalysis ? 'Re-analyze' : 'Analyze'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {companyAnalysis ? <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={250}>
                      <RadarChart data={radarData} className="rounded-full">
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" tick={{
                    fontSize: 12
                  }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{
                    fontSize: 10
                  }} />
                        <Tooltip contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px'
                  }} labelStyle={{
                    color: 'hsl(var(--foreground))'
                  }} formatter={(value, name) => [`${value}/100`, name === 'Performance Score' ? 'Score' : name]} />
                        <Radar name="Performance Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg border border-border">
                      <strong className="text-foreground">AI Benchmark Analysis:</strong> {companyAnalysis.analysis}
                    </div>
                  </div> : <div className="h-[250px] flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/30">
                    <div className="text-center">
                      <Award className="h-16 w-16 mx-auto mb-3 opacity-40" />
                      <p className="font-medium mb-1">No Performance Benchmark Available</p>
                      <p className="text-sm mb-4">Click "Analyze" to generate your company's performance benchmark</p>
                    </div>
                  </div>}
              </CardContent>
            </Card>

            {/* Quick Company Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Company Overview
                </CardTitle>
                <CardDescription>
                  Key information and business insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm font-medium">Company Name</span>
                    <span className="text-sm">{selectedCompany.company_name}</span>
                  </div>
                  
                  {selectedCompany.safety_rating && <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">Safety Rating</span>
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700 rounded-none">
                        {selectedCompany.safety_rating}
                      </Badge>
                    </div>}
                  
                  {selectedCompany.digital_maturity && <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">Digital Maturity</span>
                      <Badge variant="default" className="rounded-none bg-black">
                        {selectedCompany.digital_maturity}
                      </Badge>
                    </div>}

                  {selectedCompany.market_position && <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">Market Position</span>
                      <span className="text-sm">{selectedCompany.market_position}</span>
                    </div>}
                  
                  {/* Financial Data */}
                  {selectedCompany.financial_data && Object.keys(selectedCompany.financial_data).length > 0 && (
                    <>
                      <Separator className="my-2" />
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Financial Information</h4>
                        {Object.entries(selectedCompany.financial_data).map(([key, field]: [string, any]) => (
                          <div key={key} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                            <span className="text-sm font-medium capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <span className="text-sm font-semibold">
                              {field.value?.toLocaleString() || 'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant={selectedCompany.status === 'active' ? 'default' : 'secondary'} className={selectedCompany.status === 'active' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}>
                      {selectedCompany.status?.charAt(0).toUpperCase() + selectedCompany.status?.slice(1)}
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => navigate('/profile')}>
                      View Profile
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => navigate('/companies')}>
                      Manage Companies
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Tender Trends Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Tender Trends
              </CardTitle>
              <CardDescription>
                Monthly tender opportunities over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.tendersByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="tenders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{
                  fill: "hsl(var(--primary))"
                }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Match Score Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Match Score Distribution
              </CardTitle>
              <CardDescription>
                How well your companies match available tenders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.matchScoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent Matches - Filter by selected company */}
        {(() => {
          const filteredMatches = selectedCompany 
            ? stats.recentMatches.filter(match => match.company_id === selectedCompany.id)
            : stats.recentMatches;
          
          return filteredMatches.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Recent Matches
                    </CardTitle>
                    <CardDescription>
                      {selectedCompany 
                        ? `Latest matches for ${selectedCompany.company_name}`
                        : 'Your latest tender matching opportunities'
                      }
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => navigate('/tenders')}>
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredMatches.map(match => (
                    <div key={match.id} className="flex items-center justify-between p-4 border hover:bg-muted/50 transition-colors rounded-2xl">
                      <div className="flex-1">
                        <h4 className="font-semibold">{match.tenders?.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {match.tenders?.buyer} • Due: {match.tenders?.deadline ? new Date(match.tenders.deadline).toLocaleDateString() : 'N/A'}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary">
                            {match.companies?.company_name}
                          </Badge>
                          <Badge variant={match.overall_score >= 80 ? "default" : "secondary"}>
                            {match.overall_score}% Match
                          </Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedMatch(match);
                        setDialogOpen(true);
                      }}>
                        View Details
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/companies')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                Manage Companies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Update your company profiles and capabilities</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/tenders')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Browse Tenders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Discover new tender opportunities</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/vo')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Partnerships
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Build consulting teams and partnerships</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Tender Detail Dialog */}
        {selectedMatch && (
          <TenderDetailDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            result={selectedMatch}
          />
        )}

        {/* Business Chatbot */}
        <BusinessChatbot companyData={selectedCompany} />
      </main>
    </div>;
};
export default Dashboard;