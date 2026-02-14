"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

export interface Taxonomy {
  id: string;
  name: string;
  parent_id: string | null;
  level: number;
  description: string | null;
}

export function useTaxonomies() {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTaxonomies = async () => {
    try {
      setLoading(true);
      const data = await api.getTaxonomies();
      setTaxonomies(data.taxonomies);
    } catch (error: unknown) {
      console.error("Error fetching taxonomies:", error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxonomies();
  }, []);

  const getLevel1 = () => taxonomies.filter((t) => t.level === 1);

  const getLevel2 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 2 && t.parent_id === parentId);

  const getLevel3 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 3 && t.parent_id === parentId);

  const getTaxonomyById = (id: string | null) =>
    taxonomies.find((t) => t.id === id);

  const refetch = async () => {
    await fetchTaxonomies();
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
