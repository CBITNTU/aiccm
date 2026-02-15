"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { api } from "@/lib/api/client";

export const useUserRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (authLoading) return;

      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const data = await api.getUserRole();
        setRole(data.role);
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user, authLoading]);

  const isAdmin = role === "superadmin";

  return { role, loading, isAdmin };
};
