import { z } from "zod";

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

export function toSkipTake(q: { page: number; limit: number }) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function buildOrderBy(
  q: { sortBy?: string; sortOrder: "asc" | "desc" },
  allowed: string[],
  fallback: string = "createdAt"
): Record<string, "asc" | "desc"> {
  const field = q.sortBy && allowed.includes(q.sortBy) ? q.sortBy : fallback;
  return { [field]: q.sortOrder };
}

export function paginated<T>(items: T[], total: number, q: { page: number; limit: number }) {
  return {
    items,
    meta: {
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };
}
