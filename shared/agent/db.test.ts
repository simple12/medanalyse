import { describe, expect, it } from "vitest";
import { isGraphDbConfigured, resolveDatabaseUrl, resetSqlCache } from "./db.js";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL then POSTGRES_URL", () => {
    resetSqlCache();
    expect(resolveDatabaseUrl({})).toBeUndefined();
    expect(
      resolveDatabaseUrl({ POSTGRES_URL: "postgres://a", DATABASE_URL: "postgres://b" }),
    ).toBe("postgres://b");
    expect(resolveDatabaseUrl({ POSTGRES_URL: "postgres://a" })).toBe("postgres://a");
    expect(isGraphDbConfigured({ DATABASE_URL: "  " })).toBe(false);
    expect(isGraphDbConfigured({ DATABASE_URL: "postgres://x" })).toBe(true);
  });
});
