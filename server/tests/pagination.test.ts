import { describe, expect, it } from "vitest";
import { buildOrderBy, paginated, paginationQuery, toSkipTake } from "../src/utils/pagination";

describe("pagination query schema", () => {
  it("applies defaults", () => {
    const q = paginationQuery.parse({});
    expect(q).toMatchObject({ page: 1, limit: 20, sortOrder: "desc" });
  });

  it("coerces string params", () => {
    const q = paginationQuery.parse({ page: "3", limit: "50" });
    expect(q.page).toBe(3);
    expect(q.limit).toBe(50);
  });

  it("rejects out-of-range limits", () => {
    expect(() => paginationQuery.parse({ limit: "500" })).toThrow();
  });
});

describe("helpers", () => {
  it("computes skip/take", () => {
    expect(toSkipTake({ page: 3, limit: 25 })).toEqual({ skip: 50, take: 25 });
  });

  it("falls back to a safe sort field when sortBy is not allowed", () => {
    expect(buildOrderBy({ sortBy: "passwordHash", sortOrder: "asc" }, ["name"])).toEqual({
      createdAt: "asc",
    });
    expect(buildOrderBy({ sortBy: "name", sortOrder: "asc" }, ["name"])).toEqual({ name: "asc" });
  });

  it("builds pagination meta", () => {
    const r = paginated([1, 2], 45, { page: 2, limit: 20 });
    expect(r.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
  });
});
