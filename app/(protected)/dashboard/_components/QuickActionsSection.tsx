"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Building2, Users } from "lucide-react";

export function QuickActionsSection() {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/directory")}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Manage Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Update your company profiles and capabilities
          </p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/tenders")}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Browse Tenders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Discover new tender opportunities
          </p>
        </CardContent>
      </Card>

      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => router.push("/projects")}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Partnerships
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Build consulting teams and partnerships
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
