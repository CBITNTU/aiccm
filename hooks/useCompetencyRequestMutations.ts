"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export function useSyncCapabilitiesWithReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, capabilityIds }: { companyId: string; capabilityIds: string[] }) =>
      api.syncCapabilities(companyId, capabilityIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["company", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["adminCompetencyRequests"] });
    },
  });
}
