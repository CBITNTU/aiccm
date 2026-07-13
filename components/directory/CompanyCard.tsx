"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Mail, Award, Tag } from "lucide-react";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useTranslations, useLocale } from "next-intl";
import { translateTaxonomyName } from "@/lib/taxonomyTranslations";
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
>;

interface CompanyCardProps {
  company: PublicCompany | Company;
  onClick: (company: PublicCompany | Company) => void;
}

export function CompanyCard({ company, onClick }: CompanyCardProps) {
  const t = useTranslations("Directory");
  const locale = useLocale();
  const [taxonomies, setTaxonomies] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    const fetchTaxonomies = async () => {
      try {
        const result = await api.getCompanyTaxonomies(company.id);
        setTaxonomies(result.taxonomies || []);
      } catch {
        // Silently fail - taxonomies are optional display data
      }
    };
    fetchTaxonomies();
  }, [company.id]);

  // Type guard to check if company has all fields (is full Company type)
  const isFullCompany = (comp: PublicCompany | Company): comp is Company => {
    return "contactEmail" in comp;
  };

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onClick(company)}
    >
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <CardTitle className="text-lg">{company.companyName}</CardTitle>
          {company.isSystemCompany && (
            <Badge variant="secondary">{t("companyCard.verified")}</Badge>
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
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">
              {t("companyCard.contactDetails")}
            </h4>
            {company.postcode && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-primary" />
                <span>{company.postcode}</span>
              </div>
            )}
            {/* Contact information - show generic message for public companies */}
            {isFullCompany(company) ? (
              <>
                {company.contactEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-primary truncate">
                      {company.contactEmail.length > 20
                        ? company.contactEmail.substring(0, 20) + "..."
                        : company.contactEmail}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{t("companyCard.contactAvailable")}</span>
              </div>
            )}
          </div>

          {/* Capabilities Section */}
          <div className="space-y-2">
            {(() => {
              // Use AI-generated capabilities if available, otherwise fall back to manual
              let capabilities: string[] = [];

              const aiAnalysis = company.aiAnalysis as {
                coreCompetencies?: string[];
              } | null;
              if (
                aiAnalysis?.coreCompetencies &&
                Array.isArray(aiAnalysis.coreCompetencies)
              ) {
                capabilities = aiAnalysis.coreCompetencies;
              } else if (
                company.aiCompetencies &&
                Array.isArray(company.aiCompetencies)
              ) {
                capabilities = company.aiCompetencies as string[];
              } else if (
                company.aiCapabilities &&
                Array.isArray(company.aiCapabilities)
              ) {
                capabilities = company.aiCapabilities as string[];
              } else if (company.keyCapabilities) {
                capabilities = company.keyCapabilities
                  .split(",")
                  .map((cap) => cap.trim());
              }

              if (capabilities.length > 0) {
                return (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      {t("companyCard.keyCapabilities")}
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.slice(0, 6).map((capability, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs rounded-sm px-2 py-1"
                        >
                          {typeof capability === "string"
                            ? capability
                            : capability}
                        </Badge>
                      ))}
                      {capabilities.length > 6 && (
                        <Badge
                          variant="outline"
                          className="text-xs rounded-sm px-2 py-1"
                        >
                          +{capabilities.length - 6} {t("companyCard.more")}
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
              {t("companyCard.categories")}
            </h4>
            <div className="flex flex-wrap gap-1">
              {taxonomies.slice(0, 3).map((taxonomy) => (
                <Badge
                  key={taxonomy.id}
                  variant="secondary"
                  className="text-xs"
                >
                  {translateTaxonomyName(taxonomy.name, locale)}
                </Badge>
              ))}
              {taxonomies.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{taxonomies.length - 3} {t("companyCard.more")}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            {t("companyCard.viewFullDetails")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
