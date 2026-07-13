"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
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
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";

interface SetupPanelProps {
  project: Project;
  tender: Tender | null;
}

export function SetupPanel({ project, tender }: SetupPanelProps) {
  const t = useTranslations("SetupPanel");
  const { currency } = useDeployment();
  // Respect the tender's own currency (e.g. CNY for Shanghai notices), falling back
  // to the active deployment currency for legacy rows without a currency set.
  const tenderCurrency = resolveCurrencyConfig(tender?.currency, currency);
  const [tenderDialogOpen, setTenderDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

  const updateTender = useUpdateProjectTender();

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return t("notSpecified");
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTenderValue = (value: number | null | undefined) => {
    if (!value) return t("notSpecified");
    return formatCurrency(value, tenderCurrency);
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
      toast.success(t("linkedSuccess", { title: selectedTender.title }));
    } catch {
      toast.error(t("linkFailed"));
    }
  };

  const handleUnlinkTender = async () => {
    try {
      await updateTender.mutateAsync({
        projectId: project.id,
        tenderId: null,
      });
      toast.success(t("unlinkSuccess"));
      setUnlinkDialogOpen(false);
    } catch {
      toast.error(t("unlinkFailed"));
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
          {t("projectDetailsTitle")}
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">{t("labelStatus")}</span>
            <p className="font-medium capitalize">{project.status}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">{t("labelCreated")}</span>
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
                {t("targetTenderTitle")}
              </h4>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchDialogOpen(true)}
                  disabled={updateTender.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {t("change")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUnlinkDialogOpen(true)}
                  disabled={updateTender.isPending}
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  {t("unlink")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTenderDialogOpen(true)}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {t("view")}
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
                      {tender.buyerName || tender.buyer || t("notSpecified")}
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
                        ? formatTenderValue(tender.value)
                        : tender.budgetMax
                          ? formatTenderValue(tender.budgetMax)
                          : t("notSpecified")}
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
              {t("noTenderLinked")}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {t("linkTenderHint")}
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
              {t("linkTender")}
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
            currency: tender.currency ?? null,
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
            <AlertDialogTitle>{t("unlinkDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("unlinkDialogDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkTender}
              disabled={updateTender.isPending}
            >
              {updateTender.isPending ? t("unlinking") : t("unlinkConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
