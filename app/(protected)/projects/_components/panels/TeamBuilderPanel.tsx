"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAddTeamMember,
  useRemoveTeamMember,
} from "@/hooks/useProjectMutations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Plus,
  Trash2,
  Crown,
  MapPin,
  Award,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { CompanySearchDialog } from "@/components/consulting/CompanySearchDialog";
import type { TeamMember } from "@/hooks/useProjectDetails";
import type { RecommendedPartner } from "@/hooks/useProjects";

interface TeamBuilderPanelProps {
  projectId: string;
  teamMembers: TeamMember[];
  recommendedPartners: RecommendedPartner[];
}

export function TeamBuilderPanel({
  projectId,
  teamMembers,
  recommendedPartners,
}: TeamBuilderPanelProps) {
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [addingPartnerId, setAddingPartnerId] = useState<string | null>(null);

  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();

  const handleAddCompany = async (companyId: string) => {
    try {
      setAddingPartnerId(companyId);
      await addMember.mutateAsync({ projectId, companyId });
      toast.success("Partner added to team");
    } catch {
      toast.error("Failed to add partner");
    } finally {
      setAddingPartnerId(null);
    }
  };

  const handleRemoveMember = async (memberId: string, companyName: string) => {
    try {
      await removeMember.mutateAsync({ memberId, projectId });
      toast.success(`${companyName} removed from team`);
    } catch {
      toast.error("Failed to remove partner");
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === "lead") {
      return (
        <Badge className="flex items-center gap-1">
          <Crown className="h-3 w-3" /> Lead
        </Badge>
      );
    }
    if (role === "invited") {
      return <Badge variant="secondary">Invited</Badge>;
    }
    return <Badge variant="outline">Member</Badge>;
  };

  // Filter out partners that are already team members
  const teamCompanyIds = new Set(teamMembers.map((m) => m.company_id));
  const availablePartners = recommendedPartners.filter(
    (p) => !teamCompanyIds.has(p.id),
  );

  return (
    <div className="py-4 space-y-6">
      {/* Team Members Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members ({teamMembers.length})
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>

        {teamMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No team members yet. Add partners from recommendations or search for
            companies.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Capabilities
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Location
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {teamMembers.map((member, index) => (
                    <motion.tr
                      key={member.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b last:border-b-0"
                    >
                      <TableCell className="font-medium">
                        {member.companies?.company_name || "Unknown"}
                      </TableCell>
                      <TableCell>{getRoleBadge(member.role)}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-xs truncate text-sm text-muted-foreground">
                        {member.companies?.key_capabilities || "N/A"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {member.companies?.postcode ||
                          member.companies?.location ||
                          "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        {member.role !== "lead" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={removeMember.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Remove Partner
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove{" "}
                                  {member.companies?.company_name} from the
                                  team?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleRemoveMember(
                                      member.id,
                                      member.companies?.company_name ||
                                        "Partner",
                                    )
                                  }
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Recommended Partners */}
      {availablePartners.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h4 className="font-medium mb-4">
            Recommended Partners ({availablePartners.length})
          </h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {availablePartners.map((partner, index) => (
              <motion.div
                key={partner.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h5 className="font-semibold">{partner.company_name}</h5>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {partner.location}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {partner.relevanceScore}% Match
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleAddCompany(partner.id)}
                      disabled={addingPartnerId === partner.id}
                    >
                      {addingPartnerId === partner.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {partner.matchingCompetencies &&
                  partner.matchingCompetencies.length > 0 && (
                    <div className="mb-2">
                      <div className="text-sm font-medium mb-1">
                        Matching Competencies:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {partner.matchingCompetencies
                          .slice(0, 5)
                          .map((comp, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-xs"
                            >
                              {comp}
                            </Badge>
                          ))}
                        {partner.matchingCompetencies.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{partner.matchingCompetencies.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                {partner.certifications &&
                  partner.certifications !== "Not specified" && (
                    <div className="text-sm text-muted-foreground flex items-start gap-2">
                      <Award className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">
                        {partner.certifications}
                      </span>
                    </div>
                  )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Company Search Dialog */}
      <CompanySearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        onAddCompany={handleAddCompany}
        excludeCompanyIds={teamMembers.map((m) => m.company_id)}
      />
    </div>
  );
}
