"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trash2,
  RefreshCw,
  Users,
  Loader2,
  Crown,
  Plus,
  Target,
  Lightbulb,
} from "lucide-react";
import { VerifiedBadge } from "@/components/company/VerifiedBadge";
import { CompanySearchDialog } from "./CompanySearchDialog";
import { useTranslations } from "next-intl";
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

interface TeamAnalysis {
  type: "team";
  analyzedAt: string;
  requiredCompetencies: string[];
  companyCompetencies: string[];
  missingCompetencies: string[];
  coveragePercentage: number;
  readinessScore: number;
  risks: string[];
  recommendations?: string[];
  teamMembers?: {
    companyName: string;
    contribution: string[];
  }[];
}

interface TeamMember {
  id: string;
  companyId: string;
  role: string;
  companies?: {
    companyName: string;
    keyCapabilities?: string | null;
    postcode?: string | null;
    location?: string | null;
    verificationStatus?: string | null;
  } | null;
}

interface TeamBuilderProps {
  members: TeamMember[];
  onRemoveMember: (memberId: string) => void;
  onRunGroupAnalysis: () => void;
  onAddCompany: (companyId: string) => Promise<void>;
  analyzing: boolean;
  teamAnalysis?: TeamAnalysis | null;
}

export function TeamBuilder({
  members,
  onRemoveMember,
  onRunGroupAnalysis,
  onAddCompany,
  analyzing,
  teamAnalysis,
}: TeamBuilderProps) {
  const t = useTranslations("TeamBuilder");
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const getRoleBadge = (role: string) => {
    if (role === "lead") {
      return (
        <Badge className="flex items-center gap-1">
          <Crown className="h-3 w-3" /> {t("roleLead")}
        </Badge>
      );
    }
    if (role === "invited") {
      return <Badge variant="secondary">{t("roleInvited")}</Badge>;
    }
    return <Badge variant="outline">{t("roleMember")}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("title", { count: members.length })}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() => setSearchDialogOpen(true)}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("addCompanyButton")}
            </Button>
            <Button
              onClick={onRunGroupAnalysis}
              disabled={analyzing || members.length === 0}
              size="sm"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("analyzingButton")}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("groupAnalysisButton")}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t("noMembers")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colCompany")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead>{t("colCapabilities")}</TableHead>
                <TableHead>{t("colLocation")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {member.companies?.companyName}
                      {member.companies?.verificationStatus === "verified" && (
                        <VerifiedBadge compact />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{getRoleBadge(member.role)}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {member.companies?.keyCapabilities || t("notAvailable")}
                  </TableCell>
                  <TableCell>
                    {member.companies?.postcode ||
                      member.companies?.location ||
                      t("notAvailable")}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role !== "lead" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("removeDialogTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("removeDialogDesc", { companyName: member.companies?.companyName || "Unknown Company" })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onRemoveMember(member.id)}
                            >
                              {t("removeButton")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Team Analysis Results */}
        {teamAnalysis && (
          <div className="mt-6 pt-6 border-t space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-green-500" />
              <h3 className="text-lg font-semibold">{t("analysisResultsTitle")}</h3>
            </div>

            {/* Team Coverage Score */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <Label className="text-sm text-muted-foreground">
                    {t("teamCoverageLabel")}
                  </Label>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-green-600">
                      {teamAnalysis.coveragePercentage}%
                    </span>
                    <Badge
                      variant={
                        teamAnalysis.coveragePercentage >= 90
                          ? "default"
                          : "secondary"
                      }
                    >
                      {teamAnalysis.coveragePercentage >= 90
                        ? t("ratingExcellent")
                        : teamAnalysis.coveragePercentage >= 70
                          ? t("ratingGood")
                          : t("ratingNeedsWork")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <Label className="text-sm text-muted-foreground">
                    {t("teamReadinessLabel")}
                  </Label>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-green-600">
                      {teamAnalysis.readinessScore}%
                    </span>
                    <Badge
                      variant={
                        teamAnalysis.readinessScore >= 85
                          ? "default"
                          : teamAnalysis.readinessScore >= 50
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {teamAnalysis.readinessScore >= 85
                        ? t("ratingReadyToBid")
                        : teamAnalysis.readinessScore >= 50
                          ? t("ratingAlmostReady")
                          : t("ratingNeedsWork")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Team Member Contributions */}
            {teamAnalysis.teamMembers &&
              teamAnalysis.teamMembers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t("contributionsTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {teamAnalysis.teamMembers.map((member, idx) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                          {idx === 0 && (
                            <Crown className="h-4 w-4 text-yellow-500" />
                          )}
                          {member.companyName}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {member.contribution.map((contrib, cIdx) => (
                            <Badge
                              key={cIdx}
                              variant="outline"
                              className="text-xs"
                            >
                              {contrib}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

            {/* Team Competencies */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  {t("combinedCompetenciesTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="font-semibold">{t("coveredCompetencies")}</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {teamAnalysis.companyCompetencies.map((comp, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="bg-green-500/10"
                      >
                        {comp}
                      </Badge>
                    ))}
                  </div>
                </div>

                {teamAnalysis.missingCompetencies &&
                  teamAnalysis.missingCompetencies.length > 0 && (
                    <div>
                      <Label className="font-semibold text-orange-500">
                        {t("remainingGaps")}
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {teamAnalysis.missingCompetencies.map((comp, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="bg-orange-500/10 border-orange-500/20"
                          >
                            {comp}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>

            {/* Team Recommendations */}
            {teamAnalysis.recommendations &&
              teamAnalysis.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t("strategicRecs")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {teamAnalysis.recommendations.map((rec, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-muted-foreground flex items-start gap-2"
                        >
                          <span className="text-primary mt-1">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

            {/* Team Risks */}
            {teamAnalysis.risks && teamAnalysis.risks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-red-500">
                    {t("teamRisks")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {teamAnalysis.risks.map((risk, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-red-500 mt-1">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>

      <CompanySearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        onAddCompany={onAddCompany}
        excludeCompanyIds={members.map((m) => m.companyId)}
      />
    </Card>
  );
}
