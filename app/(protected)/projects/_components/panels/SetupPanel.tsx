"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  MapPin,
  Building2,
  Banknote,
  ExternalLink,
  FileText,
} from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import type { Tender } from "@/hooks/useProjectDetails";
import { TenderViewDialog } from "@/components/tenders/TenderViewDialog";

interface SetupPanelProps {
  project: Project;
  tender: Tender | null;
}

export function SetupPanel({ project, tender }: SetupPanelProps) {
  const [tenderDialogOpen, setTenderDialogOpen] = useState(false);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Not specified";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "Not specified";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="py-4 space-y-4">
      {/* Project Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h4 className="text-sm font-medium text-muted-foreground mb-2">
          Project Details
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">Status</span>
            <p className="font-medium capitalize">{project.status}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Created</span>
            <p className="font-medium">{formatDate(project.created_at)}</p>
          </div>
        </div>
      </motion.div>

      {tender ? (
        <>
          <Separator />

          {/* Tender Summary */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Target Tender
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTenderDialogOpen(true)}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                View Details
              </Button>
            </div>

            <Card>
              <CardContent className="pt-4">
                <h3 className="font-semibold mb-3 line-clamp-2">
                  {tender.title}
                </h3>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">
                      {tender.buyer_name || tender.buyer || "Not specified"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(tender.deadline)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{tender.region || tender.location || "UK"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {tender.value
                        ? formatCurrency(tender.value)
                        : tender.budget_max
                          ? formatCurrency(tender.budget_max)
                          : "Not specified"}
                    </span>
                  </div>
                </div>

                {tender.description && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {tender.description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      ) : (
        <>
          <Separator />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center py-6"
          >
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No tender linked to this project</p>
            <p className="text-sm text-muted-foreground mt-1">
              You can still use gap analysis and team building features
            </p>
          </motion.div>
        </>
      )}

      {tender && (
        <TenderViewDialog
          tender={{
            id: tender.id,
            title: tender.title,
            description: tender.description,
            buyer: tender.buyer_name || tender.buyer || "",
            location: tender.location || tender.region,
            deadline: tender.deadline,
            budget_min: tender.budget_min,
            budget_max: tender.budget_max || tender.value,
            reference_number: tender.reference_number,
          }}
          open={tenderDialogOpen}
          onOpenChange={setTenderDialogOpen}
        />
      )}
    </div>
  );
}
