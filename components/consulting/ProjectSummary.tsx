"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  MapPin,
  Calendar,
  Banknote,
  Building2,
} from "lucide-react";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import { useTranslations } from "next-intl";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";

interface ProjectSummaryProps {
  tender: {
    id: string;
    title: string;
    buyer: string;
    location?: string;
    deadline?: string;
    budgetMin?: number;
    budgetMax?: number;
    currency?: string | null;
    externalId?: string;
    referenceNumber?: string;
    status?: string | null;
  };
  ownerCompany: {
    companyName: string;
  } | null;
  onCardClick?: () => void;
}

export function ProjectSummary({
  tender,
  ownerCompany,
  onCardClick,
}: ProjectSummaryProps) {
  const t = useTranslations("ProjectSummary");
  const { currency } = useDeployment();
  const tenderCurrency = resolveCurrencyConfig(tender.currency, currency);
  // Generate external URL using the same pattern as TenderViewDialog
  const externalUrl = tender.externalId
    ? `https://www.find-tender.service.gov.uk/Notice/${tender.externalId}?origin=SearchResults&p=1`
    : tender.referenceNumber
      ? `https://www.find-tender.service.gov.uk/Notice/${tender.referenceNumber}?origin=SearchResults`
      : `https://www.contractsfinder.service.gov.uk/notice/${tender.id}`;

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onCardClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{tender.title}</CardTitle>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {tender.buyer}
              </div>
              {tender.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {tender.location}
                </div>
              )}
            </div>
          </div>
          <TenderStatusBadge status={tender.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {tender.deadline && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">{t("deadlineLabel")}</div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="font-medium">
                  {new Date(tender.deadline).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
          {tender.budgetMin && tender.budgetMax && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                {t("budgetLabel")}
              </div>
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                <span className="font-medium">
                  {formatCurrency(tender.budgetMin, tenderCurrency)} -{" "}
                  {formatCurrency(tender.budgetMax, tenderCurrency)}
                </span>
              </div>
            </div>
          )}
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              {t("leadCompanyLabel")}
            </div>
            <div className="font-medium">{ownerCompany?.companyName}</div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          asChild
          onClick={(e) => e.stopPropagation()}
        >
          <a href={externalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("viewTenderButton")}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
