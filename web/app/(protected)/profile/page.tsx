"use client";

import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Building2 } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and companies
        </p>
      </div>

      {/* User Info Card */}
      <Card className="card-professional mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span>{user?.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>
              {user?.user_metadata?.first_name || "User"}{" "}
              {user?.user_metadata?.last_name || ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Companies Card */}
      <Card className="card-professional">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Your Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Company management will be available once fully migrated.
          </p>
          <p className="text-sm text-muted-foreground">
            Profile page migration in progress...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
