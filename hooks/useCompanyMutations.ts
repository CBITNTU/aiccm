"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

/**
 * The logo appears on the profile hero, the org switcher, directory cards and
 * the dashboard, so a change has to invalidate all of them — a stale avatar in
 * the switcher after an upload reads as a failed save.
 */
function invalidateCompanyLogo(queryClient: QueryClient, companyId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.company(companyId) });
  queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
  queryClient.invalidateQueries({ queryKey: ["directory"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      updates,
    }: {
      companyId: string;
      updates: Record<string, unknown>;
    }) => api.updateCompany(companyId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company(variables.companyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.verificationStatus(variables.companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSubmitChangesForReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      notes,
    }: {
      companyId: string;
      notes?: string;
    }) => api.submitChangesForReview(companyId, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company(variables.companyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.verificationStatus(variables.companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
    },
  });
}

export function useDiscardPendingChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: string) => api.discardPendingChanges(companyId),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company(companyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.verificationStatus(companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
    },
  });
}

export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, file }: { companyId: string; file: File }) =>
      api.uploadCompanyLogo(companyId, file),
    onSuccess: (_, variables) => invalidateCompanyLogo(queryClient, variables.companyId),
  });
}

export function useDeleteCompanyLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: string) => api.deleteCompanyLogo(companyId),
    onSuccess: (_, companyId) => invalidateCompanyLogo(queryClient, companyId),
  });
}

export function useDiscoverCompanyLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: string) => api.discoverCompanyLogo(companyId),
    // Only invalidate when something actually changed — a "no logo found"
    // result is a successful request that wrote nothing.
    onSuccess: (result, companyId) => {
      if (result.ok) invalidateCompanyLogo(queryClient, companyId);
    },
  });
}

export function useAnalyzeCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: string) => api.analyzeCompany(companyId),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company(companyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyCapabilities(companyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyMarkets(companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
