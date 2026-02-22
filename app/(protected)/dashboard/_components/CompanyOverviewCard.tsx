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
              {company.company_name}
            </span>
          </div>

          {company.safety_rating && (
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Safety Rating</span>
              <Badge
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                {company.safety_rating}
              </Badge>
            </div>
          )}

          {company.market_position && (
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Market Position</span>
              <span className="text-sm">
                {company.market_position}
              </span>
            </div>
          )}

          {/* Financial Data */}
          {company.financial_data &&
            Object.keys(
              company.financial_data as Record<string, unknown>,
            ).length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    Financial Information
                  </h4>
                  {Object.entries(
                    company.financial_data as Record<
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
              variant={
                company.status === "active"
                  ? "default"
                  : "secondary"
              }
              className={
                company.status === "active"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-orange-600 hover:bg-orange-700"
              }
            >
              {company.status
                ? company.status.charAt(0).toUpperCase() +
                  company.status.slice(1)
                : "Active"}
            </Badge>
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
