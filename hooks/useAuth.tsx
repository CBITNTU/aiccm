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
  profileLoading: boolean;
  hasResolvedInitialProfile: boolean;
  hasReadyUiInSession: boolean;
  isUiReadyHydrated: boolean;
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
  profileLoading: false,
  hasResolvedInitialProfile: false,
  hasReadyUiInSession: false,
  isUiReadyHydrated: false,
  profile: null,
  isOnboarding: false,
  isPendingApproval: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

const getAuthUiReadyKey = (userId: string) => `auth-ui-ready:${userId}`;
const AUTH_UI_READY_PREFIX = "auth-ui-ready:";

const readHasReadyUiInSession = () => {
  if (typeof window === "undefined") return false;

  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(AUTH_UI_READY_PREFIX)) {
      return true;
    }
  }

  return false;
};

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
  const [profileLoading, setProfileLoading] = useState(false);
  const [hasResolvedInitialProfile, setHasResolvedInitialProfile] =
    useState(false);
  const [hasReadyUiInSession, setHasReadyUiInSession] = useState(false);
  const [isUiReadyHydrated, setIsUiReadyHydrated] = useState(false);

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
  const userId = user?.id ?? null;

  const markInitialProfileResolved = useCallback((targetUserId: string | null) => {
    if (!targetUserId) return;

    setHasResolvedInitialProfile(true);
    setHasReadyUiInSession(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(getAuthUiReadyKey(targetUserId), "1");
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      if (!loading) {
        setHasResolvedInitialProfile(false);
      }
      setHasReadyUiInSession(readHasReadyUiInSession());
      setIsUiReadyHydrated(true);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const hasStoredReadyState =
      sessionStorage.getItem(getAuthUiReadyKey(userId)) === "1";
    setHasResolvedInitialProfile(hasStoredReadyState);
    setHasReadyUiInSession(readHasReadyUiInSession());
    setIsUiReadyHydrated(true);
  }, [loading, userId]);

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      await authClient.signOut();
      setProfile(null);
      setHasResolvedInitialProfile(false);
      setHasReadyUiInSession(false);
      setIsUiReadyHydrated(false);

      window.location.replace("/");
    } catch (error) {
      console.error("Error signing out:", error);
      window.location.replace("/");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    try {
      setProfileLoading(true);
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
    } finally {
      setProfileLoading(false);
      markInitialProfileResolved(user.id);
    }
  }, [markInitialProfileResolved, user]);

  // Fetch profile data when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    const abortController = new AbortController();

    const fetchProfile = async () => {
      try {
        setProfileLoading(true);
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
      } finally {
        if (!abortController.signal.aborted) {
          setProfileLoading(false);
          markInitialProfileResolved(user.id);
        }
      }
    };

    fetchProfile();

    return () => {
      abortController.abort();
    };
  }, [markInitialProfileResolved, user]);

  const isOnboarding = useMemo(() => {
    if (!user || !profile) return false;
    return !profile.onboardingCompletedAt;
  }, [user, profile]);

  const isPendingApproval = useMemo(() => {
    if (!user || !profile) return false;
    return !!profile.onboardingCompletedAt && profile.approvalStatus === "pending";
  }, [user, profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        profileLoading,
        hasResolvedInitialProfile,
        hasReadyUiInSession,
        isUiReadyHydrated,
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
