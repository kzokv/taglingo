import type { D1Database } from "../fx/cloudflareInfrastructure";
import {
  normalizeMemberPreferences,
  type MemberPreferences,
  type MemberPreferenceStore,
  type MembershipStore
} from "./memberPreferencesApi";

interface MembershipRow {
  status: unknown;
  role: unknown;
}

interface MemberPreferenceRow {
  clerk_user_id: unknown;
  source_currency: unknown;
  target_currencies: unknown;
  manual_entry_promotion: unknown;
  focused_price_behavior: unknown;
}

export function createD1MembershipStore(
  database: D1Database
): MembershipStore {
  return {
    async find(userId) {
      const row = await database
        .prepare(
          `SELECT status, role
             FROM taglingo_memberships
            WHERE clerk_user_id = ?1`
        )
        .bind(userId)
        .first<MembershipRow>();
      if (
        !row ||
        (row.status !== "active" && row.status !== "suspended") ||
        (row.role !== "member" && row.role !== "administrator")
      ) {
        return null;
      }
      return { status: row.status, role: row.role };
    }
  };
}

function rowToMemberPreferences(
  row: MemberPreferenceRow | null,
  expectedUserId: string
): MemberPreferences | null {
  if (
    !row ||
    row.clerk_user_id !== expectedUserId ||
    typeof row.source_currency !== "string" ||
    typeof row.target_currencies !== "string"
  ) {
    return null;
  }
  let targets: unknown;
  try {
    targets = JSON.parse(row.target_currencies);
  } catch {
    return null;
  }
  const preferences: unknown = {
    ownerId: row.clerk_user_id,
    sourceCurrency: row.source_currency,
    targetCurrencies: targets,
    manualEntryPromotion: row.manual_entry_promotion,
    focusedPriceBehavior: row.focused_price_behavior
  };
  return normalizeMemberPreferences(preferences, expectedUserId);
}

export function createD1MemberPreferenceStore(
  database: D1Database
): MemberPreferenceStore {
  return {
    async find(userId) {
      const row = await database
        .prepare(
          `SELECT clerk_user_id, source_currency, target_currencies,
                  manual_entry_promotion, focused_price_behavior
             FROM member_preferences
            WHERE clerk_user_id = ?1`
        )
        .bind(userId)
        .first<MemberPreferenceRow>();
      return rowToMemberPreferences(row, userId);
    },

    async save(preferences) {
      const result = await database
        .prepare(
          `INSERT INTO member_preferences (
             clerk_user_id, source_currency, target_currencies,
             manual_entry_promotion, focused_price_behavior, updated_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
           ON CONFLICT(clerk_user_id) DO UPDATE SET
             source_currency = excluded.source_currency,
             target_currencies = excluded.target_currencies,
             manual_entry_promotion = excluded.manual_entry_promotion,
             focused_price_behavior = excluded.focused_price_behavior,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          preferences.ownerId,
          preferences.sourceCurrency,
          JSON.stringify(preferences.targetCurrencies),
          preferences.manualEntryPromotion,
          preferences.focusedPriceBehavior
        )
        .run();
      if (!result.success) {
        throw new Error("D1 did not persist the member preferences.");
      }
    }
  };
}
