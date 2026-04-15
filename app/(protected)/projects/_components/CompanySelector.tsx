"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Plus } from "lucide-react";
import type { CompanyRecord as Company } from "@/lib/api/types";

interface CompanySelectorProps {
  companies: Company[];
  selectedCompany: Company | null;
  onCompanyChange: (company: Company | null) => void;
}

export function CompanySelector({
  companies,
  selectedCompany,
  onCompanyChange,
}: CompanySelectorProps) {
  const t = useTranslations("ProjectCompanySelector");

  if (companies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t("noCompaniesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            {t("noCompaniesDesc")}
          </p>
          <Button asChild className="w-full">
            <Link href="/my-company/new">
              <Plus className="w-4 h-4 mr-2" />
              {t("createFirstCompany")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Select
      value={selectedCompany?.id || ""}
      onValueChange={(id) => {
        const company = companies.find((c) => c.id === id) || null;
        onCompanyChange(company);
      }}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder={t("placeholder")}>
          {selectedCompany ? (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {selectedCompany.companyName}
            </div>
          ) : (
            t("placeholder")
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {companies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span>{company.companyName}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
