"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useUpdateProjectTender } from "@/hooks/useProjectMutations";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Calendar,
  MapPin,
  Building2,
  Banknote,
  ExternalLink,
  FileText,
  Link2,
  RefreshCw,
  Unlink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/hooks/useProjects";
import type { Tender } from "@/hooks/useProjectDetails";
import { TenderViewDialog } from "@/components/tenders/TenderViewDialog";
import { TenderSearchDialog } from "@/components/consulting/TenderSearchDialog";

interface SetupPanelProps {
  project: Project;
  tender: Tender | null;
}

export function SetupPanel({ project, tender }: SetupPanelProps) {
  const [tenderDialogOpen, setTenderDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

  const updateTender = useUpdateProjectTender();

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

  const handleSelectTender = async (selectedTender: {
    id: string;
    title: string;
  }) => {
    try {
      await updateTender.mutateAsync({
        projectId: project.id,
        tenderId: selectedTender.id,
      });
      toast.success(`Linked to "${selectedTender.title}"`);
    } catch {
      toast.error("Failed to link tender");
    }
  };

  const handleUnlinkTender = async () => {
    try {
      await updateTender.mutateAsync({
        projectId: project.id,
        tenderId: null,
      });
      toast.success("Tender unlinked");
      setUnlinkDialogOpen(false);
    } catch {
      toast.error("Failed to unlink tender");
    }
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
            <p className="font-medium">{formatDate(project.createdAt)}</p>
          </div>
        </div>
      </motion.div>

      <Separator />

      {tender ? (
        <>
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
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchDialogOpen(true)}
                  disabled={updateTender.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Change
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUnlinkDialogOpen(true)}
                  disabled={updateTender.isPending}
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Unlink
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTenderDialogOpen(true)}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View
                </Button>
              </div>
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
                      {tender.buyerName || tender.buyer || "Not specified"}
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
                        : tender.budgetMax
                          ? formatCurrency(tender.budgetMax)
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center py-6"
          >
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-1">
              No tender linked to this project
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Link a tender to enable gap analysis
            </p>
            <Button
              onClick={() => setSearchDialogOpen(true)}
              disabled={updateTender.isPending}
            >
              {updateTender.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Link a Tender
            </Button>
          </motion.div>
        </>
      )}

      {/* Tender View Dialog */}
      {tender && (
        <TenderViewDialog
          tender={{
            id: tender.id,
            title: tender.title,
            description: tender.description ?? null,
            buyer: tender.buyerName || tender.buyer || "",
            location: tender.location || tender.region || null,
            status: null,
            publicationDate: null,
            deadline: tender.deadline ?? null,
            budgetMin: tender.budgetMin ?? null,
            budgetMax: tender.budgetMax ?? tender.value ?? null,
            referenceNumber: tender.referenceNumber ?? null,
            cpvCodes: null,
            aiSummary: null,
            aiCapabilityTaxonomy: null,
            documents: null,
            requirements: null,
            contactInfo: null,
          }}
          open={tenderDialogOpen}
          onOpenChange={setTenderDialogOpen}
        />
      )}

      {/* Tender Search Dialog */}
      <TenderSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        onSelectTender={handleSelectTender}
        excludeTenderId={tender?.id}
      />

      {/* Unlink Confirmation Dialog */}
      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Tender</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink this tender? This will also clear
              any existing gap analysis and team analysis data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkTender}
              disabled={updateTender.isPending}
            >
              {updateTender.isPending ? "Unlinking..." : "Unlink"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
