"use client";

import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  BadgeCheck,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import type { Database } from "@/lib/supabase/types";
import { useState } from "react";
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
  distanceMiles?: number;
}

export function CompanyCardNew({
  company,
  onClick,
  taxonomies: propTaxonomies,
  distanceMiles,
}: CompanyCardNewProps) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const taxonomies = propTaxonomies || [];

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
      {/* Header: Name + Badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {company.company_name}
        </h3>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {"is_approved" in company && company.is_approved ? (
            <Badge className="gap-1 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
              <ShieldCheck className="h-3 w-3" />
              Approved
            </Badge>
          ) : company.user_id ? (
            <Badge className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
              <BadgeCheck className="h-3 w-3" />
              Verified
            </Badge>
          ) : company.is_system_company ? (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              <Sparkles className="h-3 w-3" />
              AI Generated
            </Badge>
          ) : null}
        </div>
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
        {distanceMiles != null && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-md font-medium">
            {distanceMiles < 1
              ? "< 1 mi"
              : `${distanceMiles.toFixed(1)} mi`}
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
