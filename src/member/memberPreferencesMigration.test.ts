import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(
  resolve(process.cwd(), "migrations/0002_member_preferences.sql"),
  "utf8"
);
const settingsMigration = readFileSync(
  resolve(
    process.cwd(),
    "migrations/0005_member_recognition_experience_settings.sql"
  ),
  "utf8"
);

function sqlite(script: string) {
  return spawnSync("sqlite3", [":memory:"], {
    encoding: "utf8",
    input: script
  });
}

describe("member recognition experience settings migration", () => {
  it("backfills safe defaults for existing member preference rows", () => {
    const result = sqlite(`
      ${baseMigration}
      INSERT INTO taglingo_memberships (clerk_user_id, status)
      VALUES ('user_member', 'active');
      INSERT INTO member_preferences (
        clerk_user_id, source_currency, target_currencies
      ) VALUES ('user_member', 'JPY', '["USD"]');
      ${settingsMigration}
      SELECT manual_entry_promotion, focused_price_behavior
      FROM member_preferences WHERE clerk_user_id = 'user_member';
    `);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("after-5-seconds|automatic");
  });

  it("enforces both settings as closed database enums", () => {
    const result = sqlite(`
      ${baseMigration}
      ${settingsMigration}
      INSERT INTO taglingo_memberships (clerk_user_id, status)
      VALUES ('user_member', 'active');
      INSERT INTO member_preferences (
        clerk_user_id, source_currency, target_currencies,
        manual_entry_promotion, focused_price_behavior
      ) VALUES (
        'user_member', 'JPY', '["USD"]', 'after-4-seconds', 'always-trust'
      );
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/constraint failed/i);
  });
});
