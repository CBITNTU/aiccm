import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Building2, MapPin, Globe, Phone, Mail, Award } from "lucide-react";
import { toast } from "sonner";
import { CompanyCard } from "@/components/CompanyCard";
import { CompanyDetailModal } from "@/components/CompanyDetailModal";

type Company = Database['public']['Tables']['companies']['Row'];
type PublicCompany = Pick<Company, 
  | 'id' 
  | 'company_name' 
  | 'description' 
  | 'key_capabilities' 
  | 'postcode' 
  | 'certifications' 
  | 'equipment' 
  | 'past_projects' 
  | 'is_system_company' 
  | 'status' 
  | 'market_position' 
  | 'safety_rating' 
  | 'digital_maturity' 
  | 'ai_competencies' 
  | 'ai_capabilities' 
  | 'ai_analysis' 
  | 'created_at' 
  | 'updated_at' 
  | 'user_id'
>;

export default function Companies() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedCapability, setSelectedCapability] = useState<string>("all");
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        // Only select non-sensitive fields for public company directory
        // Sensitive contact info (email, phone, website_url) excluded for security
        const { data, error } = await supabase
          .from('companies')
          .select(`
            id,
            company_name,
            description,
            key_capabilities,
            postcode,
            certifications,
            equipment,
            past_projects,
            is_system_company,
            status,
            market_position,
            safety_rating,
            digital_maturity,
            ai_competencies,
            ai_capabilities,
            ai_analysis,
            created_at,
            updated_at,
            user_id
          `)
          .eq('status', 'active')
          .order('company_name');

        if (error) {
          throw error;
        }
        
        setCompanies(data || []);
      } catch (error) {
        console.error('Error fetching companies:', error);
        toast.error('Failed to load companies');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [user]);

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (company.description && company.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesLocation = selectedLocation === "all" || 
                           (company.postcode && company.postcode.toLowerCase().includes(selectedLocation.toLowerCase()));
    
    const matchesCapability = selectedCapability === "all" ||
                             (company.key_capabilities && company.key_capabilities.toLowerCase().includes(selectedCapability.toLowerCase()));

    return matchesSearch && matchesLocation && matchesCapability;
  });

  const uniqueLocations = [...new Set(companies.map(c => c.postcode).filter(Boolean))];
  const uniqueCapabilities = [...new Set(companies.flatMap(c => 
    c.key_capabilities ? c.key_capabilities.split(',').map(cap => cap.trim()) : []
  ))];

  const handleCompanyClick = (company: PublicCompany) => {
    setSelectedCompany(company);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
        <Header variant="app" />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading companies...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <Header variant="app" />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Companies Directory</h1>
          <p className="text-muted-foreground">
            Discover construction companies and their capabilities
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem key={location} value={location || "unknown"}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedCapability} onValueChange={setSelectedCapability}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by capability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All capabilities</SelectItem>
                  {uniqueCapabilities.map((capability) => (
                    <SelectItem key={capability} value={capability}>
                      {capability}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="mb-6">
          <p className="text-muted-foreground">
            Showing {filteredCompanies.length} of {companies.length} companies
          </p>
        </div>

        {/* Companies Grid */}
        {filteredCompanies.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No companies found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filter criteria
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredCompanies.map((company) => (
              <CompanyCard 
                key={company.id} 
                company={company} 
                onClick={handleCompanyClick}
              />
            ))}
          </div>
        )}

        <CompanyDetailModal 
          company={selectedCompany}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
        />
      </main>
    </div>
  );
}