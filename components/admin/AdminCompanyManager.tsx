"use client";

import { useState, useEffect } from "react";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Trash2, Building2, AlertTriangle, Zap, Brain } from "lucide-react";
import { toast } from "sonner";
import { AdminCompanyDetailSheet } from "./AdminCompanyDetailSheet";

export function AdminCompanyManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    const filtered = companies.filter(
      (company) =>
        company.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (company.description &&
          company.description.toLowerCase().includes(searchTerm.toLowerCase())),
    );
    setFilteredCompanies(filtered);
  }, [companies, searchTerm]);

  const fetchCompanies = async () => {
    try {
      const data = await api.adminListCompanies();
      setCompanies(data.companies || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async (
    companyId: string,
    companyName: string,
  ) => {
    setDeleting(companyId);
    try {
      await api.adminDeleteCompany(companyId);
      toast.success(`Successfully deleted ${companyName}`);
      setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    } catch (error) {
      console.error("Error deleting company:", error);
      toast.error(`Error deleting ${companyName}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleCompanyUpdated = () => {
    fetchCompanies();
    // Update selectedCompany if it's still open
    if (selectedCompany) {
      const updated = companies.find((c) => c.id === selectedCompany.id);
      if (updated) setSelectedCompany(updated);
    }
  };

  const systemCompanies = filteredCompanies.filter((c) => c.isSystemCompany);
  const userCompanies = filteredCompanies.filter((c) => !c.isSystemCompany);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">Loading companies...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Total: {companies.length} companies ({systemCompanies.length}{" "}
            system, {userCompanies.length} user)
          </div>
        </CardContent>
      </Card>

      {/* System Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">System Companies</Badge>
              <span className="text-sm font-normal">
                ({systemCompanies.length})
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemCompanies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No system companies found
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {systemCompanies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{company.companyName}</div>
                    <div className="text-sm text-muted-foreground">
                      {company.postcode}{" "}
                      {company.description
                        ? `• ${company.description.substring(0, 100)}...`
                        : ""}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleting === company.id}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Delete System Company
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete{" "}
                          <strong>{company.companyName}</strong>? This action
                          cannot be undone and will remove all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            handleDeleteCompany(
                              company.id,
                              company.companyName,
                            )
                          }
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete Company
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">User Companies</Badge>
              <span className="text-sm font-normal">
                ({userCompanies.length})
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userCompanies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No user companies found
            </div>
          ) : (
            <TooltipProvider>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {userCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="flex items-center justify-between p-3 border rounded-lg gap-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedCompany(company)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{company.companyName}</div>
                      <div className="text-sm text-muted-foreground">
                        {company.postcode} • Status: {company.status} •{" "}
                        <span className="capitalize">{company.verificationStatus ?? "unverified"}</span>
                      </div>
                    </div>

                    {/* Limit badges (read-only) */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {company.matchingRunsLimit != null
                              ? `${company.matchingRunsLimit}/mo`
                              : "default"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {company.matchingRunsLimit != null
                              ? `Custom matching limit: ${company.matchingRunsLimit}/month`
                              : "Matching: platform default"}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center gap-1">
                            <Brain className="h-3 w-3" />
                            {company.analysisRunsLimit != null
                              ? `${company.analysisRunsLimit}/mo`
                              : "default"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {company.analysisRunsLimit != null
                              ? `Custom analysis limit: ${company.analysisRunsLimit}/month`
                              : "Analysis: platform default"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deleting === company.id}
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Delete User Company
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete{" "}
                            <strong>{company.companyName}</strong>? This action
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              handleDeleteCompany(
                                company.id,
                                company.companyName,
                              )
                            }
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Company
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> You can delete user companies you own, but
          system companies require superadmin permissions. If you can&apos;t
          delete system companies, you may need superadmin role assignment.
        </AlertDescription>
      </Alert>

      {/* Company Detail Sheet */}
      <AdminCompanyDetailSheet
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onCompanyUpdated={handleCompanyUpdated}
      />
    </div>
  );
}
