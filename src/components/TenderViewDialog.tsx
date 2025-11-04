import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Calendar, 
  MapPin, 
  Building2, 
  PoundSterling, 
  ExternalLink,
  Mail,
  Phone,
  Tag
} from "lucide-react";

interface TenderViewDialogProps {
  tender: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TenderViewDialog: React.FC<TenderViewDialogProps> = ({
  tender,
  open,
  onOpenChange,
}) => {
  if (!tender) return null;

  const formatBudget = (min?: number | null, max?: number | null): string => {
    if (!min && !max) return 'Budget not specified';
    if (min && max && min !== max) {
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    }
    if (min) return `£${min.toLocaleString()}`;
    if (max) return `£${max.toLocaleString()}`;
    return 'Budget not specified';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const isDeadlineSoon = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  const externalUrl = tender.external_id 
    ? `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`
    : tender.reference_number 
    ? `https://www.find-tender.service.gov.uk/Notice/${tender.reference_number}?origin=SearchResults`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-2xl font-bold flex-1">
              {tender.title}
            </DialogTitle>
            <div className="flex gap-2 flex-wrap">
              {tender.deadline && isDeadlineSoon(tender.deadline) && (
                <Badge variant="destructive">Deadline Soon</Badge>
              )}
              <Badge variant="secondary">{tender.status}</Badge>
            </div>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            <strong>Reference:</strong> {tender.reference_number || tender.id}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Buyer Information */}
            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Buyer Information
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p><strong>Organization:</strong> {tender.buyer}</p>
                {tender.contact_info && (
                  <>
                    {tender.contact_info.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <a 
                          href={`mailto:${tender.contact_info.email}`}
                          className="text-primary hover:underline"
                        >
                          {tender.contact_info.email}
                        </a>
                      </p>
                    )}
                    {tender.contact_info.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {tender.contact_info.phone}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h3 className="font-semibold text-lg mb-2">Description</h3>
              <p className="text-sm whitespace-pre-wrap">{tender.description}</p>
            </div>

            <Separator />

            {/* Key Details */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Key Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <strong className="text-sm">Location</strong>
                  </div>
                  <p className="text-sm">{tender.location}</p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <PoundSterling className="w-4 h-4 text-muted-foreground" />
                    <strong className="text-sm">Budget</strong>
                  </div>
                  <p className="text-sm">{formatBudget(tender.budget_min, tender.budget_max)}</p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <strong className="text-sm">Published</strong>
                  </div>
                  <p className="text-sm">{formatDate(tender.publication_date)}</p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <strong className="text-sm">Deadline</strong>
                  </div>
                  <p className="text-sm">
                    {tender.deadline ? formatDate(tender.deadline) : 'Not specified'}
                  </p>
                </div>
              </div>
            </div>

            {/* CPV Codes */}
            {tender.cpv_codes && tender.cpv_codes.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    CPV Codes
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {tender.cpv_codes.map((code: string, index: number) => (
                      <Badge key={index} variant="outline">
                        {code}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Source Information */}
            {tender.source && (
              <>
                <Separator />
                <div className="text-xs text-muted-foreground">
                  <strong>Source:</strong> {tender.source === 'find_tender' ? 'Find a Tender API' : tender.source}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {externalUrl && (
            <Button asChild>
              <a 
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Go to Original Website
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
