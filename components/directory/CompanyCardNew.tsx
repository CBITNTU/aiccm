"use client";

import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  BadgeCheck,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import type { Database } from "@/lib/supabase/types";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type PublicCompany = Pick<
  Company,
  | "id"
  | "company_name"
  | "description"
  | "key_capabilities"
  | "postcode"
  | "certifications"
  | "equipment"
  | "past_projects"
  | "is_system_company"
  | "status"
  | "market_position"
  | "safety_rating"
  | "digital_maturity"
  | "ai_competencies"
  | "ai_capabilities"
  | "ai_analysis"
  | "created_at"
  | "updated_at"
  | "user_id"
>;

interface CompanyCardNewProps {
  company: PublicCompany | Company;
  onClick: (company: PublicCompany | Company) => void;
  taxonomies?: Array<{ id: string; name: string }>;
}

export function CompanyCardNew({
  company,
  onClick,
  taxonomies: propTaxonomies,
}: CompanyCardNewProps) {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );
  const [taxonomies, setTaxonomies] = useState<
    Array<{ id: string; name: string }>
  >(propTaxonomies || []);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Initialize supabase client
  useEffect(() => {
    const client = createClient();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- init client once on mount
    setSupabase(client);
  }, []);

  // Fetch taxonomies if not provided as props
  useEffect(() => {
    if (propTaxonomies || !supabase) return;

    const fetchTaxonomies = async () => {
      const { data } = await supabase
        .from("company_taxonomies")
        .select("taxonomy_id, taxonomies(id, name)")
        .eq("company_id", company.id);

      if (data) {
        setTaxonomies(
          data
            .map((ct) => ({
              id:
                (ct.taxonomies as { id: string; name: string } | null)?.id ||
                "",
              name:
                (ct.taxonomies as { id: string; name: string } | null)?.name ||
                "",
            }))
            .filter((t) => t.name),
        );
      }
    };
    fetchTaxonomies();
  }, [supabase, company.id, propTaxonomies]);

  // Get capabilities from AI analysis or manual input
  const getCapabilities = (): string[] => {
    const aiAnalysis = company.ai_analysis as {
      coreCompetencies?: string[];
    } | null;

    if (
      aiAnalysis?.coreCompetencies &&
      Array.isArray(aiAnalysis.coreCompetencies)
    ) {
      return aiAnalysis.coreCompetencies;
    }
    if (company.ai_competencies && Array.isArray(company.ai_competencies)) {
      return company.ai_competencies as string[];
    }
    if (company.ai_capabilities && Array.isArray(company.ai_capabilities)) {
      return company.ai_capabilities as string[];
    }
    if (company.key_capabilities) {
      return company.key_capabilities.split(",").map((cap) => cap.trim());
    }
    return [];
  };

  const capabilities = getCapabilities();
  const displayedCategories = showAllCategories
    ? taxonomies
    : taxonomies.slice(0, 3);

  return (
    <div
      className="group border rounded-lg p-5 hover:shadow-md transition-all cursor-pointer bg-card"
      onClick={() => onClick(company)}
    >
      {/* Header: Name + Verified badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {company.company_name}
        </h3>
        {company.user_id ? (
          <Badge className="shrink-0 gap-1 border-0 bg-green-600 text-white dark:bg-green-600 dark:text-white">
            <BadgeCheck className="h-3 w-3" />
            Verified
          </Badge>
        ) : company.is_system_company ? (
          <Badge className="shrink-0 gap-1 border-0 bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white">
            <Sparkles className="h-3 w-3" />
            AI Generated
          </Badge>
        ) : null}
      </div>

      {/* Description - truncated */}
      {company.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {company.description}
        </p>
      )}

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs mb-4">
        {company.postcode && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted rounded-md">
            <MapPin className="h-3 w-3" />
            {company.postcode}
          </span>
        )}
      </div>

      {/* Capabilities - compact */}
      {capabilities.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5">
            {capabilities.slice(0, 4).map((capability, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs font-normal"
              >
                {capability}
              </Badge>
            ))}
            {capabilities.length > 4 && (
              <Badge variant="outline" className="text-xs font-normal">
                +{capabilities.length - 4} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Categories - collapsible */}
      {taxonomies.length > 0 && (
        <div className="pt-3 border-t">
          <div
            className="flex items-center justify-between mb-2"
            onClick={(e) => {
              e.stopPropagation();
              if (taxonomies.length > 3) {
                setShowAllCategories(!showAllCategories);
              }
            }}
          >
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3 w-3" />
              Categories
            </span>
            {taxonomies.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllCategories(!showAllCategories);
                }}
              >
                {showAllCategories ? (
                  <>
                    Show less
                    <ChevronUp className="h-3 w-3 ml-1" />
                  </>
                ) : (
                  <>
                    +{taxonomies.length - 3} more
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {displayedCategories.map((taxonomy) => (
              <Badge
                key={taxonomy.id}
                variant="secondary"
                className="text-xs font-normal"
              >
                {taxonomy.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
