import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  useEffect(() => {
    fetchTaxonomies();
  }, []);

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
    } catch (error: any) {
      console.error("Error fetching taxonomies:", error);
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getLevel1 = () => taxonomies.filter((t) => t.level === 1);
  
  const getLevel2 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 2 && t.parent_id === parentId);
  
  const getLevel3 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 3 && t.parent_id === parentId);

  const getTaxonomyById = (id: string | null) =>
    taxonomies.find((t) => t.id === id);

  return {
    taxonomies,
    loading,
    getLevel1,
    getLevel2,
    getLevel3,
    getTaxonomyById,
    refetch: fetchTaxonomies,
  };
}
