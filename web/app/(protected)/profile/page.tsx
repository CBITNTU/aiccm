"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "lucide-react";
import { toast } from "sonner";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [companies, setCompanies] = useState<Company[]>([]);
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
      console.log("Profile: Checking companies for user:", user.id);

      try {
        const { data: companiesData, error } = await supabase
          .from("companies")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        console.log(
          "Profile: Found companies:",
          companiesData?.length || 0,
          companiesData
        );

        if (!companiesData || companiesData.length === 0) {
          // No companies found, redirect to onboarding
          console.log("Profile: No companies found, redirecting to onboarding");
          router.push("/onboarding?mode=create");
          return;
        }

        console.log("Profile: User has companies, showing profile");
        setCompanies(companiesData);
      } catch (error) {
        console.error("Error fetching company data:", error);
        toast.error("Error", {
          description: "Failed to load company data",
        });
        // If there's an error, also try redirecting to onboarding as fallback
        router.push("/onboarding?mode=create");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [supabase, user, router]);

  const handleCompanyClick = (company: Company) => {
    router.push(`/company/${company.id}`);
  };

  const handleAddCompany = () => {
    router.push("/onboarding?mode=create");
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-muted-foreground">
          No company profile found. Redirecting to onboarding...
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
              Your Companies
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
        {companies.map((company) => (
          <Card
            key={company.id}
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => handleCompanyClick(company)}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg mb-2">
                    {company.company_name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        company.status === "active" ? "default" : "secondary"
                      }
                      className={
                        company.status === "active"
                          ? "bg-green-600"
                          : "bg-gray-600"
                      }
                    >
                      {company.status}
                    </Badge>
                    {company.is_system_company && (
                      <Badge variant="outline">Verified</Badge>
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
                    <span className="truncate">{company.contact_email}</span>
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
