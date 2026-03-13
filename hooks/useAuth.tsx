"use client";

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { authClient } from "@/lib/auth-client";

interface ProfileData {
  approval_status: string | null;
  onboarding_completed_at: string | null;
  first_name: string | null;
  last_name: string | null;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const mountedRef = useRef(true);

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      await authClient.signOut();

      setUser(null);
      setSession(null);
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

  // Initialize auth state — Better Auth only
  useEffect(() => {
    mountedRef.current = true;

    const initAuth = async () => {
      try {
        const baSession = await authClient.getSession();
        if (baSession?.data?.user) {
          if (!mountedRef.current) return;
          const baUser = baSession.data.user;
          setUser({ id: baUser.id, email: baUser.email, emailVerified: !!baUser.emailVerified });
          setSession(baSession.data.session);
          setLoading(false);
          return;
        }
      } catch {
        // Session not found
      }

      if (mountedRef.current) {
        setUser(null);
        setSession(null);
        setLoading(false);
      }
    };

    initAuth();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch profile data when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null);
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
    return !!user && !profile?.onboarding_completed_at;
  }, [user, profile]);

  const isPendingApproval = useMemo(() => {
    return (
      !!user &&
      !!profile?.onboarding_completed_at &&
      profile?.approval_status === "pending"
    );
  }, [user, profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
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
