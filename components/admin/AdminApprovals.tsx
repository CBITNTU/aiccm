"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  User,
  Building2,
  Mail,
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Users,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Phone,
  Pencil,
  Sparkles,
  Save,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface CompanyDetails {
  id: string;
  companyName: string;
  companiesHouseNumber: string | null;
  websiteUrl: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

interface PendingUser {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  approvalStatus: string;
  createdAt: string;
  role: string;
  companyName: string | null;
  signupType: string;
  company: CompanyDetails | null;
}

interface JoinRequest {
  id: string;
  userId: string;
  companyId: string;
  companyNameRequested: string;
  message: string | null;
  status: string;
  adminApprovedAt: string | null;
  createdAt: string;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  } | null;
}

function toPendingUser(input: unknown): PendingUser | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row.userId !== "string" || typeof row.email !== "string") {
    return null;
  }

  return {
    userId: row.userId,
    email: row.email,
    firstName: (row.firstName as string | null | undefined) ?? null,
    lastName: (row.lastName as string | null | undefined) ?? null,
    jobTitle: (row.jobTitle as string | null | undefined) ?? null,
    approvalStatus: (row.approvalStatus as string | undefined) ?? "pending",
    createdAt: (row.createdAt as string | undefined) ?? "",
    role: (row.role as string | undefined) ?? "individual",
    companyName: (row.companyName as string | null | undefined) ?? null,
    signupType: (row.signupType as string | undefined) ?? "individual",
    company:
      row.company && typeof row.company === "object"
        ? {
            id: String((row.company as Record<string, unknown>).id ?? ""),
            companyName: String(
              (row.company as Record<string, unknown>).companyName ?? "",
            ),
            companiesHouseNumber:
              ((row.company as Record<string, unknown>)
                .companiesHouseNumber as string | null | undefined) ?? null,
            websiteUrl:
              ((row.company as Record<string, unknown>).websiteUrl as
                | string
                | null
                | undefined) ?? null,
            contactPerson:
              ((row.company as Record<string, unknown>).contactPerson as
                | string
                | null
                | undefined) ?? null,
            contactEmail:
              ((row.company as Record<string, unknown>).contactEmail as
                | string
                | null
                | undefined) ?? null,
            contactPhone:
              ((row.company as Record<string, unknown>).contactPhone as
                | string
                | null
                | undefined) ?? null,
          }
        : null,
  };
}

function toJoinRequest(input: unknown): JoinRequest | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.userId !== "string" ||
    typeof row.companyId !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    companyNameRequested: String(row.companyNameRequested ?? ""),
    message: (row.message as string | null | undefined) ?? null,
    status: String(row.status ?? "pending"),
    adminApprovedAt: (row.adminApprovedAt as string | null | undefined) ?? null,
    createdAt: String(row.createdAt ?? ""),
    user:
      row.user && typeof row.user === "object"
        ? {
            email: String((row.user as Record<string, unknown>).email ?? ""),
            firstName:
              ((row.user as Record<string, unknown>).firstName as
                | string
                | null
                | undefined) ?? null,
            lastName:
              ((row.user as Record<string, unknown>).lastName as
                | string
                | null
                | undefined) ?? null,
            jobTitle:
              ((row.user as Record<string, unknown>).jobTitle as
                | string
                | null
                | undefined) ?? null,
          }
        : null,
  };
}

