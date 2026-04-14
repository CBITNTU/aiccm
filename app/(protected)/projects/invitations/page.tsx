"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("ProjectsInvitationsPage");
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
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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
            <h3 className="text-lg font-medium mb-2">{t("noPendingTitle")}</h3>
            <p className="text-muted-foreground">{t("noPendingDesc")}</p>
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
  const t = useTranslations("ProjectsInvitationsPage");
  const [invitation, setInvitation] = useState<{
    id: string;
    voId: string;
    companyId: string;
    invitationStatus: string;
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
            <h3 className="text-lg font-medium mb-2">{t("invalidTitle")}</h3>
            <p className="text-muted-foreground">
              {error || t("invalidDesc")}
            </p>
            <Link href="/projects" className="mt-4 inline-block">
              <Button variant="outline">{t("goToProjects")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already responded
  if (
    invitation.invitationStatus === "accepted" ||
    invitation.invitationStatus === "rejected"
  ) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center">
            {invitation.invitationStatus === "accepted" ? (
              <>
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {t("alreadyAcceptedTitle")}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {t("alreadyAcceptedDesc", { projectName: invitation.projectName })}
                </p>
                <Link
                  href={`/projects?projectId=${invitation.voId}`}
                >
                  <Button>{t("viewProject")}</Button>
                </Link>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {t("declinedTitle")}
                </h3>
                <p className="text-muted-foreground">
                  {t("declinedDesc", { projectName: invitation.projectName })}
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
      toast.success(t("acceptSuccess"));
      router.push(`/projects?projectId=${result.projectId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("acceptError"),
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
      toast.success(t("declineSuccess"));
      setInvitation({ ...invitation, invitationStatus: "rejected" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("declineError"),
      );
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <div className="text-center mb-8">
        <Mail className="h-12 w-12 mx-auto text-primary mb-4" />
        <h1 className="text-2xl font-bold">{t("collaborationTitle")}</h1>
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
              <p className="text-sm text-muted-foreground">{t("invitedBy")}</p>
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
                <p className="text-sm text-muted-foreground">{t("targetTender")}</p>
                <p className="font-medium">{invitation.tenderTitle}</p>
              </div>
            </div>
          )}

          {showRejectInput && (
            <textarea
              className="w-full p-3 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("declinePlaceholder")}
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
              {t("acceptButton")}
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
                {t("declineButton")}
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
                {t("confirmDeclineButton")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
