"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useMyCompanies } from "@/hooks/useMyCompanies";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

type MembershipStatus = "owner" | "member" | "pending_join" | "pending_review";

interface CompanyWithMembership extends Company {
  membershipStatus?: MembershipStatus;
  joinRequestStatus?: string;
}

interface OrgContextType {
  selectedOrg: Company | null;
  companies: CompanyWithMembership[];
  pendingCompanies: CompanyWithMembership[];
  setSelectedOrg: (companyId: string) => void;
  isLoading: boolean;
  hasNoOrgs: boolean;
}

const OrgContext = createContext<OrgContextType>({
  selectedOrg: null,
  companies: [],
  pendingCompanies: [],
  setSelectedOrg: () => {},
  isLoading: true,
  hasNoOrgs: false,
});

const STORAGE_KEY = "selected-org-id";

const COMPANY_SCOPED_QUERY_PREFIXES = [
  "matchingResults",
  "savedTenders",
  "projects",
  "matchingProgress",
];

function isSelectableCompany(c: CompanyWithMembership): boolean {
  const status = c.membershipStatus;
  if (status === "pending_join" || status === "pending_review") return false;
  if (c.status === "pending_review") return false;
  return true;
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: rawCompanies, isLoading } = useMyCompanies(user?.id ?? null);

  const allCompanies = useMemo(
    () => (rawCompanies as unknown as CompanyWithMembership[]) ?? [],
    [rawCompanies],
  );

  const companies = useMemo(
    () => allCompanies.filter(isSelectableCompany),
    [allCompanies],
  );

  const pendingCompanies = useMemo(
    () => allCompanies.filter((c) => !isSelectableCompany(c)),
    [allCompanies],
  );

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  // Resolve the selected org object from the ID
  const selectedOrg = useMemo(() => {
    if (isLoading) return null;
    if (companies.length === 0) return null;

    // Try stored ID first
    if (selectedOrgId) {
      const found = companies.find((c) => c.id === selectedOrgId);
      if (found) return found;
    }

    // Fallback to first company
    return companies[0] ?? null;
  }, [companies, selectedOrgId, isLoading]);

  // Sync fallback ID to localStorage when stored ID is stale
  useEffect(() => {
    if (isLoading) return;
    if (companies.length === 0) {
      // No selectable companies — clear storage
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (selectedOrgId && companies.some((c) => c.id === selectedOrgId)) {
      // Stored ID is still valid
      return;
    }
    // Stored ID is stale, update to fallback
    const fallbackId = companies[0]?.id;
    if (fallbackId) {
      localStorage.setItem(STORAGE_KEY, fallbackId);
      queueMicrotask(() => setSelectedOrgId(fallbackId));
    }
  }, [companies, selectedOrgId, isLoading]);

  const setSelectedOrg = useCallback(
    (companyId: string) => {
      if (companyId === selectedOrgId) return;
      localStorage.setItem(STORAGE_KEY, companyId);
      setSelectedOrgId(companyId);

      // Invalidate company-scoped queries to avoid stale data
      for (const prefix of COMPANY_SCOPED_QUERY_PREFIXES) {
        queryClient.removeQueries({ queryKey: [prefix] });
      }
    },
    [selectedOrgId, queryClient],
  );

  const hasNoOrgs = !isLoading && companies.length === 0;

  const value = useMemo<OrgContextType>(
    () => ({
      selectedOrg,
      companies,
      pendingCompanies,
      setSelectedOrg,
      isLoading,
      hasNoOrgs,
    }),
    [selectedOrg, companies, pendingCompanies, setSelectedOrg, isLoading, hasNoOrgs],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  return useContext(OrgContext);
}
