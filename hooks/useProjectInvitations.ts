"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export type ProjectInvitation = Awaited<
  ReturnType<typeof api.getProjectInvitations>
>["invitations"][number];

export function useProjectInvitations(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.projectInvitations(userId!),
    queryFn: () => api.getProjectInvitations(),
    enabled: !!userId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useRespondToInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invitationId,
      action,
      message,
    }: {
      invitationId: string;
      action: "accept" | "reject";
      message?: string;
    }) => {
      return api.respondToProjectInvitation(invitationId, action, message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectInvitations"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
