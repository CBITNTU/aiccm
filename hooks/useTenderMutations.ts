"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useToggleBookmark(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      resultId,
      isBookmarked,
    }: {
      resultId: string;
      isBookmarked: boolean;
    }) => api.toggleBookmark(resultId, isBookmarked),
    onSuccess: () => {
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: ["matchingResults", companyId],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.savedTenders(companyId),
        });
      }
    },
  });
}

export function useDeleteMatchingResult(companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resultId: string) => api.deleteMatchingResult(resultId),
    onSuccess: () => {
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: ["matchingResults", companyId],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.savedTenders(companyId),
        });
      }
    },
  });
}
