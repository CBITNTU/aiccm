"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  Lock,
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";

interface InvitationData {
  valid: boolean;
  email?: string;
  companyName?: string;
  companyId?: string;
  inviterName?: string;
  expiresAt?: string;
  isExistingUser?: boolean;
  error?: string;
}

function InvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [success, _setSuccess] = useState(false);
  const [successMessage, _setSuccessMessage] = useState("");

  // Form state for new users (simplified - only password)
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  // Check if user is logged in
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Validate token on load
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError("No invitation token provided");
        setIsLoading(false);
        return;
      }

      try {
        // Check if user is already logged in
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setIsLoggedIn(true);
          setCurrentUserEmail(user.email || null);
        }

        // Validate the token
        const response = await fetch("/api/team/invite/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data: InvitationData = await response.json();
        setInvitation(data);

        if (!data.valid) {
          setError(data.error || "Invalid invitation");
        }
      } catch (err) {
        console.error("Error validating invitation:", err);
        setError("Failed to validate invitation");
      } finally {
        setIsLoading(false);
      }
    }

    validateToken();
  }, [token]);

  const handleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate form
    if (!formData.password) {
      setError("Please enter a password");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create the account
      const response = await fetch("/api/auth/signup-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      // Sign in the user automatically
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation!.email!,
        password: formData.password,
      });

      if (signInError) {
        // If sign-in fails, redirect to auth page with message
        toast.success("Account created! Please sign in to continue.");
        router.push(
          "/auth?message=Account created. Please sign in to continue onboarding.",
        );
        return;
      }

      toast.success("Account created successfully!");

      // Redirect to onboarding to complete profile
      router.push("/onboarding");
    } catch (err) {
      console.error("Signup error:", err);
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExistingUserAccept = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/signup-invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }

      toast.success("Invitation accepted!");

      // Redirect to onboarding for confirmation step
      router.push("/onboarding");
    } catch (err) {
      console.error("Accept invitation error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Validating invitation...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state (invalid token)
  if (!invitation?.valid || error) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle>Invalid Invitation</CardTitle>
              <CardDescription>
                {error ||
                  invitation?.error ||
                  "This invitation link is not valid."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Please contact your company administrator to request a new
                invitation.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/auth")}
              >
                Go to Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Success!</CardTitle>
              <CardDescription>{successMessage}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-center text-muted-foreground">
                Redirecting you...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Existing user - show accept invitation UI
  if (invitation.isExistingUser && isLoggedIn) {
    const emailMatches =
      currentUserEmail?.toLowerCase() === invitation.email?.toLowerCase();

    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Join {invitation.companyName}</CardTitle>
              <CardDescription>
                {invitation.inviterName} has invited you to join their team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!emailMatches && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This invitation was sent to {invitation.email}. You are
                    currently logged in as {currentUserEmail}. Please log out
                    and log in with the correct account.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Company:</span>
                  <span className="font-medium">{invitation.companyName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Invited by:</span>
                  <span className="font-medium">{invitation.inviterName}</span>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleExistingUserAccept}
                disabled={isSubmitting || !emailMatches}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Accept Invitation
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                After accepting, a platform administrator will review your
                membership request.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Existing user but not logged in - prompt to log in
  if (invitation.isExistingUser && !isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Join {invitation.companyName}</CardTitle>
              <CardDescription>
                {invitation.inviterName} has invited you to join their team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <User className="h-4 w-4" />
                <AlertDescription>
                  You already have an account with {invitation.email}. Please
                  sign in to accept this invitation.
                </AlertDescription>
              </Alert>

              <Button
                className="w-full"
                onClick={() =>
                  router.push(`/auth?redirect=/auth/invite?token=${token}`)
                }
              >
                Sign In to Accept
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // New user - show simplified signup form (password only)
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Join {invitation.companyName}</CardTitle>
            <CardDescription>
              {invitation.inviterName} has invited you to join their team.
              Create your account to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleNewUserSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="bg-muted/50 rounded-lg p-3 mb-4">
                <p className="text-sm text-muted-foreground">
                  Email:{" "}
                  <span className="font-medium text-foreground">
                    {invitation.email}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 6 characters"
                    className="pl-10"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    className="pl-10"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Account & Join
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                You&apos;ll complete your profile in the next step.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <Card className="w-full max-w-md mx-4">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      }
    >
      <InvitePageContent />
    </Suspense>
  );
}
