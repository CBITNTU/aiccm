"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  MapPin,
  Calendar,
  PoundSterling,
  Building2,
} from "lucide-react";

interface ProjectSummaryProps {
  tender: {
    id: string;
    title: string;
    buyer: string;
    location?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    external_id?: string;
    reference_number?: string;
  };
  ownerCompany: {
    company_name: string;
  } | null;
  onCardClick?: () => void;
}

export function ProjectSummary({
  tender,
  ownerCompany,
  onCardClick,
}: ProjectSummaryProps) {
  // Generate external URL using the same pattern as TenderViewDialog
  const externalUrl = tender.external_id
    ? `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`
    : tender.reference_number
      ? `https://www.find-tender.service.gov.uk/Notice/${tender.reference_number}?origin=SearchResults`
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
          <Badge variant="outline" className="text-base">
            Draft
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {tender.deadline && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Deadline</div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="font-medium">
                  {new Date(tender.deadline).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
          {tender.budget_min && tender.budget_max && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                Budget Range
              </div>
              <div className="flex items-center gap-2">
                <PoundSterling className="h-4 w-4" />
                <span className="font-medium">
                  £{tender.budget_min.toLocaleString()} - £
                  {tender.budget_max.toLocaleString()}
                </span>
              </div>
            </div>
          )}
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              Lead Company
            </div>
            <div className="font-medium">{ownerCompany?.company_name}</div>
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
            View Tender Details
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
