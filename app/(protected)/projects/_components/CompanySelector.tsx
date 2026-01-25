"use client";

import { useRouter } from "next/navigation";
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
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

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
  const router = useRouter();

  const handleAddCompany = () => {
    router.push("/my-companies/new");
  };

  if (companies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            No Companies Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            You haven&apos;t created any companies yet. Create your first
            company to get started with projects.
          </p>
          <Button onClick={handleAddCompany} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Company
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-2">
      <Select
        value={selectedCompany?.id || ""}
        onValueChange={(id) => {
          const company = companies.find((c) => c.id === id) || null;
          onCompanyChange(company);
        }}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Select a company">
            {selectedCompany ? (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                {selectedCompany.company_name}
              </div>
            ) : (
              "Select a company"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>{company.company_name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" onClick={handleAddCompany}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}
