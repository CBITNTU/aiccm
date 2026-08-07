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
  /** Set while a superadmin is impersonating this user. */
  impersonatedBy: string | null;
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
  impersonatedBy: null,
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
  const { data: sessionData, isPending, refetch } = authClient.useSession();
  // Tracks whether the cross-navigation "UI ready" marker existed in
  // sessionStorage at mount, plus whether we've read it yet (avoids SSR
  // hydration mismatch on flags that depend on sessionStorage).
  const [storedReadyMarker, setStoredReadyMarker] = useState(false);
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
  const impersonatedBy =
    (session as { impersonatedBy?: string | null } | null)?.impersonatedBy ??
    null;
  const loading = isPending;

  // Profile now rides on the session response (via the customSession plugin),
  // so there's no separate fetch.
  const profile = useMemo<ProfileData | null>(() => {
    if (!user) return null;
    return sessionData?.profile ?? null;
  }, [user, sessionData?.profile]);

  // Profile + role resolve exactly when the session resolves.
  const profileLoading = loading;
  const userId = user?.id ?? null;

  // The session (carrying profile + role) is resolved once it's no longer
  // pending and we have a user.
  const hasResolvedInitialProfile = !loading && !!userId;
  // "Ready" if it was marked earlier this browser session, or it's ready now.
  const hasReadyUiInSession = storedReadyMarker || hasResolvedInitialProfile;

  // One-time hydration of the stored marker from sessionStorage on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from sessionStorage
    setStoredReadyMarker(readHasReadyUiInSession());
    setIsUiReadyHydrated(true);
  }, []);

  // Once the session resolves for a user, persist the marker so landing-page
  // navigations within this browser session skip the auth skeleton. Write-only
  // (external system) — no setState here.
  useEffect(() => {
    if (loading || !userId || typeof window === "undefined") return;
    sessionStorage.setItem(getAuthUiReadyKey(userId), "1");
  }, [loading, userId]);

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      await authClient.signOut();
      setStoredReadyMarker(false);
      setIsUiReadyHydrated(false);

      window.location.replace("/");
    } catch (error) {
      console.error("Error signing out:", error);
      window.location.replace("/");
    }
  }, []);

  // Re-fetch the session so the customSession plugin recomputes the embedded
  // profile/role (e.g. after the user completes an onboarding step).
  const refreshProfile = useCallback(async () => {
    try {
      await refetch();
    } catch (err) {
      console.error("Error refreshing profile:", err);
    }
  }, [refetch]);

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
        impersonatedBy,
        loading,
        profileLoading,
        hasResolvedInitialProfile,
        hasReadyUiInSession,
        isUiReadyHydrated,
        profile,
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
