"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Globe,
  Mail,
  Phone,
  MapPin,
  Plus,
  DollarSign,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

type Company = Database["public"]["Tables"]["companies"]["Row"];

type MembershipStatus = "owner" | "member" | "pending_join" | "pending_review";

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

interface CompanyWithMembership extends Company {
  membershipStatus: MembershipStatus;
  joinRequestStatus?: string;
}

export default function MyCompaniesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );
  const [companies, setCompanies] = useState<CompanyWithMembership[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize supabase client
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
      setLoading(false);
    }
  }, []);

  // Fetch company data
  useEffect(() => {
    if (!supabase || !user) return;

    const fetchCompanyData = async () => {
      console.log("MyCompanies: Checking companies for user:", user.id);

      try {
        // First check if user owns any companies
        const { data: ownedCompanies, error: ownedError } = await supabase
          .from("companies")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (ownedError) throw ownedError;

        const ownedIds = new Set((ownedCompanies || []).map((c) => c.id));

        // Check if user is an approved member of any company
        const { data: memberships } = await supabase
          .from("company_members")
          .select("company_id")
          .eq("user_id", user.id)
          .eq("status", "approved");

        // Fetch companies the user is a member of (but doesn't own)
        let memberCompanies: Company[] = [];
        if (memberships && memberships.length > 0) {
          const memberCompanyIds = memberships
            .map((m) => m.company_id)
            .filter((id) => !ownedIds.has(id));

          if (memberCompanyIds.length > 0) {
            const { data: memberCompaniesData } = await supabase
              .from("companies")
              .select("*")
              .in("id", memberCompanyIds);
            memberCompanies = memberCompaniesData || [];
          }
        }

        // Check for pending join requests
        const { data: pendingJoinRequests } = await supabase
          .from("company_join_requests")
          .select("company_id, status, companies(*)")
          .eq("user_id", user.id)
          .in("status", ["pending", "approved_by_admin"]);

        // Get companies from pending join requests (excluding owned and member companies)
        const memberIds = new Set(memberCompanies.map((c) => c.id));
        const pendingCompanies: CompanyWithMembership[] = [];

        if (pendingJoinRequests) {
          for (const request of pendingJoinRequests) {
            const companyData = request.companies as unknown as Company;
            if (
              companyData &&
              !ownedIds.has(companyData.id) &&
              !memberIds.has(companyData.id)
            ) {
              pendingCompanies.push({
                ...companyData,
                membershipStatus: "pending_join",
                joinRequestStatus: request.status,
              });
            }
          }
        }

        // Combine all companies with membership status
        const allCompanies: CompanyWithMembership[] = [
          ...(ownedCompanies || []).map((c) => ({
            ...c,
            membershipStatus: "owner" as const,
          })),
          ...memberCompanies.map((c) => ({
            ...c,
            membershipStatus: "member" as const,
          })),
          ...pendingCompanies,
        ];

        console.log("MyCompanies: Found companies:", allCompanies.length, {
          owned: ownedCompanies?.length || 0,
          member: memberCompanies.length,
          pending: pendingCompanies.length,
        });

        if (allCompanies.length === 0) {
          // No companies found, redirect to add new company page
          console.log(
            "MyCompanies: No companies found, redirecting to new company page",
          );
          router.push("/my-companies/new");
          return;
        }

        console.log("MyCompanies: User has companies, showing list");
        setCompanies(allCompanies);
      } catch (error) {
        console.error("Error fetching company data:", error);
        toast.error("Error", {
          description: "Failed to load company data",
        });
        // If there's an error, redirect to new company page as fallback
        router.push("/my-companies/new");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [supabase, user, router]);

  const handleCompanyClick = (company: CompanyWithMembership) => {
    // Don't navigate if pending join, pending membership review, or company pending review
    if (
      company.membershipStatus === "pending_join" ||
      company.membershipStatus === "pending_review" ||
      company.status === "pending_review"
    ) {
      return;
    }
    router.push(`/company/${company.id}`);
  };

  const handleAddCompany = () => {
    router.push("/my-companies/new");
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading your companies...</p>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-muted-foreground">
          No company profile found. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              My Companies
            </h1>
            <p className="text-muted-foreground">
              Manage and view details for all your registered companies
            </p>
          </div>
          <Button onClick={handleAddCompany}>
            <Plus className="w-4 h-4 mr-2" />
            Add New Company
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {companies.map((company) => {
          const isPendingJoin = company.membershipStatus === "pending_join";
          const isPendingMembershipReview =
            company.membershipStatus === "pending_review";
          const isPendingCompanyReview = company.status === "pending_review";
          const isPending =
            isPendingJoin ||
            isPendingMembershipReview ||
            isPendingCompanyReview;

          return (
            <Card
              key={company.id}
              className={`transition-shadow ${
                isPending ? "opacity-80" : "hover:shadow-lg cursor-pointer"
              }`}
              onClick={
                isPending ? undefined : () => handleCompanyClick(company)
              }
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">
                      {company.company_name}
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPendingJoin ? (
                        <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                          <Clock className="w-3 h-3 mr-1" />
                          {company.joinRequestStatus === "approved_by_admin"
                            ? "Awaiting Platform Approval"
                            : "Awaiting Company Approval"}
                        </Badge>
                      ) : isPendingMembershipReview ||
                        isPendingCompanyReview ? (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending Review
                        </Badge>
                      ) : (
                        <Badge
                          className={
                            company.status === "active"
                              ? "bg-green-600 text-white hover:bg-green-600"
                              : "bg-gray-500 text-white hover:bg-gray-500"
                          }
                        >
                          {formatCompanyStatus(company.status)}
                        </Badge>
                      )}
                      {company.is_system_company && (
                        <Badge variant="outline">Verified</Badge>
                      )}
                      {company.membershipStatus === "owner" && (
                        <Badge variant="outline" className="text-xs">
                          Owner
                        </Badge>
                      )}
                      {company.membershipStatus === "member" && (
                        <Badge variant="outline" className="text-xs">
                          Member
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {company.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                    {company.description}
                  </p>
                )}
              </CardHeader>

              <CardContent>
                {isPendingJoin ? (
                  <div className="p-3 bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded-lg text-sm">
                    <p className="text-gray-700 dark:text-gray-200">
                      Your request to join this company is pending approval.
                      {company.joinRequestStatus === "approved_by_admin"
                        ? " The company admin has approved your request. Awaiting platform admin approval."
                        : " You'll be notified once the company admin reviews your request."}
                    </p>
                  </div>
                ) : isPendingMembershipReview || isPendingCompanyReview ? (
                  <div className="p-3 bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded-lg text-sm">
                    <p className="text-gray-700 dark:text-gray-200">
                      This company is currently under review by the platform
                      administrators. You&apos;ll be notified once the review is
                      complete.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {company.postcode && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span>{company.postcode}</span>
                        </div>
                      )}
                      {company.website_url && (
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <span className="truncate">Website Available</span>
                        </div>
                      )}
                      {company.contact_email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="truncate">
                            {company.contact_email}
                          </span>
                        </div>
                      )}
                      {company.contact_phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{company.contact_phone}</span>
                        </div>
                      )}

                      {/* Financial Data */}
                      {company.financial_data &&
                        typeof company.financial_data === "object" &&
                        Object.keys(company.financial_data).length > 0 && (
                          <>
                            <Separator className="my-3" />
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                                <DollarSign className="w-4 h-4 text-muted-foreground" />
                                <span>Financial Information</span>
                              </div>
                              {Object.entries(company.financial_data)
                                .slice(0, 3)
                                .map(([key, field]) => (
                                  <div
                                    key={key}
                                    className="flex justify-between items-center text-sm"
                                  >
                                    <span className="text-muted-foreground capitalize">
                                      {key.replace(/([A-Z])/g, " $1").trim()}
                                    </span>
                                    <span className="font-medium">
                                      {typeof field === "object" &&
                                      field !== null &&
                                      "value" in field
                                        ? (
                                            field as { value: number }
                                          ).value?.toLocaleString() || "N/A"
                                        : "N/A"}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </>
                        )}
                    </div>

                    <div className="mt-4 pt-3 border-t">
                      <p className="text-xs text-muted-foreground text-center">
                        Click to view full details
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
