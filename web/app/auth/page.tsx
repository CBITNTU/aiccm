"use client";

import { useState, useEffect, useCallback } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Mail,
  Lock,
  User,
  AlertCircle,
  Search,
  CheckCircle,
  Clock,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";

interface CompanySearchResult {
  id: string;
  company_name: string;
  has_admin: boolean;
}

type SignupType = "individual" | "with-company";

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
    signupType: "individual" as SignupType,
    companyName: "",
    existingCompanyId: null as string | null,
    isNewCompany: false,
    joinMessage: "",
  });

  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
  });

  // Company search state
  const [companySearchResults, setCompanySearchResults] = useState<
    CompanySearchResult[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [selectedCompany, setSelectedCompany] =
    useState<CompanySearchResult | null>(null);

  // Signup success state
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupMessage, setSignupMessage] = useState("");

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
          // Check user approval status
          try {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("approval_status")
              .eq("user_id", session.user.id)
              .single();

            if (profileError) {
              console.error("Error checking profile:", profileError);
              router.push("/pending-approval");
              return;
            }

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

            // User is approved, check for company (owned or member)
            // Check if user owns any companies
            const { data: ownedCompanies } = await supabase
              .from("companies")
              .select("id")
              .eq("user_id", session.user.id);

            // Check if user is an approved member of any company
            const { data: memberCompanies } = await supabase
              .from("company_members")
              .select("company_id")
              .eq("user_id", session.user.id)
              .eq("status", "approved");

            const hasCompany =
              (ownedCompanies && ownedCompanies.length > 0) ||
              (memberCompanies && memberCompanies.length > 0);

            if (hasCompany) {
              router.push("/dashboard");
            } else {
              router.push("/profile");
            }
          } catch (error) {
            console.error("Error checking user status:", error);
            router.push("/profile");
          }
        }, 100);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  // Debounced company search
  const searchCompanies = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCompanySearchResults([]);
      setShowCompanyDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/search-companies?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();

      if (data.companies) {
        setCompanySearchResults(data.companies);
        setShowCompanyDropdown(true);
      }
    } catch (error) {
      console.error("Company search error:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce the search
  useEffect(() => {
    if (signUpData.signupType !== "with-company") return;

    const timer = setTimeout(() => {
      if (signUpData.companyName && !selectedCompany) {
        searchCompanies(signUpData.companyName);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    signUpData.companyName,
    signUpData.signupType,
    selectedCompany,
    searchCompanies,
  ]);

  const handleCompanySelect = (company: CompanySearchResult) => {
    setSelectedCompany(company);
    setSignUpData({
      ...signUpData,
      companyName: company.company_name,
      existingCompanyId: company.id,
      isNewCompany: false,
    });
    setShowCompanyDropdown(false);
  };

  const handleCompanyNameChange = (value: string) => {
    setSignUpData({
      ...signUpData,
      companyName: value,
      existingCompanyId: null,
      isNewCompany: false,
    });
    setSelectedCompany(null);
  };

  const handleCreateNewCompany = () => {
    setSignUpData({
      ...signUpData,
      existingCompanyId: null,
      isNewCompany: true,
    });
    setShowCompanyDropdown(false);
    setSelectedCompany(null);
  };

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

    if (
      signUpData.signupType === "with-company" &&
      !signUpData.companyName.trim()
    ) {
      setError("Please enter a company name");
      setIsLoading(false);
      return;
    }

    try {
      // Determine the actual signup type for the API
      let apiSignupType: "individual" | "new-company" | "join-company";

      if (signUpData.signupType === "individual") {
        apiSignupType = "individual";
      } else if (signUpData.existingCompanyId) {
        apiSignupType = "join-company";
      } else {
        apiSignupType = "new-company";
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: signUpData.email,
          password: signUpData.password,
          firstName: signUpData.firstName,
          lastName: signUpData.lastName,
          jobTitle: signUpData.jobTitle,
          signupType: apiSignupType,
          companyName: signUpData.companyName || undefined,
          existingCompanyId: signUpData.existingCompanyId || undefined,
          message: signUpData.joinMessage || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      // Show success state
      setSignupSuccess(true);
      setSignupMessage(data.message);

      toast.success("Account Created!", {
        description: "Please check your email for further instructions.",
      });
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

  // Show success screen after signup
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="landing" />

        <div className="max-w-md mx-auto px-4 pt-20 pb-16">
          <Card className="card-professional">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                Account Pending Approval
              </h2>
              <p className="text-muted-foreground mb-4">{signupMessage}</p>
              <div className="bg-muted p-4 rounded-lg text-left text-sm">
                <p className="font-medium mb-2">What happens next?</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>You&apos;ll receive a welcome email shortly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>
                      Our team will review your application within 24-48 hours
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>You&apos;ll be notified by email once approved</span>
                  </li>
                </ul>
              </div>
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => {
                  setSignupSuccess(false);
                  setSignUpData({
                    firstName: "",
                    lastName: "",
                    jobTitle: "",
                    email: "",
                    password: "",
                    confirmPassword: "",
                    signupType: "individual",
                    companyName: "",
                    existingCompanyId: null,
                    isNewCompany: false,
                    joinMessage: "",
                  });
                }}
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
                  {/* Signup Type Selection */}
                  <div className="space-y-3">
                    <Label>How would you like to sign up?</Label>
                    <RadioGroup
                      value={signUpData.signupType}
                      onValueChange={(value: SignupType) => {
                        setSignUpData({
                          ...signUpData,
                          signupType: value,
                          companyName: "",
                          existingCompanyId: null,
                          isNewCompany: false,
                        });
                        setSelectedCompany(null);
                        setCompanySearchResults([]);
                      }}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div>
                        <RadioGroupItem
                          value="individual"
                          id="signup-individual"
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor="signup-individual"
                          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                        >
                          <User className="mb-2 h-6 w-6" />
                          <span className="text-sm font-medium">
                            Individual
                          </span>
                          <span className="text-xs text-muted-foreground text-center mt-1">
                            Browse without company
                          </span>
                        </Label>
                      </div>
                      <div>
                        <RadioGroupItem
                          value="with-company"
                          id="signup-company"
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor="signup-company"
                          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                        >
                          <Building2 className="mb-2 h-6 w-6" />
                          <span className="text-sm font-medium">
                            With Company
                          </span>
                          <span className="text-xs text-muted-foreground text-center mt-1">
                            Join or create company
                          </span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Personal Information */}
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

                  {/* Company Field (conditional) */}
                  {signUpData.signupType === "with-company" && (
                    <div className="space-y-2">
                      <Label htmlFor="signup-company-name">Company Name</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="signup-company-name"
                          type="text"
                          placeholder="Search or enter company name"
                          value={signUpData.companyName}
                          onChange={(e) =>
                            handleCompanyNameChange(e.target.value)
                          }
                          onFocus={() => {
                            if (companySearchResults.length > 0) {
                              setShowCompanyDropdown(true);
                            }
                          }}
                          className="pl-10"
                          required
                        />
                        {isSearching && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                          </div>
                        )}
                      </div>

                      {/* Company Search Results Dropdown */}
                      {showCompanyDropdown &&
                        companySearchResults.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                            {companySearchResults.map((company) => (
                              <button
                                key={company.id}
                                type="button"
                                className="w-full px-4 py-2 text-left hover:bg-accent flex items-center justify-between"
                                onClick={() => handleCompanySelect(company)}
                              >
                                <span className="font-medium">
                                  {company.company_name}
                                </span>
                                {company.has_admin && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    Has members
                                  </span>
                                )}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="w-full px-4 py-2 text-left hover:bg-accent border-t text-primary font-medium"
                              onClick={handleCreateNewCompany}
                            >
                              + Create &quot;{signUpData.companyName}&quot; as
                              new company
                            </button>
                          </div>
                        )}

                      {/* Selected Company or New Company Status */}
                      {selectedCompany && (
                        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md text-sm text-blue-800 dark:text-blue-200">
                          <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span>
                            Joining existing company:{" "}
                            <strong>{selectedCompany.company_name}</strong>
                          </span>
                          <button
                            type="button"
                            className="ml-auto text-xs text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                            onClick={() => {
                              setSelectedCompany(null);
                              setSignUpData({
                                ...signUpData,
                                existingCompanyId: null,
                              });
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      )}

                      {signUpData.isNewCompany && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded-md text-sm text-green-800 dark:text-green-200">
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span>
                            Creating new company:{" "}
                            <strong>{signUpData.companyName}</strong>
                          </span>
                        </div>
                      )}

                      {/* Join Message (when joining existing company) */}
                      {selectedCompany && (
                        <div className="space-y-2 mt-3">
                          <Label htmlFor="signup-join-message">
                            Message to Company Admin (optional)
                          </Label>
                          <Textarea
                            id="signup-join-message"
                            placeholder="Introduce yourself or explain why you want to join..."
                            value={signUpData.joinMessage}
                            onChange={(e) =>
                              setSignUpData({
                                ...signUpData,
                                joinMessage: e.target.value,
                              })
                            }
                            rows={2}
                          />
                        </div>
                      )}
                    </div>
                  )}

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

                  {/* Approval Notice */}
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-md text-sm">
                    <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        Approval Required
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                        All new accounts require administrator approval before
                        access is granted.
                      </p>
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
