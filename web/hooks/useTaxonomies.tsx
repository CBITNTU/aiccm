"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface Taxonomy {
  id: string;
  name: string;
  parent_id: string | null;
  level: number;
  description: string | null;
}

export function useTaxonomies() {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize supabase client
  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  // Fetch taxonomies
  useEffect(() => {
    if (!supabase) return;

    const fetchTaxonomies = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("taxonomies")
          .select("*")
          .order("level", { ascending: true })
          .order("name", { ascending: true });

        if (error) throw error;
        setTaxonomies(data || []);
      } catch (error: unknown) {
        console.error("Error fetching taxonomies:", error);
        toast.error("Failed to load categories");
      } finally {
        setLoading(false);
      }
    };

    fetchTaxonomies();
  }, [supabase]);

  const getLevel1 = () => taxonomies.filter((t) => t.level === 1);

  const getLevel2 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 2 && t.parent_id === parentId);

  const getLevel3 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 3 && t.parent_id === parentId);

  const getTaxonomyById = (id: string | null) =>
    taxonomies.find((t) => t.id === id);

  const refetch = async () => {
    if (!supabase) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("taxonomies")
        .select("*")
        .order("level", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setTaxonomies(data || []);
    } catch (error: unknown) {
      console.error("Error fetching taxonomies:", error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  return {
    taxonomies,
    loading,
    getLevel1,
    getLevel2,
    getLevel3,
    getTaxonomyById,
    refetch,
  };
}
