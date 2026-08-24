"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Building2 } from "lucide-react";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useTranslations } from "next-intl";

interface CompanySelectorProps {
  selectedCompanyId?: string | null;
  onCompanySelect?: (company: Company | null) => void;
  showAddButton?: boolean;
  className?: string;
}

export function CompanySelector({
  selectedCompanyId,
  onCompanySelect,
  showAddButton = true,
  className = "",
}: CompanySelectorProps) {
  const t = useTranslations("CompanySelector");
  const { user } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.getMyCompanies();
        setCompanies(data.companies || []);
      } catch (error) {
        console.error("Error fetching companies:", error);
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [user]);

  // Handle company selection based on prop or auto-select
  useEffect(() => {
    if (companies.length === 0) return;

    if (selectedCompanyId) {
      // Prop-driven selection (from route or parent)
      const companyToSelect = companies.find((c) => c.id === selectedCompanyId);
      if (companyToSelect && companyToSelect.id !== selectedCompany?.id) {
        setSelectedCompany(companyToSelect);
        onCompanySelect?.(companyToSelect);
      }
    } else if (!selectedCompany) {
      // Auto-select first company only if nothing is selected yet
      setSelectedCompany(companies[0]);
      onCompanySelect?.(companies[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: sync selectedCompany from id/companies
  }, [selectedCompanyId, companies, selectedCompany?.id, onCompanySelect]);

  const handleCompanyChange = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId) || null;
    setSelectedCompany(company);
    onCompanySelect?.(company);
  };

  const handleAddCompany = () => {
    router.push("/my-company/new");
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-10 bg-muted rounded-md"></div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <Card className={className}>
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
          <Button onClick={handleAddCompany} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            {t("createFirstCompany")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <Select
        value={selectedCompany?.id || ""}
        onValueChange={handleCompanyChange}
      >
        <SelectTrigger className="min-w-[200px]">
          <SelectValue placeholder={t("selectPlaceholder")}>
            {selectedCompany ? (
              <div className="flex items-center gap-2">
                <CompanyLogo
                  companyName={selectedCompany.companyName}
                  logoUrl={selectedCompany.logoUrl}
                  size="xs"
                  fallback="initials"
                />
                {selectedCompany.companyName}
              </div>
            ) : (
              t("selectPlaceholder")
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              <div className="flex items-center gap-2">
                <CompanyLogo
                  companyName={company.companyName}
                  logoUrl={company.logoUrl}
                  size="xs"
                  fallback="initials"
                />
                <div>
                  <div className="font-medium">{company.companyName}</div>
                  <div className="text-xs text-muted-foreground">
                    {company.status}
                  </div>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showAddButton && (
        <Button variant="outline" onClick={handleAddCompany}>
          <Plus className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
