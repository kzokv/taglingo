import { describe, expect, it, vi } from "vitest";

import type {
  D1Database,
  D1PreparedStatement
} from "../fx/cloudflareInfrastructure";
import {
  createD1MemberPreferenceStore,
  createD1MembershipStore
} from "./cloudflareMemberInfrastructure";

function statement(overrides: Partial<D1PreparedStatement> = {}) {
  const result: D1PreparedStatement = {
    bind: vi.fn(() => result),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true }),
    ...overrides
  };
  return result;
}

describe("Cloudflare member infrastructure", () => {
  it("reads membership status without consulting preference data", async () => {
    const select = statement({
      first: vi.fn().mockResolvedValue({ status: "active" })
    });
    const database: D1Database = {
      prepare: vi.fn().mockReturnValue(select)
    };

    await expect(
      createD1MembershipStore(database).findStatus("user_member")
    ).resolves.toBe("active");
    expect(select.bind).toHaveBeenCalledWith("user_member");
    expect(vi.mocked(database.prepare).mock.calls[0][0]).toContain(
      "taglingo_memberships"
    );
    expect(vi.mocked(database.prepare).mock.calls[0][0]).not.toContain(
      "member_preferences"
    );
  });

  it("maps and saves member preferences by stable Clerk user ID", async () => {
    const select = statement({
      first: vi.fn().mockResolvedValue({
        clerk_user_id: "user_member",
        source_currency: "JPY",
        target_currencies: '["USD","TWD","EUR"]'
      })
    });
    const upsert = statement();
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(select)
        .mockReturnValueOnce(upsert)
    };
    const store = createD1MemberPreferenceStore(database);

    const preferences = await store.find("user_member");
    expect(preferences).toEqual({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD", "TWD", "EUR"]
    });

    await store.save(preferences!);
    expect(upsert.bind).toHaveBeenCalledWith(
      "user_member",
      "JPY",
      '["USD","TWD","EUR"]'
    );
  });
});
