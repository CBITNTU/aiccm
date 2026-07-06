"use client";

import { useRouter } from "next/navigation";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Building2 } from "lucide-react";
import { CompanyDetailPage } from "@/components/company/CompanyDetailPage";
import { useDeployment } from "@/lib/deployment/client";

export default function MyCompanyPage() {
  const { selectedOrg, pendingCompanies, isLoading, hasNoOrgs } = useOrg();
  const { brand } = useDeployment();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading your company...</p>
      </div>
    );
  }

  // No companies at all — show create CTA
  if (hasNoOrgs && pendingCompanies.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-lg mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">No Organization Yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-muted-foreground">
                Create or join a company to get started with {brand.name}.
              </p>
              <Button
                onClick={() => router.push("/my-company/new")}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Organization
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Only pending companies — show pending message
  if (!selectedOrg && pendingCompanies.length > 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">My Company</h1>
          <p className="text-muted-foreground">
            Your organization membership is pending approval
          </p>
        </div>

        <div className="space-y-4">
          {pendingCompanies.map((company) => (
            <Card key={company.id} className="opacity-80">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{company.companyName}</CardTitle>
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  Your request is being reviewed. You&apos;ll be notified once approved.
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            variant="outline"
            onClick={() => router.push("/my-company/new")}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Another Organization
          </Button>
        </div>
      </div>
    );
  }

  // Normal state — show full company detail page
  const company = selectedOrg!;

  return (
    <>
      <CompanyDetailPage key={company.id} companyId={company.id} basePath="/my-company" />

      {/* Pending companies section */}
      {pendingCompanies.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <h2 className="text-lg font-semibold mb-4">Pending Organizations</h2>
          <div className="space-y-3">
            {pendingCompanies.map((pending) => (
              <Card key={pending.id} className="opacity-80">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{pending.companyName}</span>
                  </div>
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
