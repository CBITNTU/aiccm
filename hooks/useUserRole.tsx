"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { api } from "@/lib/api/client";

export const useUserRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    const fetchUserRole = async () => {
      if (authLoading) {
        setLoading(true);
        return;
      }

      if (!userId) {
        if (cancelled) return;
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await api.getUserRole();
        if (cancelled) return;
        setRole(data.role);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching user role:", error);
        setRole(null);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    void fetchUserRole();

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  const isAdmin = role === "superadmin";

  return { role, loading, isAdmin };
};
