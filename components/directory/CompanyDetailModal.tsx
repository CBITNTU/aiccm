"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CompanyDetailView } from "@/components/directory/CompanyDetailView";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { useTranslations } from "next-intl";
type PublicCompany = Pick<
  Company,
  | "id"
  | "companyName"
  | "logoUrl"
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
  | "websiteUrl"
>;

interface CompanyDetailModalProps {
  company: (PublicCompany | Company) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}

export function CompanyDetailModal({
  company,
  open,
  onOpenChange,
  readOnly = false,
}: CompanyDetailModalProps) {
  const t = useTranslations("Directory");

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{company.companyName}</DialogTitle>
          <DialogDescription>
            {company.description ?? t("companyDetailModal.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <CompanyDetailView company={company} readOnly={readOnly} />
      </DialogContent>
    </Dialog>
  );
}
