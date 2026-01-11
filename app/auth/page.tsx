"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  Mail,
  Lock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const router = useRouter();

  // Form states - simplified to just email and password
  const [signUpData, setSignUpData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
  });

  // Email verification state
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  // Initialize supabase client on mount
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
      setError(
        "Configuration error. Please ensure environment variables are set."
      );
    }
  }, []);

  // Handle hash fragment tokens (from email verification links)
  useEffect(() => {
    if (typeof window === "undefined" || !supabase) return;

    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      // Parse hash to check for type=signup (email verification)
      const hashParams = new URLSearchParams(hash.substring(1));
      const type = hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken && (type === "signup" || type === "magiclink")) {
        // This is an email verification - show loading state
        setIsVerifyingEmail(true);
        setError(null);

        // Manually set the session from the hash tokens
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ error }) => {
          if (error) {
            console.error("Failed to set session from hash:", error);
            setIsVerifyingEmail(false);
            setError("Failed to verify email. Please try again.");
          }
          // onAuthStateChange will handle the rest
        });
      }
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth page - Auth state change:", event, session?.user?.id);
      if (event === "SIGNED_IN" && session) {
        // Check if this was an email verification
        const wasVerifyingEmail = isVerifyingEmail;
        if (wasVerifyingEmail) {
          setIsVerifyingEmail(false);
          // Clean up the URL
          window.history.replaceState(null, "", "/auth");
          toast.success("Email verified!", {
            description: "Your email has been verified. Redirecting to complete your profile...",
          });

          // Update onboarding step to 2 if currently on step 1
          try {
            await fetch("/api/onboarding/check-verification");
          } catch (e) {
            console.error("Error updating onboarding step:", e);
          }
        }

        // Add small delay to ensure any pending database operations complete
        setTimeout(async () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: profile, error: profileError } = await (supabase
              .from("profiles") as any)
              .select("approval_status, onboarding_completed_at")
              .eq("user_id", session.user.id)
              .single();

            if (profileError) {
              console.error("Error checking profile:", profileError);
              // Default to onboarding for new users
              router.push("/onboarding");
              return;
            }

            // If onboarding not completed, go to onboarding
            if (!profile?.onboarding_completed_at) {
              router.push("/onboarding");
              return;
            }

            // If onboarding complete but pending approval
            if (profile?.approval_status === "pending") {
              router.push("/pending-approval");
              return;
            }

            if (profile?.approval_status === "rejected") {
              toast.error("Account Access Denied", {
                description:
                  "Your account application was not approved. Please contact support.",
              });
              await supabase.auth.signOut();
              return;
            }

            // Check user role - superadmins go to /admin
            const { data: roleData } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id)
              .single();

            if (roleData?.role === "superadmin") {
              router.push("/admin");
              return;
            }

            // Default: go to dashboard
            router.push("/dashboard");
          } catch (error) {
            console.error("Error checking user status:", error);
            router.push("/onboarding");
          }
        }, 100);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router, isVerifyingEmail]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Validation
    if (signUpData.password !== signUpData.confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (signUpData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    try {
      // Call simplified signup API
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: signUpData.email,
          password: signUpData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      // Show success message - user needs to verify email first
      toast.success("Account Created!", {
        description: "Please check your email and click the verification link to continue.",
      });

      // Clear form and stay on auth page
      setSignUpData({ email: "", password: "", confirmPassword: "" });
    } catch (error: unknown) {
      console.error("Sign up error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create account";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Client not initialized");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInData.email,
        password: signInData.password,
      });

      if (error) throw error;

      toast.success("Welcome back!", {
        description: "Successfully signed in to your account.",
      });
    } catch (error: unknown) {
      console.error("Sign in error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sign in";
      if (errorMessage === "Email not confirmed") {
        setError(
          "Please check your email and click the verification link before signing in."
        );
      } else if (errorMessage === "Email logins are disabled") {
        setError(
          "Email authentication is currently disabled. Please contact support."
        );
      } else if (errorMessage === "Invalid login credentials") {
        setError(
          "Invalid email or password. Please check your credentials and try again."
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading screen while verifying email
  if (isVerifyingEmail) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="landing" />

        <div className="max-w-md mx-auto px-4 pt-20 pb-16">
          <Card className="card-professional">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                Verifying Your Email
              </h2>
              <p className="text-muted-foreground">
                Please wait while we verify your email address...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header variant="landing" />

      <div className="max-w-md mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 gradient-hero rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to AI-Powered CCM
          </h1>
          <p className="text-muted-foreground">Access your tender dashboard</p>
        </div>

        <Card className="card-professional">
          <CardHeader>
            <CardTitle className="text-center text-foreground">
              Account Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <TabsContent value="signin" className="space-y-4 mt-6">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="Enter your email"
                        value={signInData.email}
                        onChange={(e) =>
                          setSignInData({
                            ...signInData,
                            email: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="Enter your password"
                        value={signInData.password}
                        onChange={(e) =>
                          setSignInData({
                            ...signInData,
                            password: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full btn-cta"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing In..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-6">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="Enter your email"
                        value={signUpData.email}
                        onChange={(e) =>
                          setSignUpData({
                            ...signUpData,
                            email: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Create a password (min 6 characters)"
                        value={signUpData.password}
                        onChange={(e) =>
                          setSignUpData({
                            ...signUpData,
                            password: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-confirm"
                        type="password"
                        placeholder="Confirm your password"
                        value={signUpData.confirmPassword}
                        onChange={(e) =>
                          setSignUpData({
                            ...signUpData,
                            confirmPassword: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    After signing up, you&apos;ll verify your email and complete a quick profile setup.
                  </p>

                  <Button
                    type="submit"
                    className="w-full btn-cta"
                    disabled={isLoading}
                  >
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
