"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Award } from "lucide-react";
import { VerifiedBadge } from "@/components/company/VerifiedBadge";
import { useTranslations } from "next-intl";

interface Partner {
  id: string;
  companyName: string;
  keyCapabilities: string;
  certifications: string;
  location: string;
  relevanceScore: number;
  verificationStatus?: string;
  matchingCompetencies: string[];
}

interface RecommendedPartnersProps {
  partners: Partner[];
  onAddPartner: (partnerId: string) => void;
}

export function RecommendedPartners({
  partners,
  onAddPartner,
}: RecommendedPartnersProps) {
  const t = useTranslations("RecommendedPartners");
  if (!partners || partners.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            {t("noRecommendations")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titleWithCount", { count: partners.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold flex items-center gap-1.5">
                    {partner.companyName}
                    {partner.verificationStatus === "verified" && (
                      <VerifiedBadge compact />
                    )}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {partner.location}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {t("matchBadge", { score: partner.relevanceScore })}
                  </Badge>
                  <Button size="sm" onClick={() => onAddPartner(partner.id)}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("addButton")}
                  </Button>
                </div>
              </div>

              {partner.matchingCompetencies &&
                partner.matchingCompetencies.length > 0 && (
                  <div className="mb-2">
                    <div className="text-sm font-medium mb-1">
                      {t("matchingCompetencies")}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {partner.matchingCompetencies.map((comp, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {comp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {partner.certifications && (
                <div className="text-sm text-muted-foreground flex items-start gap-2">
                  <Award className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{partner.certifications}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
