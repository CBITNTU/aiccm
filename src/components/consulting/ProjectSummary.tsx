import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, MapPin, Calendar, PoundSterling, Building2 } from "lucide-react";

interface ProjectSummaryProps {
  tender: any;
  ownerCompany: any;
}

export function ProjectSummary({ tender, ownerCompany }: ProjectSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{tender.title}</CardTitle>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {tender.buyer}
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {tender.location}
              </div>
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
              <div className="text-sm text-muted-foreground mb-1">Budget Range</div>
              <div className="flex items-center gap-2">
                <PoundSterling className="h-4 w-4" />
                <span className="font-medium">
                  £{tender.budget_min.toLocaleString()} - £{tender.budget_max.toLocaleString()}
                </span>
              </div>
            </div>
          )}
          <div>
            <div className="text-sm text-muted-foreground mb-1">Lead Company</div>
            <div className="font-medium">{ownerCompany?.company_name}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`https://www.contractsfinder.service.gov.uk/notice/${tender.id}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Tender Details
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
