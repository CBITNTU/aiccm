"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2 } from "lucide-react";
import { VerifiedBadge } from "@/components/company/VerifiedBadge";
import type { Company } from "./types";

export function CompanyOverviewCard({ company }: { company: Company }) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Overview
        </CardTitle>
        <CardDescription>
          Key information and business insights
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium">Company Name</span>
            <span className="text-sm">
              {company.companyName}
            </span>
          </div>

          {/* Financial Data */}
          {company.financialData &&
            Object.keys(
              company.financialData as Record<string, unknown>,
            ).length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    Financial Information
                  </h4>
                  {Object.entries(
                    company.financialData as Record<
                      string,
                      { value: number | string }
                    >,
                  )
                    .slice(0, 5)
                    .map(([key, field]) => (
                      <div
                        key={key}
                        className="flex justify-between items-center p-3 bg-muted/30 rounded-lg"
                      >
                        <span className="text-sm font-medium capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className="text-sm font-semibold">
                          {typeof field.value === "number"
                            ? `£${field.value.toLocaleString()}`
                            : field.value || "N/A"}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}

          <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium">Status</span>
            <Badge
              className={
                company.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100"
              }
            >
              {company.status
                ? company.status.charAt(0).toUpperCase() +
                  company.status.slice(1)
                : "Active"}
            </Badge>
          </div>

          <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium">Verification</span>
            {company.verificationStatus === "verified" ? (
              <VerifiedBadge />
            ) : company.verificationStatus === "pending_verification" ? (
              <Badge className="gap-1 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                Pending
              </Badge>
            ) : (
              <Badge className="gap-1 bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100">
                Not Verified
              </Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push("/profile")}
            >
              View Profile
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push("/directory")}
            >
              Browse Directory
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
