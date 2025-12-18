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
import { Building2, Mail, Lock, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const router = useRouter();

  // Form states
  const [signUpData, setSignUpData] = useState({
    firstName: "",
    lastName: "",
    jobTitle: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
  });

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

  useEffect(() => {
    if (!supabase) return;

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth page - Auth state change:", event, session?.user?.id);
      if (event === "SIGNED_IN" && session) {
        // Add small delay to ensure any pending database operations complete
        setTimeout(async () => {
          // Check if user has a company to determine redirect destination
          try {
            const { data: companies, error } = await supabase
              .from("companies")
              .select("id, company_name")
              .eq("user_id", session.user.id);

            if (error) {
              console.error("Error checking user company:", error);
              router.push("/profile");
              return;
            }

            console.log(
              "Auth page - Company check for user:",
              session.user.id,
              "found companies:",
              companies?.length || 0
            );

            if (companies && companies.length > 0) {
              // Existing user with company, redirect to dashboard
              console.log(
                "Auth page - Existing user with company, redirecting to dashboard"
              );
              router.push("/dashboard");
            } else {
              // New user without company, redirect to profile to add company
              console.log(
                "Auth page - New user without company, redirecting to profile"
              );
              router.push("/profile");
            }
          } catch (error) {
            console.error("Error checking user company:", error);
            router.push("/profile");
          }
        }, 100);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Client not initialized");
      return;
    }
    setError(null);
    setIsLoading(true);

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
      const { data, error } = await supabase.auth.signUp({
        email: signUpData.email,
        password: signUpData.password,
        options: {
          data: {
            first_name: signUpData.firstName,
            last_name: signUpData.lastName,
            job_title: signUpData.jobTitle,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // Check if email confirmation is required
      if (data.user && !data.session) {
        toast.success("Please Check Your Email", {
          description:
            "We've sent you a confirmation link. Please check your email and click the link to activate your account.",
        });
      } else {
        toast.success("Account Created!", {
          description:
            "Welcome to AI-Powered CCM! You can now set up your company profile.",
        });
      }
    } catch (error: unknown) {
      console.error("Sign up error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create account";
      if (errorMessage === "Email logins are disabled") {
        setError(
          "Email authentication is currently disabled. Please contact support."
        );
      } else {
        setError(errorMessage);
      }
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
          "Please check your email and click the confirmation link before signing in."
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
                          setSignInData({ ...signInData, email: e.target.value })
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-firstname">First Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="signup-firstname"
                          type="text"
                          placeholder="First name"
                          value={signUpData.firstName}
                          onChange={(e) =>
                            setSignUpData({
                              ...signUpData,
                              firstName: e.target.value,
                            })
                          }
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-lastname">Last Name</Label>
                      <Input
                        id="signup-lastname"
                        type="text"
                        placeholder="Last name"
                        value={signUpData.lastName}
                        onChange={(e) =>
                          setSignUpData({
                            ...signUpData,
                            lastName: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-jobtitle">Job Title / Role</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-jobtitle"
                        type="text"
                        placeholder="e.g. CEO, Manager, Engineer"
                        value={signUpData.jobTitle}
                        onChange={(e) =>
                          setSignUpData({
                            ...signUpData,
                            jobTitle: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

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
                        placeholder="Create a password"
                        value={signUpData.password}
                        onChange={(e) =>
                          setSignUpData({
                            ...signUpData,
                            password: e.target.value,
                          })
                        }
                        className="pl-10"
                        required
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
