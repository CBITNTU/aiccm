"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import type { AdminCuratedMatchUpdate } from "@/lib/api/types";

/**
 * Curated matches for a company, as the superadmin console sees them: the
 * override alongside the real score it is standing in for.
 *
 * Admin-only — there is no user-facing equivalent, and there must not be one.
 */
export function useCuratedMatches(companyId: string | null) {
  return useQuery({
    queryKey: queryKeys.adminCuratedMatches(companyId!),
    queryFn: () => api.adminListCuratedMatches(companyId!),
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });
}

/**
 * Every mutation invalidates the company's curation list. It deliberately does
 * NOT invalidate the user-facing match queries: those live in a different
 * browser session, and the console's own preview refetches on its own.
 */
function useCurationMutation<TArgs, TResult>(
  companyId: string | null,
  mutationFn: (args: TArgs) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.adminCuratedMatches(companyId),
      });
      // The console previews the owner's real feed, so it has to reflect a
      // publish immediately or the admin can't tell whether it worked.
      queryClient.invalidateQueries({ queryKey: ["tenderMatches"] });
      queryClient.invalidateQueries({ queryKey: ["matchingResults"] });
    },
  });
}

export function useCreateCuratedMatch(companyId: string | null) {
  return useCurationMutation(companyId, (tenderIds: string[]) =>
    api.adminCreateCuratedMatch(companyId!, tenderIds),
  );
}

export function useUpdateCuratedMatch(companyId: string | null) {
  return useCurationMutation(
    companyId,
    ({ id, updates }: { id: string; updates: AdminCuratedMatchUpdate }) =>
      api.adminUpdateCuratedMatch(id, updates),
  );
}

export function usePublishCuratedMatch(companyId: string | null) {
  return useCurationMutation(
    companyId,
    ({ id, force }: { id: string; force?: boolean }) =>
      api.adminPublishCuratedMatch(id, { force }),
  );
}

export function useUnpublishCuratedMatch(companyId: string | null) {
  return useCurationMutation(companyId, (id: string) =>
    api.adminUnpublishCuratedMatch(id),
  );
}

export function useDeleteCuratedMatch(companyId: string | null) {
  return useCurationMutation(companyId, (id: string) =>
    api.adminDeleteCuratedMatch(id),
  );
}
