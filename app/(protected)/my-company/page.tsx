"use client";

import { useRouter } from "next/navigation";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Mail,
  Phone,
  MapPin,
  Plus,
  DollarSign,
  ExternalLink,
  Clock,
  Building2,
} from "lucide-react";
import { TeamMembersCard } from "@/components/company/TeamMembersCard";

const formatCompanyStatus = (status: string | null): string => {
  if (!status) return "Unknown";
  const statusMap: Record<string, string> = {
    active: "Active",
    pending_review: "Pending Review",
    inactive: "Inactive",
    suspended: "Suspended",
    draft: "Draft",
  };
  return (
    statusMap[status] ||
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

export default function MyCompanyPage() {
  const { selectedOrg, pendingCompanies, isLoading, hasNoOrgs } = useOrg();
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
                Create or join a company to get started with TNDRX.
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
                  <CardTitle className="text-lg">{company.company_name}</CardTitle>
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

  // Normal state — show selected org details
  const company = selectedOrg!;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              My Company
            </h1>
            <p className="text-muted-foreground">
              Manage and view details for {company.company_name}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/company/${company.id}`)}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Full Profile
            </Button>
            <Button onClick={() => router.push("/my-company/new")}>
              <Plus className="w-4 h-4 mr-2" />
              Add Company
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Company Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Details
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    company.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }
                >
                  {formatCompanyStatus(company.status)}
                </Badge>
                {company.is_system_company && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">Verified</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {company.description && (
              <p className="text-sm text-muted-foreground">
                {company.description}
              </p>
            )}

            <div className="space-y-3">
              {company.postcode && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span>{company.postcode}</span>
                </div>
              )}
              {company.website_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{company.website_url}</span>
                </div>
              )}
              {company.contact_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{company.contact_email}</span>
                </div>
              )}
              {company.contact_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span>{company.contact_phone}</span>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Financial Data Card */}
        {company.financial_data &&
          typeof company.financial_data === "object" &&
          Object.keys(company.financial_data).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Financial Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(company.financial_data)
                  .slice(0, 6)
                  .map(([key, field]) => (
                    <div
                      key={key}
                      className="flex justify-between items-center p-3 bg-muted/30 rounded-lg"
                    >
                      <span className="text-sm font-medium capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span className="text-sm font-semibold">
                        {typeof field === "object" &&
                        field !== null &&
                        "value" in field
                          ? typeof (field as { value: unknown }).value === "number"
                            ? `£${((field as { value: number }).value).toLocaleString()}`
                            : String((field as { value: unknown }).value) || "N/A"
                          : "N/A"}
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

        {/* Capabilities Card */}
        {(company.key_capabilities || company.certifications) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Capabilities & Certifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {company.key_capabilities && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Key Capabilities</h4>
                  <p className="text-sm text-muted-foreground">
                    {Array.isArray(company.key_capabilities)
                      ? company.key_capabilities.join(", ")
                      : company.key_capabilities}
                  </p>
                </div>
              )}
              {company.certifications && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Certifications</h4>
                  <p className="text-sm text-muted-foreground">
                    {Array.isArray(company.certifications)
                      ? company.certifications.join(", ")
                      : company.certifications}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Team Members */}
      <div className="mt-6">
        <TeamMembersCard companyId={company.id} variant="full" />
      </div>

      {/* Pending companies section */}
      {pendingCompanies.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Pending Organizations</h2>
          <div className="space-y-3">
            {pendingCompanies.map((pending) => (
              <Card key={pending.id} className="opacity-80">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{pending.company_name}</span>
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
    </div>
  );
}
