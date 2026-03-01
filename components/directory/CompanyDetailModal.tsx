"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CompanyDetailView } from "@/components/directory/CompanyDetailView";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type PublicCompany = Pick<
  Company,
  | "id"
  | "company_name"
  | "description"
  | "key_capabilities"
  | "postcode"
  | "certifications"
  | "equipment"
  | "past_projects"
  | "is_system_company"
  | "status"
  | "market_position"
  | "safety_rating"
  | "digital_maturity"
  | "ai_competencies"
  | "ai_capabilities"
  | "ai_analysis"
  | "created_at"
  | "updated_at"
  | "user_id"
  | "website_url"
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
  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{company.company_name}</DialogTitle>
          <DialogDescription>
            {company.description ?? "Company details"}
          </DialogDescription>
        </DialogHeader>
        <CompanyDetailView company={company} readOnly={readOnly} />
      </DialogContent>
    </Dialog>
  );
}
