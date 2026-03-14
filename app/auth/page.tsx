"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { isValidRedirectUrl } from "@/lib/utils/redirectUrl";

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const [signUpData, setSignUpData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
  });

  const [signupSuccessEmail, setSignupSuccessEmail] = useState<string | null>(
    null,
  );

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signUpData.email,
          password: signUpData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      setSignupSuccessEmail(signUpData.email);
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
    setError(null);
    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({
        email: signInData.email,
        password: signInData.password,
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to sign in");
      }

      toast.success("Welcome back!", {
        description: "Redirecting...",
      });

      const requestedRedirect = searchParams.get("redirectTo");
      const redirectTo = isValidRedirectUrl(requestedRedirect)
        ? requestedRedirect
        : null;
      const authRedirectPath = redirectTo
        ? `/auth?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/auth";

      window.location.assign(authRedirectPath);
    } catch (error: unknown) {
      console.error("Sign in error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sign in";
      if (errorMessage === "Email not confirmed" || errorMessage.includes("email") && errorMessage.includes("verified")) {
        setError(
          "Please check your email and click the verification link before signing in.",
        );
      } else if (
        errorMessage === "Invalid login credentials" ||
        errorMessage === "Invalid email or password"
      ) {
        setError(
          "Invalid email or password. Please check your credentials and try again.",
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (signupSuccessEmail) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="landing" />
        <div className="max-w-md mx-auto px-4 pt-20 pb-16">
          <Card className="card-professional">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mx-auto mb-4 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">Account Created!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-2">
                  We&apos;ve sent a verification link to:
                </p>
                <p className="font-medium text-foreground text-lg">
                  {signupSuccessEmail}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Next steps:
                </p>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Check your email inbox (and spam folder)</li>
                  <li>Click the verification link in the email</li>
                  <li>Complete your profile setup</li>
                </ol>
              </div>

              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm">
                <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-amber-800 dark:text-amber-200">
                  The verification link expires in 24 hours
                </span>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSignupSuccessEmail(null)}
              >
                Back to Sign In
              </Button>
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
            Welcome to TNDRX
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
                    After signing up, you&apos;ll verify your email and complete
                    a quick profile setup.
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
