import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, FileText, Bookmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import DatabaseTenderFeed from "@/components/DatabaseTenderFeed";
import { TenderMatching } from "@/components/TenderMatching";
import { SavedTenders } from "@/components/SavedTenders";
import { TenderFilters } from "@/components/TenderFilters";
import { CompanySelector } from "@/components/CompanySelector";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Company = Database['public']['Tables']['companies']['Row'];

const Tenders = () => {
  const { user, session } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();
  const [filters, setFilters] = useState<any>({});
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Check and refresh session when component mounts
  useEffect(() => {
    const checkSession = async () => {
      if (!session) return;
      
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = session.expires_at;
      
      // If session expires within 10 minutes, refresh it proactively
      if (expiresAt && expiresAt - now < 600) {
        console.log('Session expiring soon, refreshing preemptively...');
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('Failed to refresh session:', error);
          toast({
            title: "Session Warning",
            description: "Your session may expire soon. If you encounter authentication errors, please refresh the page.",
            variant: "destructive"
          });
        }
      }
    };

    checkSession();
  }, [session, toast]);

  // Fetch user companies and auto-select the first one
  useEffect(() => {
    const fetchCompanies = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCompanies(data || []);
        
        // Auto-select the first company if none is selected
        if (data && data.length > 0 && !selectedCompany) {
          setSelectedCompany(data[0]);
        }
      } catch (error) {
        console.error('Error fetching companies:', error);
      }
    };

    fetchCompanies();
  }, [user]);

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const handleCompanySelect = useCallback((company: Company | null) => {
    setSelectedCompany(company);
  }, []);

  const resetFilters = () => {
    setFilters({});
  };

  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tender Opportunities</h1>
          <p className="text-muted-foreground">
            Discover and track government and private sector tenders that match your capabilities
          </p>
        </div>

        <Tabs defaultValue="tenders" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tenders" className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>All Tenders</span>
            </TabsTrigger>
            <TabsTrigger value="matches" className="flex items-center space-x-2">
              <Building2 className="w-4 h-4" />
              <span>Your Matches</span>
            </TabsTrigger>
            <TabsTrigger value="saved" className="flex items-center space-x-2">
              <Bookmark className="w-4 h-4" />
              <span>Saved Tenders</span>
            </TabsTrigger>
          </TabsList>

          {/* All Tenders Tab */}
          <TabsContent value="tenders" className="space-y-6">
            <div className="bg-primary/5 border-l-4 border-primary p-4 rounded-lg mb-6">
              <h3 className="font-semibold text-foreground mb-2">Database Tender Opportunities</h3>
              <p className="text-sm text-muted-foreground">
                Browse all tender opportunities from our comprehensive database. Use filters to find relevant opportunities that match your business capabilities.
              </p>
            </div>
            
            {/* Filters */}
            <TenderFilters 
              onFiltersChange={handleFiltersChange}
              filters={filters}
              onReset={resetFilters}
            />
            
            {/* Database Tenders */}
            <DatabaseTenderFeed filters={filters} />
          </TabsContent>

          {/* Your Matches Tab */}
          <TabsContent value="matches" className="space-y-6">
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg mb-6 dark:bg-green-950/20">
              <h3 className="font-semibold text-foreground mb-2">AI-Powered Tender Matching</h3>
              <p className="text-sm text-muted-foreground">
                Based on your company profile, we analyze tender opportunities and provide match scores with detailed recommendations.
              </p>
            </div>

            {/* Company Selector - show for all users, with better messaging */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Filter by Company
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CompanySelector 
                  selectedCompanyId={selectedCompany?.id} 
                  onCompanySelect={handleCompanySelect} 
                  showAddButton={false}
                />
                <div className="mt-2 h-5">
                  {selectedCompany ? (
                    <p className="text-sm text-muted-foreground">
                      Filtering for: <span className="font-medium text-primary">{selectedCompany.company_name}</span>
                    </p>
                  ) : companies.length > 1 ? (
                    <p className="text-sm text-muted-foreground">
                      Showing all companies
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <div className="min-h-[600px] transition-all duration-200">
              <TenderMatching companyId={selectedCompany?.id} />
            </div>
          </TabsContent>

          {/* Saved Tenders Tab */}
          <TabsContent value="saved" className="space-y-6">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-6 dark:bg-blue-950/20">
              <h3 className="font-semibold text-foreground mb-2">Your Saved Tenders</h3>
              <p className="text-sm text-muted-foreground">
                Review all the tenders you've bookmarked for future reference.
              </p>
            </div>

            <div className="min-h-[600px] transition-all duration-200">
              <SavedTenders />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Tenders;