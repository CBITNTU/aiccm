import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user role:', error);
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
        console.error('Error fetching user role:', error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  // Check if user is superadmin
  const isAdmin = role === "superadmin";

  return { role, loading, isAdmin };
};