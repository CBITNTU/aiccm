"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Clock,
  CheckCircle2,
  Mail,
  RefreshCw,
  LogOut,
  Loader2,
  Building2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface PendingInfo {
  signupType: "individual" | "new-company" | "join-company" | "invited" | null;
  companyName: string | null;
  joinRequestStatus: string | null;
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pendingInfo, setPendingInfo] = useState<PendingInfo>({
    signupType: null,
    companyName: null,
    joinRequestStatus: null,
  });

  const supabase = createClient();

  const fetchPendingInfo = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth");
        return;
      }

      // Get profile info
      const { data: profile } = await supabase
        .from("profiles")
        .select("approval_status, signup_type")
        .eq("user_id", user.id)
        .single();

      if (profile?.approval_status === "approved") {
        router.push("/dashboard");
        return;
      }

      // Check for join request if applicable
      const { data: joinRequest } = await supabase
        .from("company_join_requests")
        .select("status, company_name_requested")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      setPendingInfo({
        signupType: profile?.signup_type || null,
        companyName: joinRequest?.company_name_requested || null,
        joinRequestStatus: joinRequest?.status || null,
      });
    } catch (error) {
      console.error("Error fetching pending info:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once on mount
  }, []);

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("user_id", user.id)
        .single();

      if (profile?.approval_status === "approved") {
        toast.success("Your account has been approved!");
        router.push("/dashboard");
      } else if (profile?.approval_status === "rejected") {
        toast.error("Your account application was not approved.");
        await supabase.auth.signOut();
        router.push("/auth?rejected=true");
      } else {
        toast.info("Your account is still pending approval.");
        await fetchPendingInfo();
      }
    } catch (error) {
      console.error("Error checking status:", error);
      toast.error("Failed to check status");
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  const getStatusMessage = () => {
    if (pendingInfo.signupType === "join-company") {
      if (pendingInfo.joinRequestStatus === "pending") {
        return {
          title: "Waiting for Company Approval",
          description: `Your request to join ${
            pendingInfo.companyName || "the company"
          } is being reviewed by the company administrator.`,
          icon: Building2,
          steps: [
            { label: "Account Created", completed: true },
            {
              label: "Company Admin Approval",
              completed: false,
              current: true,
            },
            { label: "Platform Admin Approval", completed: false },
          ],
        };
      } else if (pendingInfo.joinRequestStatus === "approved_by_admin") {
        return {
          title: "Awaiting Final Approval",
          description: `${
            pendingInfo.companyName || "The company"
          } has approved your request. Now waiting for platform administrator approval.`,
          icon: CheckCircle2,
          steps: [
            { label: "Account Created", completed: true },
            { label: "Company Admin Approval", completed: true },
            {
              label: "Platform Admin Approval",
              completed: false,
              current: true,
            },
          ],
        };
      }
    }

    return {
      title: "Account Pending Approval",
      description:
        "Your account is being reviewed by our team. This usually takes 1-2 business days.",
      icon: Clock,
      steps: [
        { label: "Account Created", completed: true },
        { label: "Platform Admin Review", completed: false, current: true },
        { label: "Access Granted", completed: false },
      ],
    };
  };

  const status = getStatusMessage();
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Card className="border-2">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <StatusIcon className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{status.title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {status.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Progress Steps */}
            <div className="py-4">
              <div className="flex items-center justify-between">
                {status.steps.map((step, index) => (
                  <div
                    key={index}
                    className="flex flex-col items-center flex-1"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        step.completed
                          ? "bg-primary text-primary-foreground"
                          : step.current
                            ? "bg-primary/20 text-primary border-2 border-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step.completed ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-xs mt-2 text-center ${
                        step.completed || step.current
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                    {index < status.steps.length - 1 && (
                      <div
                        className={`absolute h-0.5 w-full ${
                          step.completed ? "bg-primary" : "bg-muted"
                        }`}
                        style={{ display: "none" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Info Alert */}
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                We&apos;ll send you an email once your account has been
                reviewed. You can also check your status anytime using the
                button below.
              </AlertDescription>
            </Alert>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                onClick={handleCheckStatus}
                disabled={checking}
                className="flex-1"
              >
                {checking ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Check Status
              </Button>
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="flex-1"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>

            {/* Additional Info */}
            <div className="text-center text-sm text-muted-foreground pt-4 border-t">
              <p>
                Have questions? Contact us at{" "}
                <a
                  href="mailto:support@tndrx.com"
                  className="text-primary hover:underline"
                >
                  support@tndrx.com
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
