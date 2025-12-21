"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const useUserRole = () => {
  const { user } = useAuth();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user || !supabase) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // Fetch all roles for the user (they might have multiple)
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (error) {
          console.error("Error fetching user role:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
          setRole(null);
        } else {
          const roles = data || [];
          // Find superadmin role (takes precedence)
          const superadminRole = roles.find(r => r.role === 'superadmin');
          const smeOwnerRole = roles.find(r => r.role === 'sme-owner');
          
          // Set the primary role (superadmin takes precedence)
          if (superadminRole) {
            setRole(superadminRole.role);
          } else if (smeOwnerRole) {
            setRole(smeOwnerRole.role);
          } else {
            setRole(roles[0]?.role || null);
          }
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user, supabase]);

  // Check if user is superadmin
  const isAdmin = role === "superadmin";

  return { role, loading, isAdmin };
};

