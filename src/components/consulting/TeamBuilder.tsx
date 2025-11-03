import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, RefreshCw, Users, Loader2, Crown } from "lucide-react";
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

interface TeamBuilderProps {
  members: any[];
  onRemoveMember: (memberId: string) => void;
  onRunGroupAnalysis: () => void;
  analyzing: boolean;
}

export function TeamBuilder({ members, onRemoveMember, onRunGroupAnalysis, analyzing }: TeamBuilderProps) {
  const getRoleBadge = (role: string) => {
    if (role === 'lead') {
      return <Badge className="flex items-center gap-1"><Crown className="h-3 w-3" /> Lead</Badge>;
    }
    if (role === 'invited') {
      return <Badge variant="secondary">Invited</Badge>;
    }
    return <Badge variant="outline">Member</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Builder ({members.length})
          </CardTitle>
          <Button
            onClick={onRunGroupAnalysis}
            disabled={analyzing || members.length === 0}
            size="sm"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                AI Group Analysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No team members yet. Add partners from recommendations to build your team.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.companies?.company_name}
                  </TableCell>
                  <TableCell>
                    {getRoleBadge(member.role)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {member.companies?.key_capabilities || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {member.companies?.postcode || member.companies?.location || 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role !== 'lead' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Partner</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {member.companies?.company_name} from the team?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onRemoveMember(member.id)}>
                              Remove
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
      </CardContent>
    </Card>
  );
}
