import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Company = Database['public']['Tables']['companies']['Row'];

interface CompanySelectorProps {
  selectedCompanyId?: string | null;
  onCompanySelect?: (company: Company | null) => void;
  showAddButton?: boolean;
  className?: string;
}

export function CompanySelector({ 
  selectedCompanyId, 
  onCompanySelect, 
  showAddButton = true, 
  className = "" 
}: CompanySelectorProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }

        setCompanies(data || []);
        
        // Auto-select company if only one exists or if selectedCompanyId is provided
        if (data && data.length > 0) {
          const companyToSelect = selectedCompanyId 
            ? data.find(c => c.id === selectedCompanyId) || data[0]
            : data[0];
          
          setSelectedCompany(companyToSelect);
          onCompanySelect?.(companyToSelect);
        }
      } catch (error) {
        console.error('Error fetching companies:', error);
        // Set empty array to prevent further attempts
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [user]); // Minimal dependencies

  const handleCompanyChange = (companyId: string) => {
    const company = companies.find(c => c.id === companyId) || null;
    setSelectedCompany(company);
    onCompanySelect?.(company);
  };

  const handleAddCompany = () => {
    navigate('/onboarding?mode=create');
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-10 bg-muted rounded-md"></div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            No Companies Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            You haven't created any companies yet. Create your first company to get started.
          </p>
          <Button onClick={handleAddCompany} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Company
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <Select 
        value={selectedCompany?.id || ""} 
        onValueChange={handleCompanyChange}
      >
        <SelectTrigger className="min-w-[200px]">
          <SelectValue placeholder="Select a company">
            {selectedCompany ? (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                {selectedCompany.company_name}
              </div>
            ) : (
              "Select a company"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <div>
                  <div className="font-medium">{company.company_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {company.status}
                  </div>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {showAddButton && (
        <Button variant="outline" onClick={handleAddCompany}>
          <Plus className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}