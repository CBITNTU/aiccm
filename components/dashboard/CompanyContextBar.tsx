"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface CompanyContextBarProps<T extends { id: string; company_name: string | null }> {
  companies: T[];
  selectedCompany: T | null;
  onSelect: (company: T) => void;
}

export function CompanyContextBar<T extends { id: string; company_name: string | null }>({
  companies,
  selectedCompany,
  onSelect,
}: CompanyContextBarProps<T>) {
  if (companies.length === 0) return null;

  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span className="font-medium text-foreground">
          {companies[0].company_name ?? "Unnamed Company"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedCompany?.id ?? ""}
        onValueChange={(id) => {
          const company = companies.find((c) => c.id === id);
          if (company) onSelect(company);
        }}
      >
        <SelectTrigger className="w-[260px]">
          <SelectValue placeholder="Select a company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.company_name ?? "Unnamed Company"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
