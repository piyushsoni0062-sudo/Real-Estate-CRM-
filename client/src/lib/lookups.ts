import { useQuery } from "@tanstack/react-query";
import { api, ApiResponse, Paginated } from "./api";
import type { Option, Stage, TeamUser, Project } from "./types";

export function useLeadStatuses() {
  return useQuery({
    queryKey: ["lead-statuses"],
    queryFn: async () =>
      (await api.get<ApiResponse<Option[]>>("/settings/lead-statuses")).data.data,
    staleTime: 5 * 60_000,
  });
}

export function useLeadSources() {
  return useQuery({
    queryKey: ["lead-sources"],
    queryFn: async () =>
      (await api.get<ApiResponse<Option[]>>("/settings/lead-sources")).data.data,
    staleTime: 5 * 60_000,
  });
}

export function usePipelineStages() {
  return useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: async () => {
      const stages = (await api.get<ApiResponse<Array<Stage & { leads: unknown[] }>>>("/pipeline"))
        .data.data;
      return stages.map(({ leads: _leads, ...s }) => s as Stage);
    },
    staleTime: 5 * 60_000,
  });
}

/** Active users for assignee pickers. */
export function useUsersList() {
  return useQuery({
    queryKey: ["users-list"],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Paginated<TeamUser>>>("/users", {
          params: { limit: 100, active: true, sortBy: "name", sortOrder: "asc" },
        })
      ).data.data.items,
    staleTime: 5 * 60_000,
  });
}

export function useProjectsList() {
  return useQuery({
    queryKey: ["projects-list"],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Paginated<Project>>>("/projects", {
          params: { limit: 100, sortBy: "name", sortOrder: "asc" },
        })
      ).data.data.items,
    staleTime: 5 * 60_000,
  });
}
