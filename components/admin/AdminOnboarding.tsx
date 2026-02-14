"use client";

import { useState, useEffect, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Search,
  Mail,
  User,
  Building2,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

interface OnboardingUser {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  createdAt: string;
  onboarding: {
    currentStep: number;
    currentStepName: string;
    completedAt: string | null;
    isComplete: boolean;
  };
  emailVerification: {
    verified: boolean;
    verifiedAt: string | null;
  };
  profileInfo: {
    completed: boolean;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  };
  accountType: {
    selected: boolean;
    type: string | null;
  };
  companyInfo: {
    signupType: string | null;
    company: {
      id: string;
      name: string;
      status: string;
    } | null;
    joinRequest: {
      companyId: string;
      companyName: string;
      status: string;
    } | null;
  } | null;
  approvalStatus: string;
}

interface OnboardingStats {
  total: number;
  byStep: {
    emailVerification: number;
    profileInfo: number;
    accountType: number;
    companyInfo: number;
    complete: number;
  };
  completed: number;
  pendingApproval: number;
  approved: number;
}

export default function AdminOnboarding() {
  const [users, setUsers] = useState<OnboardingUser[]>([]);
  const [stats, setStats] = useState<OnboardingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [filterStep, setFilterStep] = useState<number | "all">("all");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/onboarding");
      const data = await response.json();

      if (response.ok) {
        setUsers(data.users);
        setStats(data.stats);
      } else {
        console.error("Error fetching onboarding data:", data.error);
      }
    } catch (error) {
      console.error("Error fetching onboarding data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStepBadgeVariant = (step: number) => {
    switch (step) {
      case ONBOARDING_STEPS.EMAIL_VERIFICATION:
        return "destructive";
      case ONBOARDING_STEPS.PROFILE_INFO:
        return "secondary";
      case ONBOARDING_STEPS.ACCOUNT_TYPE:
        return "secondary";
      case ONBOARDING_STEPS.COMPANY_INFO:
        return "secondary";
      case ONBOARDING_STEPS.COMPLETE:
        return "default";
      default:
        return "outline";
    }
  };

  const getApprovalBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.firstName?.toLowerCase() || "").includes(
        searchQuery.toLowerCase(),
      ) ||
      (user.lastName?.toLowerCase() || "").includes(searchQuery.toLowerCase());

    const matchesFilter =
      filterStep === "all" || user.onboarding.currentStep === filterStep;

    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading onboarding data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card
            className={`cursor-pointer transition-colors ${
              filterStep === "all" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setFilterStep("all")}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${
              filterStep === ONBOARDING_STEPS.EMAIL_VERIFICATION
                ? "ring-2 ring-primary"
                : ""
            }`}
            onClick={() => setFilterStep(ONBOARDING_STEPS.EMAIL_VERIFICATION)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-destructive" />
                <div className="text-2xl font-bold">
                  {stats.byStep.emailVerification}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Email Pending</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${
              filterStep === ONBOARDING_STEPS.PROFILE_INFO
                ? "ring-2 ring-primary"
                : ""
            }`}
            onClick={() => setFilterStep(ONBOARDING_STEPS.PROFILE_INFO)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <div className="text-2xl font-bold">
                  {stats.byStep.profileInfo}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Profile Step</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${
              filterStep === ONBOARDING_STEPS.ACCOUNT_TYPE ||
              filterStep === ONBOARDING_STEPS.COMPANY_INFO
                ? "ring-2 ring-primary"
                : ""
            }`}
            onClick={() => setFilterStep(ONBOARDING_STEPS.ACCOUNT_TYPE)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <div className="text-2xl font-bold">
                  {stats.byStep.accountType + stats.byStep.companyInfo}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Account/Company
              </div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${
              filterStep === ONBOARDING_STEPS.COMPLETE
                ? "ring-2 ring-primary"
                : ""
            }`}
            onClick={() => setFilterStep(ONBOARDING_STEPS.COMPLETE)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <div className="text-2xl font-bold">{stats.completed}</div>
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Onboarding Status</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]"></TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Current Step</TableHead>
                  <TableHead>Account Type</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Signed Up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No users found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <Fragment key={user.userId}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedUser(
                            expandedUser === user.userId ? null : user.userId,
                          )
                        }
                      >
                        <TableCell>
                          {expandedUser === user.userId ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {user.firstName && user.lastName
                                ? `${user.firstName} ${user.lastName}`
                                : "Not provided"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getStepBadgeVariant(
                              user.onboarding.currentStep,
                            )}
                          >
                            {user.onboarding.currentStepName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.accountType.type ? (
                            <Badge variant="outline" className="capitalize">
                              {user.accountType.type}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getApprovalBadge(user.approvalStatus)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Details */}
                      {expandedUser === user.userId && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div className="p-4 space-y-4">
                              <h4 className="font-semibold">
                                Onboarding Progress
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Step 1: Email Verification */}
                                <div className="p-3 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-2">
                                    {user.emailVerification.verified ? (
                                      <CheckCircle className="w-4 h-4 text-green-500" />
                                    ) : (
                                      <Clock className="w-4 h-4 text-amber-500" />
                                    )}
                                    <span className="font-medium">
                                      1. Email Verification
                                    </span>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {user.emailVerification.verified ? (
                                      <span className="text-green-600">
                                        Verified{" "}
                                        {formatDate(
                                          user.emailVerification.verifiedAt,
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-amber-600">
                                        Pending verification
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Step 2: Profile Info */}
                                <div className="p-3 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-2">
                                    {user.profileInfo.completed ? (
                                      <CheckCircle className="w-4 h-4 text-green-500" />
                                    ) : user.onboarding.currentStep >=
                                      ONBOARDING_STEPS.PROFILE_INFO ? (
                                      <Clock className="w-4 h-4 text-amber-500" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <span className="font-medium">
                                      2. Profile Info
                                    </span>
                                  </div>
                                  {user.profileInfo.completed ? (
                                    <div className="text-sm space-y-1">
                                      <div>
                                        <span className="text-muted-foreground">
                                          Name:
                                        </span>{" "}
                                        {user.profileInfo.firstName}{" "}
                                        {user.profileInfo.lastName}
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">
                                          Job:
                                        </span>{" "}
                                        {user.profileInfo.jobTitle}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      Not completed
                                    </div>
                                  )}
                                </div>

                                {/* Step 3: Account Type */}
                                <div className="p-3 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-2">
                                    {user.accountType.selected ? (
                                      <CheckCircle className="w-4 h-4 text-green-500" />
                                    ) : user.onboarding.currentStep >=
                                      ONBOARDING_STEPS.ACCOUNT_TYPE ? (
                                      <Clock className="w-4 h-4 text-amber-500" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <span className="font-medium">
                                      3. Account Type
                                    </span>
                                  </div>
                                  {user.accountType.selected ? (
                                    <div className="text-sm">
                                      <Badge
                                        variant="outline"
                                        className="capitalize"
                                      >
                                        {user.accountType.type}
                                      </Badge>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      Not selected
                                    </div>
                                  )}
                                </div>

                                {/* Step 4: Company Info (if business) */}
                                <div className="p-3 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-2">
                                    {user.companyInfo ? (
                                      user.companyInfo.company ||
                                      user.companyInfo.joinRequest ? (
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                      ) : (
                                        <Clock className="w-4 h-4 text-amber-500" />
                                      )
                                    ) : user.accountType.type ===
                                      "individual" ? (
                                      <CheckCircle className="w-4 h-4 text-green-500" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <span className="font-medium">
                                      4. Company Info
                                    </span>
                                  </div>
                                  {user.accountType.type === "individual" ? (
                                    <div className="text-sm text-muted-foreground">
                                      Skipped (Individual)
                                    </div>
                                  ) : user.companyInfo?.company ? (
                                    <div className="text-sm space-y-1">
                                      <div className="font-medium">
                                        {user.companyInfo.company.name}
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className="text-xs capitalize"
                                      >
                                        {user.companyInfo.company.status.replace(
                                          "_",
                                          " ",
                                        )}
                                      </Badge>
                                    </div>
                                  ) : user.companyInfo?.joinRequest ? (
                                    <div className="text-sm space-y-1">
                                      <div>
                                        <span className="text-muted-foreground">
                                          Requesting to join:
                                        </span>
                                      </div>
                                      <div className="font-medium">
                                        {
                                          user.companyInfo.joinRequest
                                            .companyName
                                        }
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className="text-xs capitalize"
                                      >
                                        {user.companyInfo.joinRequest.status}
                                      </Badge>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      Not completed
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Completion Info */}
                              {user.onboarding.isComplete && (
                                <div className="pt-2 border-t">
                                  <div className="text-sm">
                                    <span className="text-muted-foreground">
                                      Onboarding completed:
                                    </span>{" "}
                                    <span className="font-medium">
                                      {formatDate(user.onboarding.completedAt)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