export default function AdminApprovals() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Company details expand/edit state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<CompanyDetails | null>(null);
  const [analyzingCompanyId, setAnalyzingCompanyId] = useState<string | null>(
    null,
  );

  // Rejection dialog state
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    type: "user" | "request";
    id: string;
    name: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Approval confirmation dialog state (for new-company users)
  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean;
    user: PendingUser;
  } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, requestsRes] = await Promise.all([
        fetch("/api/admin/approve-user"),
        fetch("/api/admin/approve-join-request"),
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const users = Array.isArray(usersData.users) ? usersData.users : [];
        setPendingUsers(
          users
            .map(toPendingUser)
            .filter(
              (user: PendingUser | null): user is PendingUser => Boolean(user),
            ),
        );
      }

      if (requestsRes.ok) {
        const requestsData = await requestsRes.json();
        const requests = Array.isArray(requestsData.requests)
          ? requestsData.requests
          : [];
        setJoinRequests(
          requests
            .map(toJoinRequest)
            .filter(
              (request: JoinRequest | null): request is JoinRequest =>
                Boolean(request),
            ),
        );
      }
    } catch (error) {
      console.error("Error fetching approval data:", error);
      toast.error("Failed to fetch pending approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Show confirmation dialog for new-company users, approve directly for others
  const handleApproveClick = (user: PendingUser) => {
    if (user.signupType === "new-company" && user.company) {
      // Show confirmation dialog for new-company users
      setApprovalDialog({ open: true, user });
    } else {
      // Directly approve for individual or join-company users
      const userName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown";
      handleApproveUser(user.userId, userName);
    }
  };

  const handleApproveUser = async (userId: string, userName: string) => {
    setActionLoading(userId);
    setApprovalDialog(null);
    try {
      const response = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, approved: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve user");
      }

      toast.success(`${userName} has been approved`);
      fetchData();
    } catch (error) {
      console.error("Error approving user:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to approve user",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectUser = async () => {
    if (!rejectDialog || rejectDialog.type !== "user") return;

    setActionLoading(rejectDialog.id);
    try {
      const response = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: rejectDialog.id,
          approved: false,
          rejectionReason: rejectionReason || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reject user");
      }

      toast.success(`${rejectDialog.name} has been rejected`);
      setRejectDialog(null);
      setRejectionReason("");
      fetchData();
    } catch (error) {
      console.error("Error rejecting user:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to reject user",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveJoinRequest = async (
    requestId: string,
    userName: string,
  ) => {
    setActionLoading(requestId);
    try {
      const response = await fetch("/api/admin/approve-join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, approved: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve request");
      }

      toast.success(`${userName}'s join request has been approved`);
      fetchData();
    } catch (error) {
      console.error("Error approving request:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to approve request",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectJoinRequest = async () => {
    if (!rejectDialog || rejectDialog.type !== "request") return;

    setActionLoading(rejectDialog.id);
    try {
      const response = await fetch("/api/admin/approve-join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: rejectDialog.id,
          approved: false,
          rejectionReason: rejectionReason || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reject request");
      }

      toast.success(`Join request has been rejected`);
      setRejectDialog(null);
      setRejectionReason("");
      fetchData();
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to reject request",
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Company edit handlers
  const handleStartEdit = (company: CompanyDetails) => {
    setEditingCompanyId(company.id);
    setEditFormData({ ...company });
  };

  const handleCancelEdit = () => {
    setEditingCompanyId(null);
    setEditFormData(null);
  };

  const handleSaveCompany = async () => {
    if (!editFormData) return;

    setActionLoading(editFormData.id);
    try {
      const response = await fetch("/api/admin/edit-pending-company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: editFormData.id,
          companyName: editFormData.companyName,
          companiesHouseNumber: editFormData.companiesHouseNumber,
          websiteUrl: editFormData.websiteUrl,
          contactPerson: editFormData.contactPerson,
          contactEmail: editFormData.contactEmail,
          contactPhone: editFormData.contactPhone,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update company");
      }

      toast.success("Company details updated");
      setEditingCompanyId(null);
      setEditFormData(null);
      fetchData();
    } catch (error) {
      console.error("Error updating company:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update company",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleAnalyzeCompany = async (companyId: string) => {
    setAnalyzingCompanyId(companyId);
    try {
      const response = await fetch("/api/analyze-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to analyze company");
      }

      toast.success("Company analysis started. Data will be updated shortly.");
      fetchData();
    } catch (error) {
      console.error("Error analyzing company:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to analyze company",
      );
    } finally {
      setAnalyzingCompanyId(null);
    }
  };

  const getSignupTypeBadge = (signupType: string) => {
    switch (signupType) {
      case "individual":
        return <Badge variant="secondary">Individual</Badge>;
      case "new-company":
        return (
          <Badge className="bg-green-100 text-green-800">New Company</Badge>
        );
      case "join-company":
        return (
          <Badge className="bg-primary/10 text-primary">Join Company</Badge>
        );
      default:
        return <Badge variant="outline">{signupType}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const pendingCount = pendingUsers.length;
  const requestsCount = joinRequests.length;
  const _readyForApprovalCount = joinRequests.filter(
    (r) => r.status === "approved_by_admin",
  ).length;
  void _readyForApprovalCount;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Pending Approvals
          </CardTitle>
          <CardDescription>
            Review and approve new user registrations and company join requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="users">
            <TabsList className="mb-4">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Pending Users
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Join Requests
                {requestsCount > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {requestsCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              {pendingUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p>No pending user approvals</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingUsers.map((user) => {
                    const userName =
                      `${user.firstName || ""} ${
                        user.lastName || ""
                      }`.trim() || "Unknown";
                    const isExpanded = expandedUserId === user.userId;
                    const isEditing = editingCompanyId === user.company?.id;
                    const hasCompanyDetails =
                      user.signupType === "new-company" && user.company;

                    return (
                      <div
                        key={user.userId}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{userName}</h4>
                              {getSignupTypeBadge(user.signupType)}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </div>
                              {user.jobTitle && (
                                <div className="flex items-center gap-1">
                                  <Briefcase className="w-3 h-3" />
                                  {user.jobTitle}
                                </div>
                              )}
                              {user.companyName && (
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {user.companyName}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(user.createdAt)}
                              </div>
                            </div>

                            {/* Expand/Collapse button for new-company signups */}
                            {hasCompanyDetails && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 text-primary"
                                onClick={() =>
                                  setExpandedUserId(
                                    isExpanded ? null : user.userId,
                                  )
                                }
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-4 h-4 mr-1" />
                                    Hide Company Details
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-4 h-4 mr-1" />
                                    View Company Details
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setRejectDialog({
                                  open: true,
                                  type: "user",
                                  id: user.userId,
                                  name: userName,
                                })
                              }
                              disabled={actionLoading === user.userId}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApproveClick(user)}
                              disabled={actionLoading === user.userId}
                            >
                              {actionLoading === user.userId ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-1" />
                              )}
                              Approve
                            </Button>
                          </div>
                        </div>

                        {/* Expanded Company Details Section */}
                        {hasCompanyDetails && isExpanded && user.company && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="font-medium text-sm">
                                Company Details
                              </h5>
                              <div className="flex gap-2">
                                {!isEditing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        handleStartEdit(user.company!)
                                      }
                                    >
                                      <Pencil className="w-3 h-3 mr-1" />
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        handleAnalyzeCompany(user.company!.id)
                                      }
                                      disabled={
                                        analyzingCompanyId === user.company.id
                                      }
                                    >
                                      {analyzingCompanyId ===
                                      user.company.id ? (
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3 h-3 mr-1" />
                                      )}
                                      AI Analyze
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleCancelEdit}
                                    >
                                      <X className="w-3 h-3 mr-1" />
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={handleSaveCompany}
                                      disabled={
                                        actionLoading === user.company.id
                                      }
                                    >
                                      {actionLoading === user.company.id ? (
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      ) : (
                                        <Save className="w-3 h-3 mr-1" />
                                      )}
                                      Save
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {isEditing && editFormData ? (
                              /* Edit Mode */
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Company Name
                                  </Label>
                                  <Input
                                    value={editFormData.companyName}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        companyName: e.target.value,
                                      })
                                    }
                                    placeholder="Company name"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Companies House No.
                                  </Label>
                                  <Input
                                    value={
                                      editFormData.companiesHouseNumber || ""
                                    }
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        companiesHouseNumber:
                                          e.target.value || null,
                                      })
                                    }
                                    placeholder="e.g. 12345678"
                                    maxLength={8}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Website URL
                                  </Label>
                                  <Input
                                    value={editFormData.websiteUrl || ""}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        websiteUrl: e.target.value || null,
                                      })
                                    }
                                    placeholder="https://..."
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Contact Person
                                  </Label>
                                  <Input
                                    value={editFormData.contactPerson || ""}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        contactPerson: e.target.value || null,
                                      })
                                    }
                                    placeholder="Contact name"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Contact Email
                                  </Label>
                                  <Input
                                    value={editFormData.contactEmail || ""}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        contactEmail: e.target.value || null,
                                      })
                                    }
                                    placeholder="contact@company.com"
                                    type="email"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Contact Phone
                                  </Label>
                                  <Input
                                    value={editFormData.contactPhone || ""}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        contactPhone: e.target.value || null,
                                      })
                                    }
                                    placeholder="+44..."
                                    type="tel"
                                  />
                                </div>
                              </div>
                            ) : (
                              /* View Mode */
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="text-muted-foreground text-xs block">
                                      Company Name
                                    </span>
                                    <span>{user.company.companyName}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="text-muted-foreground text-xs block">
                                      Companies House No.
                                    </span>
                                    <span>
                                      {user.company.companiesHouseNumber ||
                                        "Not provided"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Globe className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="text-muted-foreground text-xs block">
                                      Website
                                    </span>
                                    {user.company.websiteUrl ? (
                                      <a
                                        href={user.company.websiteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                      >
                                        {user.company.websiteUrl}
                                      </a>
                                    ) : (
                                      <span>Not provided</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="text-muted-foreground text-xs block">
                                      Contact Person
                                    </span>
                                    <span>
                                      {user.company.contactPerson ||
                                        "Not provided"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="text-muted-foreground text-xs block">
                                      Contact Email
                                    </span>
                                    <span>
                                      {user.company.contactEmail ||
                                        "Not provided"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <span className="text-muted-foreground text-xs block">
                                      Contact Phone
                                    </span>
                                    <span>
                                      {user.company.contactPhone ||
                                        "Not provided"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="requests">
              {joinRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p>No pending join requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {joinRequests.map((request) => {
                    const userName = request.user
                      ? `${request.user.firstName || ""} ${
                          request.user.lastName || ""
                        }`.trim() || "Unknown"
                      : "Unknown";
                    const isReadyForApproval =
                      request.status === "approved_by_admin";

                    return (
                      <div
                        key={request.id}
                        className={`border rounded-lg p-4 transition-colors ${
                          isReadyForApproval
                            ? "border-green-200 bg-green-50/50"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{userName}</h4>
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-primary">
                                {request.companyNameRequested}
                              </span>
                              {isReadyForApproval && (
                                <Badge className="bg-green-100 text-green-800">
                                  Company Approved
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                              {request.user?.email && (
                                <div className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {request.user.email}
                                </div>
                              )}
                              {request.user?.jobTitle && (
                                <div className="flex items-center gap-1">
                                  <Briefcase className="w-3 h-3" />
                                  {request.user.jobTitle}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(request.createdAt)}
                              </div>
                            </div>
                            {request.message && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <span className="font-medium">Message:</span>{" "}
                                {request.message}
                              </div>
                            )}
                            {!isReadyForApproval && (
                              <div className="mt-2 flex items-center gap-1 text-sm text-amber-600">
                                <AlertCircle className="w-4 h-4" />
                                Awaiting company admin approval
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setRejectDialog({
                                  open: true,
                                  type: "request",
                                  id: request.id,
                                  name: userName,
                                })
                              }
                              disabled={actionLoading === request.id}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                handleApproveJoinRequest(request.id, userName)
                              }
                              disabled={
                                actionLoading === request.id ||
                                !isReadyForApproval
                              }
                              title={
                                !isReadyForApproval
                                  ? "Waiting for company admin approval"
                                  : undefined
                              }
                            >
                              {actionLoading === request.id ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-1" />
                              )}
                              Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      <Dialog
        open={rejectDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialog(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectDialog?.name}</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this{" "}
              {rejectDialog?.type === "user" ? "user" : "join request"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Reason (optional)</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(null);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={
                rejectDialog?.type === "user"
                  ? handleRejectUser
                  : handleRejectJoinRequest
              }
              disabled={actionLoading === rejectDialog?.id}
            >
              {actionLoading === rejectDialog?.id ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-1" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog (for new-company users) */}
      <Dialog
        open={approvalDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setApprovalDialog(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Approve User & Company
            </DialogTitle>
            <DialogDescription>
              This action will approve both the user and their company
              registration.
            </DialogDescription>
          </DialogHeader>

          {approvalDialog?.user && (
            <div className="space-y-4 py-4">
              {/* User Info */}
              <div className="p-3 rounded-lg bg-muted/50">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  User Details
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">
                      {`${approvalDialog.user.firstName || ""} ${
                        approvalDialog.user.lastName || ""
                      }`.trim() || "Not provided"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span>{approvalDialog.user.email}</span>
                  </div>
                  {approvalDialog.user.jobTitle && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Job Title:</span>
                      <span>{approvalDialog.user.jobTitle}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Company Info */}
              {approvalDialog.user.company && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-green-800 dark:text-green-200">
                    <Building2 className="w-4 h-4" />
                    Company to be Approved
                  </h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-green-700 dark:text-green-300">
                        Company Name:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {approvalDialog.user.company.companyName}
                      </span>
                    </div>
                    {approvalDialog.user.company.companiesHouseNumber && (
                      <div className="flex justify-between">
                        <span className="text-green-700 dark:text-green-300">
                          Companies House:
                        </span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {approvalDialog.user.company.companiesHouseNumber}
                        </span>
                      </div>
                    )}
                    {approvalDialog.user.company.websiteUrl && (
                      <div className="flex justify-between">
                        <span className="text-green-700 dark:text-green-300">
                          Website:
                        </span>
                        <a
                          href={approvalDialog.user.company.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate max-w-[200px]"
                        >
                          {approvalDialog.user.company.websiteUrl}
                        </a>
                      </div>
                    )}
                    {approvalDialog.user.company.contactEmail && (
                      <div className="flex justify-between">
                        <span className="text-green-700 dark:text-green-300">
                          Contact:
                        </span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {approvalDialog.user.company.contactEmail}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* What will happen */}
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-blue-800 dark:text-blue-200">
                  <Sparkles className="w-4 h-4" />
                  What will happen
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                    <span>User account will be approved and can sign in</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                    <span>
                      Company status will change to &quot;Active&quot;
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                    <span>User will become admin of the company</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Sparkles className="w-3 h-3 mt-1 flex-shrink-0" />
                    <span>
                      AI will fetch & enrich company data automatically
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (approvalDialog?.user) {
                  const userName =
                    `${approvalDialog.user.firstName || ""} ${
                      approvalDialog.user.lastName || ""
                    }`.trim() || "Unknown";
                  handleApproveUser(approvalDialog.user.userId, userName);
                }
              }}
              disabled={actionLoading === approvalDialog?.user?.userId}
              className="bg-green-600 hover:bg-green-700"
            >
              {actionLoading === approvalDialog?.user?.userId ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Approve Both
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
