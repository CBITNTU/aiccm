"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProjectInvitations } from "@/hooks/useProjectInvitations";
import { api } from "@/lib/api/client";
import { ProjectInvitationCard } from "@/components/consulting/ProjectInvitationCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Mail,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  Building2,
  Target,
} from "lucide-react";
import { useRespondToInvitation } from "@/hooks/useProjectInvitations";
import { toast } from "sonner";
import Link from "next/link";

export default function InvitationsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const token = searchParams.get("token");

  if (token) {
    return <TokenInvitationView token={token} />;
  }

  return <AllInvitationsView userId={user?.id ?? null} />;
}

function AllInvitationsView({ userId }: { userId: string | null }) {
  const router = useRouter();
  const { data, isLoading } = useProjectInvitations(userId);

  const handleResponded = (action: "accept" | "reject", projectId: string) => {
    if (action === "accept") {
      router.push(`/projects?projectId=${projectId}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Project Invitations</h1>
          <p className="text-sm text-muted-foreground">
            Review and respond to collaboration invitations
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.invitations || data.invitations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Pending Invitations</h3>
            <p className="text-muted-foreground">
              You don&apos;t have any pending project invitations at the moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.invitations.map((invitation) => (
            <ProjectInvitationCard
              key={invitation.id}
              invitation={invitation}
              onResponded={handleResponded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TokenInvitationView({ token }: { token: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<{
    id: string;
    vo_id: string;
    company_id: string;
    invitation_status: string;
    projectName: string;
    projectDescription: string | null;
    leadCompanyName: string;
    leadCompanyContact: string | null;
    tenderTitle: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const respond = useRespondToInvitation();

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const data = await api.getInvitationByToken(token);
        setInvitation(data.invitation);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load invitation",
        );
      } finally {
        setLoading(false);
      }
    }
    fetchInvitation();
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Invalid Invitation</h3>
            <p className="text-muted-foreground">
              {error || "This invitation link is invalid or has expired."}
            </p>
            <Link href="/projects" className="mt-4 inline-block">
              <Button variant="outline">Go to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already responded
  if (
    invitation.invitation_status === "accepted" ||
    invitation.invitation_status === "rejected"
  ) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center">
            {invitation.invitation_status === "accepted" ? (
              <>
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Invitation Already Accepted
                </h3>
                <p className="text-muted-foreground mb-4">
                  You&apos;ve already accepted the invitation to{" "}
                  <strong>{invitation.projectName}</strong>.
                </p>
                <Link
                  href={`/projects?projectId=${invitation.vo_id}`}
                >
                  <Button>View Project</Button>
                </Link>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Invitation Declined
                </h3>
                <p className="text-muted-foreground">
                  You&apos;ve declined the invitation to{" "}
                  <strong>{invitation.projectName}</strong>.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleAccept = async () => {
    try {
      const result = await respond.mutateAsync({
        invitationId: invitation.id,
        action: "accept",
      });
      toast.success("Invitation accepted!");
      router.push(`/projects?projectId=${result.projectId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    }
  };

  const handleReject = async () => {
    try {
      await respond.mutateAsync({
        invitationId: invitation.id,
        action: "reject",
        message: rejectMessage || undefined,
      });
      toast.success("Invitation declined.");
      setInvitation({ ...invitation, invitation_status: "rejected" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to decline invitation",
      );
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <div className="text-center mb-8">
        <Mail className="h-12 w-12 mx-auto text-primary mb-4" />
        <h1 className="text-2xl font-bold">Project Collaboration Invitation</h1>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{invitation.projectName}</h2>
            {invitation.projectDescription && (
              <p className="text-muted-foreground mt-1">
                {invitation.projectDescription}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Invited by</p>
              <p className="font-medium">{invitation.leadCompanyName}</p>
              {invitation.leadCompanyContact && (
                <p className="text-sm text-muted-foreground">
                  {invitation.leadCompanyContact}
                </p>
              )}
            </div>
          </div>

          {invitation.tenderTitle && (
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Target className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Target Tender</p>
                <p className="font-medium">{invitation.tenderTitle}</p>
              </div>
            </div>
          )}

          {showRejectInput && (
            <textarea
              className="w-full p-3 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Optional message (reason for declining)..."
              value={rejectMessage}
              onChange={(e) => setRejectMessage(e.target.value)}
              rows={3}
            />
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleAccept}
              disabled={respond.isPending}
              className="flex-1"
              size="lg"
            >
              {respond.isPending && respond.variables?.action === "accept" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Accept Invitation
            </Button>
            {!showRejectInput ? (
              <Button
                variant="outline"
                onClick={() => setShowRejectInput(true)}
                disabled={respond.isPending}
                className="flex-1"
                size="lg"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Decline
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={respond.isPending}
                className="flex-1"
                size="lg"
              >
                {respond.isPending &&
                respond.variables?.action === "reject" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Confirm Decline
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
