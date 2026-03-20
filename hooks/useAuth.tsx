"use client";

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { authClient } from "@/lib/auth-client";

interface ProfileData {
  approvalStatus: string | null;
  onboardingCompletedAt: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  session: unknown;
  loading: boolean;
  profile: ProfileData | null;
  isOnboarding: boolean;
  isPendingApproval: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  isOnboarding: false,
  isPendingApproval: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: sessionData, isPending } = authClient.useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const user = useMemo<AuthUser | null>(() => {
    const currentUser = sessionData?.user;
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      email: currentUser.email,
      emailVerified: !!currentUser.emailVerified,
    };
  }, [sessionData?.user]);

  const session = sessionData?.session ?? null;
  const loading = isPending;
  const activeProfile = user ? profile : null;

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      await authClient.signOut();
      setProfile(null);

      window.location.replace("/");
    } catch (error) {
      console.error("Error signing out:", error);
      window.location.replace("/");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      const res = await fetch("/api/profile/me");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error("Error refreshing profile:", err);
      setProfile(null);
    }
  }, [user]);

  // Fetch profile data when user changes
  useEffect(() => {
    if (!user) {
      return;
    }

    const abortController = new AbortController();

    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/profile/me", {
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) return;

        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error("Error fetching profile:", err);
        setProfile(null);
      }
    };

    fetchProfile();

    return () => {
      abortController.abort();
    };
  }, [user]);

  const isOnboarding = useMemo(() => {
    return !!user && !profile?.onboardingCompletedAt;
  }, [user, profile]);

  const isPendingApproval = useMemo(() => {
    return (
      !!user &&
      !!profile?.onboardingCompletedAt &&
      profile?.approvalStatus === "pending"
    );
  }, [user, profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        profile: activeProfile,
        isOnboarding,
        isPendingApproval,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
