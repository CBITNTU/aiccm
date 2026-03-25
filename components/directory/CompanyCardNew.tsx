"use client";

import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { VerifiedBadge } from "@/components/company/VerifiedBadge";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
type PublicCompany = Pick<
  Company,
  | "id"
  | "companyName"
  | "description"
  | "keyCapabilities"
  | "postcode"
  | "certifications"
  | "pastProjects"
  | "isSystemCompany"
  | "status"
  | "digitalMaturity"
  | "aiCompetencies"
  | "aiCapabilities"
  | "aiAnalysis"
  | "createdAt"
  | "updatedAt"
  | "userId"
  | "verificationStatus"
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
    const aiAnalysis = company.aiAnalysis as {
      coreCompetencies?: string[];
    } | null;

    if (
      aiAnalysis?.coreCompetencies &&
      Array.isArray(aiAnalysis.coreCompetencies)
    ) {
      return aiAnalysis.coreCompetencies;
    }
    if (company.aiCompetencies && Array.isArray(company.aiCompetencies)) {
      return company.aiCompetencies as string[];
    }
    if (company.aiCapabilities && Array.isArray(company.aiCapabilities)) {
      return company.aiCapabilities as string[];
    }
    if (company.keyCapabilities) {
      return company.keyCapabilities.split(",").map((cap) => cap.trim());
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
          {company.companyName}
        </h3>
        {company.verificationStatus === "verified" ? (
          <VerifiedBadge />
        ) : company.isSystemCompany && !company.userId ? (
          <Badge className="shrink-0 gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
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
