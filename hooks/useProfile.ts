"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(userId!),
    queryFn: async () => {
      const data = await api.getProfile();
      return data.profile;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      firstName: string;
      lastName: string;
      jobTitle: string;
      phone: string;
    }) => api.updateProfile(data),
    onSuccess: (_result, variables) => {
      if (userId) {
        queryClient.setQueryData(
          queryKeys.profile(userId),
          (old: { firstName: string; lastName: string; jobTitle: string; phone: string; email: string } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              firstName: variables.firstName,
              lastName: variables.lastName,
              jobTitle: variables.jobTitle,
              phone: variables.phone,
            };
          },
        );
      }
      toast.success("Profile updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update profile");
    },
  });
}
