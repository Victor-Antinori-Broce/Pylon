import { describe, it, expect, mock, afterAll } from "bun:test";

/**
 * Un id de dataset REAL, no `"ds-1"`.
 *
 * `checkDatasetReadAccess` rechaza lo que no sea UUID antes de consultar,
 * porque entregarle un texto cualquiera a Postgres provoca
 * `invalid input syntax for type uuid` — un 500 donde corresponde denegar.
 * Con un id de fantasia estas pruebas ejercitaban un camino que en produccion
 * no existe.
 */
const DATASET_ID = "11111111-1111-4111-8111-111111111111";

function createMockFn(defaultImpl?: (...args: any[]) => any) {
  let impl = defaultImpl;
  const calls: any[][] = [];
  const fn = (...args: any[]) => {
    calls.push(args);
    return impl ? impl(...args) : undefined;
  };
  (fn as any).mock = { calls };
  (fn as any).mockReset = () => {
    calls.length = 0;
    impl = defaultImpl;
  };
  (fn as any).mockResolvedValue = (v: any) => {
    impl = () => Promise.resolve(v);
  };
  return fn as any;
}

const dbSelectLimit = createMockFn(() => Promise.resolve([]));

mock.module("../db", () => ({
  mergedSchema: {},
  db: {
    select: () => ({
      from: (table: any) => ({
        where: (cond: any) => ({
          limit: dbSelectLimit,
        }),
      }),
    }),
  },
}));

mock.module("../lib/rls-builder", () => ({
  checkReadAccess: (_policy: any, _user: any) => true,
  checkWriteAccess: (_policy: any, _user: any) => true,
}));

import {
  checkDatasetReadAccess,
  checkDatasetWriteAccess,
  resolveEntryStatus,
} from "../middleware/permissions";

afterAll(() => {
  mock.restore();
});

function createMockContext(user?: any) {
  const vars = new Map<string, any>();
  if (user) vars.set("user", user);
  return {
    get: (k: string) => vars.get(k),
    set: (k: string, v: any) => vars.set(k, v),
  } as any;
}

describe("permissions", () => {
  it("resolveEntryStatus returns published when no workflow", () => {
    expect(resolveEntryStatus(null)).toBe("published");
    expect(resolveEntryStatus(undefined)).toBe("published");
    expect(resolveEntryStatus({})).toBe("published");
  });

  it("resolveEntryStatus returns draft when requireApproval is true", () => {
    expect(resolveEntryStatus({ requireApproval: true })).toBe("draft");
  });

  it("checkDatasetReadAccess returns false when dataset not found", async () => {
    dbSelectLimit.mockResolvedValue([]);
    const c = createMockContext();
    const result = await checkDatasetReadAccess(c, DATASET_ID);
    expect(result).toBe(false);
  });

  it("checkDatasetReadAccess delegates to rlsCheckRead", async () => {
    dbSelectLimit.mockResolvedValue([{ policyJson: { readAccess: "public" } }]);
    const c = createMockContext({ id: "user-1", role: "user" });
    const result = await checkDatasetReadAccess(c, DATASET_ID);
    expect(result).toBe(true);
  });

  it("checkDatasetWriteAccess returns false when dataset not found", async () => {
    dbSelectLimit.mockResolvedValue([]);
    const c = createMockContext();
    const result = await checkDatasetWriteAccess(c, DATASET_ID);
    expect(result).toBe(false);
  });

  it("checkDatasetWriteAccess delegates to rlsCheckWrite", async () => {
    dbSelectLimit.mockResolvedValue([{ policyJson: { writeAccess: "authenticated" } }]);
    const c = createMockContext({ id: "user-1", role: "user" });
    const result = await checkDatasetWriteAccess(c, DATASET_ID);
    expect(result).toBe(true);
  });
});
