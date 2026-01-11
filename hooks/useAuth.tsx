"use client";

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { User, Session, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

interface ProfileData {
  approval_status: string | null;
  onboarding_completed_at: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: ProfileData | null;
  isOnboarding: boolean;
  isPendingApproval: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  isOnboarding: false,
  isPendingApproval: false,
  signOut: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );

  // Initialize supabase client only on client side
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Clear any local storage
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      if (supabase) {
        await supabase.auth.signOut({ scope: "global" });
      }

      setUser(null);
      setSession(null);

      // Force full page reload to clear all state
      window.location.replace("/");
    } catch (error) {
      console.error("Error signing out:", error);
      // Still redirect even if there's an error
      window.location.replace("/");
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state change:", event, session?.user?.id);

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Handle sign out event specifically
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
      }
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Error getting initial session:", error);
        setSession(null);
        setUser(null);
      } else {
        console.log("Initial session:", session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Fetch profile data when user changes
  useEffect(() => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("profiles") as any)
          .select("approval_status, onboarding_completed_at")
          .eq("user_id", user.id)
          .single();

        if (error) {
          console.error("Error fetching profile:", error);
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
        setProfile(null);
      }
    };

    fetchProfile();
  }, [supabase, user]);

  // Computed flags for onboarding and pending approval states
  const isOnboarding = useMemo(() => {
    return !!user && !profile?.onboarding_completed_at;
  }, [user, profile]);

  const isPendingApproval = useMemo(() => {
    return !!user && !!profile?.onboarding_completed_at && profile?.approval_status === "pending";
  }, [user, profile]);

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, isOnboarding, isPendingApproval, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
