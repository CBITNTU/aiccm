import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Building2, Globe, Mail, Phone, MapPin, Award, Wrench, Users, FileText, Edit2, RefreshCw, ArrowLeft, DollarSign, TrendingUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { hasOpenAIKey } from "@/lib/openai";
import OpenAIKeyDialog from "@/components/OpenAIKeyDialog";
import { TenderMatching } from "@/components/TenderMatching";
import BusinessChatbot from "@/components/BusinessChatbot";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type Company = Database['public']['Tables']['companies']['Row'];

const CompanyDetail = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { companyId } = useParams();
  const [showOpenAIDialog, setShowOpenAIDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!user || !companyId) return;
      
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .eq('user_id', user.id) // Ensure user owns this company
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // No company found or user doesn't own it
            navigate('/profile');
            return;
          }
          throw error;
        }

        setCompanyData(data);
        
        // Load stored analysis if available
        if (data.ai_analysis) {
          setAnalysis(data.ai_analysis);
        } else {
          setAnalysis(null);
        }
      } catch (error) {
        console.error('Error fetching company data:', error);
        toast({
          title: "Error",
          description: "Failed to load company data",
          variant: "destructive"
        });
        navigate('/profile');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [user, companyId, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p className="text-muted-foreground">Company not found. Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleEditProfile = () => {
    navigate(`/onboarding?mode=edit&id=${companyData.id}`);
  };

  const handleRefreshAnalysis = async () => {
    // Check if OpenAI key is available
    const openaiKey = localStorage.getItem('openai_api_key');
    if (!openaiKey) {
      setShowOpenAIDialog(true);
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { companyId: companyData.id },
      });

      if (error) {
        throw new Error('Failed to analyze company');
      }

      if (data?.success && data?.analysis) {
        setAnalysis(data.analysis);
        
        // Refresh company data to get updated ai_analysis field
        const { data: updatedData, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyData.id)
          .single();
        
        if (fetchError) {
          console.error('Error fetching updated company data:', fetchError);
        } else if (updatedData) {
          setCompanyData(updatedData);
        }
        
        toast({
          title: "Analysis Complete",
          description: "Company profile analysis has been refreshed and saved successfully.",
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed", 
        description: error instanceof Error ? error.message : "Failed to analyze profile",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
          </Button>
        </div>

        {/* Company Header */}
        <Card className="card-professional mb-8">
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 gradient-hero rounded-lg flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-foreground">{companyData.company_name}</CardTitle>
                  <p className="text-muted-foreground">Companies House: {companyData.companies_house_number}</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleEditProfile}>
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </Button>
                <Button 
                  className="btn-cta" 
                  onClick={handleRefreshAnalysis}
                  disabled={isAnalyzing}
                >
                  <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  {isAnalyzing ? 'Analyzing...' : analysis ? 'Re-analyze Company' : 'Analyze Company'}
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-3">
                <Globe className="w-5 h-5 text-muted-foreground" />
                <a href={companyData.website_url} className="text-primary hover:underline">
                  {companyData.website_url}
                </a>
              </div>
              
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">{companyData.contact_email}</span>
              </div>
              
              <div className="flex items-center space-x-3">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">{companyData.contact_phone}</span>
              </div>
              
              <div className="flex items-center space-x-3">
                <MapPin className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">{companyData.postcode}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="capabilities">Equipment</TabsTrigger>
            <TabsTrigger value="certifications">Certifications</TabsTrigger>
            <TabsTrigger value="projects">Past Projects</TabsTrigger>
            <TabsTrigger value="tenders">Tender Matches</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building2 className="w-5 h-5" />
                  <span>Company Overview</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">{companyData.description || "No description available"}</p>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="card-professional">
                <CardHeader>
                  <CardTitle className="text-lg">Core Competencies</CardTitle>
                </CardHeader>
                 <CardContent>
                   <div className="flex flex-wrap gap-2">
                     {(() => {
                       // Use AI-generated capabilities if available, otherwise fall back to manual
                       let capabilities: string[] = [];
                       
                       if (analysis?.ai_capabilities && Array.isArray(analysis.ai_capabilities)) {
                         capabilities = analysis.ai_capabilities.filter(cap => typeof cap === 'string') as string[];
                       } else if (companyData.ai_competencies && Array.isArray(companyData.ai_competencies)) {
                         capabilities = companyData.ai_competencies.filter(comp => typeof comp === 'string') as string[];
                       } else if (companyData.key_capabilities) {
                         capabilities = companyData.key_capabilities.split(', ');
                       } else {
                         capabilities = [];
                       }
                       
                       return capabilities.map((competency: string, index: number) => (
                         <Badge key={index} variant="secondary">{competency}</Badge>
                       ));
                     })()}
                   </div>
                   {analysis && (
                     <p className="text-xs text-muted-foreground mt-2">
                       <span className="text-green-600">✨</span> AI-powered capability analysis
                     </p>
                   )}
                 </CardContent>
              </Card>

              <Card className="card-professional">
                <CardHeader>
                  <CardTitle className="text-lg">Business Insights</CardTitle>
                </CardHeader>
                 <CardContent>
                   <div className="space-y-4">
                     {/* Business Metrics */}
                     <div className="grid md:grid-cols-2 gap-3">
                       <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                         <div>
                           <p className="text-sm font-medium">Digital Maturity</p>
                           <p className="text-xs text-muted-foreground">
                             {companyData.digital_maturity || 'Not assessed yet'}
                           </p>
                         </div>
                       </div>
                       <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                         <div>
                           <p className="text-sm font-medium">Market Position</p>
                           <p className="text-xs text-muted-foreground">
                             {companyData.market_position || 'Not assessed yet'}
                           </p>
                         </div>
                       </div>
                       <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                         <div>
                           <p className="text-sm font-medium">Safety Rating</p>
                           <p className="text-xs text-muted-foreground">
                             {companyData.safety_rating || 'Not assessed yet'}
                           </p>
                         </div>
                       </div>
                     </div>

                     <Separator />

                     {/* AI Analysis Section */}
                     {analysis && (
                       <div className="p-4 border border-border rounded-lg bg-card">
                         <div className="flex items-center justify-between mb-3">
                           <p className="text-sm font-semibold flex items-center gap-2">
                             <TrendingUp className="w-4 h-4 text-primary" />
                             Latest AI Analysis
                           </p>
                           <Badge variant="outline">Overall Score: {analysis.overallScore}/100</Badge>
                         </div>
                         <p className="text-xs text-muted-foreground leading-relaxed">{analysis.analysis}</p>
                         
                         {/* Performance Metrics */}
                         <div className="grid grid-cols-3 gap-2 mt-3">
                           <div className="text-center p-2 bg-secondary/30 rounded">
                             <div className="text-xs text-muted-foreground">Technical</div>
                             <div className="text-sm font-bold">{analysis.technicalExpertise}/100</div>
                           </div>
                           <div className="text-center p-2 bg-secondary/30 rounded">
                             <div className="text-xs text-muted-foreground">Innovation</div>
                             <div className="text-sm font-bold">{analysis.innovation}/100</div>
                           </div>
                           <div className="text-center p-2 bg-secondary/30 rounded">
                             <div className="text-xs text-muted-foreground">Experience</div>
                             <div className="text-sm font-bold">{analysis.projectExperience}/100</div>
                           </div>
                         </div>
                       </div>
                     )}
                     {!analysis && (
                       <div className="p-4 border border-dashed border-border rounded-lg bg-muted/50 text-center">
                         <p className="text-sm text-muted-foreground">No AI analysis available yet</p>
                         <p className="text-xs text-muted-foreground mt-1">Click "Analyze Company" to generate insights</p>
                       </div>
                     )}
                   </div>
                 </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* New Financial Tab */}
          <TabsContent value="financial" className="space-y-6">
            {companyData.financial_data && Object.keys(companyData.financial_data as any).length > 0 ? (
              <Card className="card-professional">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <DollarSign className="w-5 h-5" />
                    <span>Financial Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-6">
                    {Object.entries(companyData.financial_data as any).map(([key, field]: [string, any]) => (
                      <div key={key} className="p-6 bg-gradient-to-br from-secondary/30 to-secondary/10 rounded-lg border border-border">
                        <div className="text-sm font-medium text-muted-foreground capitalize mb-2">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-3xl font-bold text-foreground mb-2">
                          {field.value?.toLocaleString() || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {field.confidence >= 80 ? '🟢' : field.confidence >= 50 ? '🟡' : '⚪'}
                          Confidence: {field.confidence}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="card-professional">
                <CardContent className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Financial Data</h3>
                  <p className="text-muted-foreground">
                    Financial data was not extracted during onboarding. Add it manually or re-run the analysis.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="capabilities" className="space-y-6">
            {/* Equipment & Resources Section */}
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Wrench className="w-5 h-5" />
                  <span>Equipment & Resources</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {(companyData.equipment?.split(', ') || []).map((item: string, index: number) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-secondary-light rounded-lg">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span className="text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certifications" className="space-y-6">
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Award className="w-5 h-5" />
                  <span>Certifications & Accreditations</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {(() => {
                    let certifications: string[] = [];
                    
                    if (Array.isArray(companyData.ai_certifications)) {
                      certifications = companyData.ai_certifications.filter(cert => typeof cert === 'string') as string[];
                    } else if (companyData.certifications) {
                      certifications = companyData.certifications.split(', ');
                    }
                    
                    return certifications.map((cert: string, index: number) => (
                      <div key={index} className="flex items-center space-x-3 p-4 border border-border rounded-lg">
                        <Award className="w-6 h-6 text-primary" />
                        <div>
                          <div className="font-medium text-foreground">{cert}</div>
                          <div className="text-sm text-muted-foreground">Valid</div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="w-5 h-5" />
                  <span>Notable Past Projects</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {companyData.past_projects ? (
                    <Accordion type="single" collapsible className="w-full">
                      {companyData.past_projects.split(/\n\n+/).filter(item => item.trim()).map((project, index) => {
                        const trimmedProject = project.trim();
                        const lines = trimmedProject.split('\n');
                        const title = lines[0]; // First line is the title
                        const details = lines.slice(1).join('\n'); // Rest are details
                        return (
                          <AccordionItem key={index} value={`project-${index}`}>
                            <AccordionTrigger className="text-left">
                              <span className="font-medium">{title}</span>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{details}</div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No past projects recorded yet.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tenders" className="space-y-6">
            <TenderMatching companyId={companyData.id} />
          </TabsContent>
        </Tabs>
      </div>
      
      <OpenAIKeyDialog 
        isOpen={showOpenAIDialog}
        onClose={() => setShowOpenAIDialog(false)}
        onKeySet={() => {
          setShowOpenAIDialog(false);
          handleRefreshAnalysis();
        }}
      />
      
      <BusinessChatbot companyData={companyData} />
    </div>
  );
};

export default CompanyDetail;