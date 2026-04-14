"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  Loader2,
  UserPlus,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface InviteTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  onInviteSent?: () => void;
}

export function InviteTeamMemberDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  onInviteSent,
}: InviteTeamMemberDialogProps) {
  const t = useTranslations("CompanyPage");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setError(t("inviteTeamMember.invalidEmail"));
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          email: email.toLowerCase().trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("inviteTeamMember.failedToSend"));
      }

      setSuccess(true);
      toast.success(t("inviteTeamMember.successToast", { email }));

      setTimeout(() => {
        setEmail("");
        setSuccess(false);
        onOpenChange(false);
        onInviteSent?.();
      }, 1500);
    } catch (err) {
      console.error("Invite error:", err);
      setError(
        err instanceof Error ? err.message : t("inviteTeamMember.failedToSend"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setEmail("");
      setError(null);
      setSuccess(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("inviteTeamMember.title")}
          </DialogTitle>
          <DialogDescription>
            {t("inviteTeamMember.description", { companyName })}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium">{t("inviteTeamMember.successTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("inviteTeamMember.successBody", { email })}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("inviteTeamMember.emailLabel")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("inviteTeamMember.emailPlaceholder")}
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("inviteTeamMember.validForDays")}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                {t("inviteTeamMember.cancel")}
              </Button>
              <Button type="submit" disabled={isLoading || !email}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("inviteTeamMember.sending")}
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    {t("inviteTeamMember.sendInvitation")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
