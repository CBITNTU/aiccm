"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useSubmitVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, notes }: { companyId: string; notes?: string }) =>
      api.submitVerification(companyId, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.verificationStatus(variables.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.company(variables.companyId) });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
    },
  });
}
