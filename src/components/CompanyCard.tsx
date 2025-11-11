import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Globe, Phone, Mail, Award, Tag } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

interface CompanyCardProps {
  company: PublicCompany | Company;
  onClick: (company: PublicCompany | Company) => void;
}

export function CompanyCard({ company, onClick }: CompanyCardProps) {
  const [taxonomies, setTaxonomies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const fetchTaxonomies = async () => {
      const { data } = await supabase
        .from('company_taxonomies')
        .select('taxonomy_id, taxonomies(id, name)')
        .eq('company_id', company.id);
      
      if (data) {
        setTaxonomies(data.map(ct => ({
          id: (ct.taxonomies as any)?.id || '',
          name: (ct.taxonomies as any)?.name || ''
        })).filter(t => t.name));
      }
    };
    fetchTaxonomies();
  }, [company.id]);
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Type guard to check if company has all fields (is full Company type)
  const isFullCompany = (comp: PublicCompany | Company): comp is Company => {
    return 'contact_email' in comp;
  };

  return (
    <Card 
      className="hover:shadow-lg transition-shadow cursor-pointer" 
      onClick={() => onClick(company)}
    >
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <CardTitle className="text-lg">{company.company_name}</CardTitle>
          {company.is_system_company && (
            <Badge variant="secondary">Verified</Badge>
          )}
        </div>
        {company.description && (
          <CardDescription className="line-clamp-2">
            {company.description}
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact Information Section */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Contact Details</h4>
            {company.postcode && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-primary" />
                <span>{company.postcode}</span>
              </div>
            )}
            {/* Contact information - show generic message for public companies */}
            {isFullCompany(company) ? (
              <>
                {company.contact_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-primary truncate">
                      {truncateText(company.contact_email, 20)}
                    </span>
                  </div>
                )}
                {company.contact_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-primary" />
                    <span className="text-primary">
                      {company.contact_phone}
                    </span>
                  </div>
                )}
                {company.website_url && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-primary truncate">
                      Website Available
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>Contact details available</span>
              </div>
            )}
          </div>

          {/* Capabilities Section */}
          <div className="space-y-2">
            {(() => {
              // Use AI-generated capabilities if available, otherwise fall back to manual
              let capabilities = [];
              let hasAIAnalysis = false;
              
              const aiAnalysis = company.ai_analysis as any;
              if (aiAnalysis?.coreCompetencies && Array.isArray(aiAnalysis.coreCompetencies)) {
                capabilities = aiAnalysis.coreCompetencies;
                hasAIAnalysis = true;
              } else if (company.ai_competencies && Array.isArray(company.ai_competencies)) {
                capabilities = company.ai_competencies;
                hasAIAnalysis = true;
              } else if (company.ai_capabilities && Array.isArray(company.ai_capabilities)) {
                capabilities = company.ai_capabilities;
                hasAIAnalysis = true;
              } else if (company.key_capabilities) {
                capabilities = company.key_capabilities.split(',').map(cap => cap.trim());
              }
              
              if (capabilities.length > 0) {
                return (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      Key Capabilities
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.slice(0, 6).map((capability, index) => (
                        <Badge key={index} variant="outline" className="text-xs rounded-sm px-2 py-1">
                          {typeof capability === 'string' ? capability : capability}
                        </Badge>
                      ))}
                      {capabilities.length > 6 && (
                        <Badge variant="outline" className="text-xs rounded-sm px-2 py-1">
                          +{capabilities.length - 6} more
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Taxonomies Section */}
        {taxonomies.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Categories
            </h4>
            <div className="flex flex-wrap gap-1">
              {taxonomies.slice(0, 3).map((taxonomy) => (
                <Badge key={taxonomy.id} variant="secondary" className="text-xs">
                  {taxonomy.name}
                </Badge>
              ))}
              {taxonomies.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{taxonomies.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
        
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Click to view full details
          </p>
        </div>
      </CardContent>
    </Card>
  );
}