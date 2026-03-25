"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

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

export function useAnalyzeCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: string) => api.analyzeCompany(companyId),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company(companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
