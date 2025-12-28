"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  MapPin,
  Building2,
  PoundSterling,
  ExternalLink,
  Tag as TagIcon,
} from "lucide-react";
import { formatCpvCode } from "@/lib/cpvCodes";

interface Tender {
  id: string;
  title: string;
  description?: string | null;
  buyer: string;
  location?: string | null;
  status?: string | null;
  publication_date?: string | null;
  deadline?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  reference_number?: string | null;
  cpv_codes?: string[] | null;
}

interface TenderViewDialogProps {
  tender: Tender | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenderViewDialog({
  tender,
  open,
  onOpenChange,
}: TenderViewDialogProps) {
  if (!tender) return null;

  const formatBudget = (min?: number | null, max?: number | null) => {
    if (!min && !max) return "Budget not disclosed";
    if (min && max) return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    if (min) return `From £${min.toLocaleString()}`;
    if (max) return `Up to £${max.toLocaleString()}`;
    return "Budget not disclosed";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl">{tender.title}</DialogTitle>
              <DialogDescription className="mt-2">
                {tender.reference_number && (
                  <span className="text-sm">Ref: {tender.reference_number}</span>
                )}
              </DialogDescription>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {tender.deadline && isDeadlineSoon(tender.deadline) && (
                <Badge variant="destructive">Deadline Soon</Badge>
              )}
              <Badge variant="secondary">{tender.status}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Key Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Buyer</p>
                <p className="font-medium">{tender.buyer}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">
                  {tender.location || "Not specified"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Published</p>
                <p className="font-medium">
                  {tender.publication_date
                    ? formatDate(tender.publication_date)
                    : "Not specified"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Deadline</p>
                <p className="font-medium">
                  {tender.deadline
                    ? formatDate(tender.deadline)
                    : "Not specified"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <PoundSterling className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="font-medium">
                  {formatBudget(tender.budget_min, tender.budget_max)}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h4 className="font-semibold mb-2">Description</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {tender.description}
            </p>
          </div>

          {/* CPV Codes */}
          {tender.cpv_codes && tender.cpv_codes.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TagIcon className="w-4 h-4" />
                  CPV Codes
                </h4>
                <div className="flex flex-wrap gap-2">
                  {tender.cpv_codes.map((code) => {
                    const cpv = formatCpvCode(code);
                    return (
                      <Badge key={code} variant="outline">
                        {cpv.code} - {cpv.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <Separator />
          <div className="flex justify-end gap-2">
            {tender.reference_number && (
              <Button asChild>
                <a
                  href={`https://www.find-tender.service.gov.uk/Notice/${tender.reference_number}?origin=SearchResults`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on Find a Tender
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
