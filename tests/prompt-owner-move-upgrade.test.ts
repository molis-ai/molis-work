// BL-b44-information-plan-to-feed (user 2026-11-21): the information plan's instruction moved from the Host's `system:information` to Feed.
// The original 1 → 2 step moves the edit, history and uses to Feed's key. M1-B2's 2 → 3 step seeds sync with the current keys.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { homeUpgradeDescriptors, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { bindDatabaseSpace, ensureStorageSpace, homeSqlitePath } from "@molis-ai/molis-work-storage";
import { FEED_INFORMATION_PLAN } from "@molis-ai/molis-work-plugin-feed";
import { upgradeTestHome, useDescriptors } from "./fixtures/home-upgrade-home.js";

const OLD = "system:information/information.plan", OTHER = "system:skills/skills.draft";
const NEW = `${FEED_INFORMATION_PLAN.owner_id}/${FEED_INFORMATION_PLAN.prompt_id}`;

const EDITED_BODY = `edited ${OLD}`;
const PATHS = [
  { from: 1, name: "v1 → v2 → v3", golden: "0.1.0", edits: [[OLD, EDITED_BODY], [OTHER, `edited ${OTHER}`]] },
  { from: 2, name: "main v2 → v3", golden: "0.1.0-dev.1", edits: [[OTHER, `edited ${OTHER}`]] },
] as const;

for (const { from, name, golden, edits } of PATHS) test(`BL-b44-information-plan-to-feed / AC-M1-04: ${name} preserves the edit and seeds prompt sync under Feed's key`, t => {
  const { home } = upgradeTestHome(t);
  const file = homeSqlitePath(home, "agent-definitions");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const seed = new DatabaseSync(file);
  try {
    seed.exec("PRAGMA journal_mode = DELETE;");
    seed.exec(readFileSync(new URL(`./fixtures/golden-homes/${golden}/stores/agent-definitions/agent-definitions.db.sql`, import.meta.url), "utf8"));
    assert.equal(seed.prepare("PRAGMA user_version").get()!.user_version, from);
    seed.exec("DELETE FROM molis_storage_space;");
    for (const [storedKey, body] of edits) {
      seed.prepare("INSERT INTO prompt_overrides(key,revision,base_version,body,updated_at,actor_id,default_ref) VALUES (?,2,2,?,'2026-11-20T00:00:00.000Z','me',NULL)").run(storedKey, body);
      for (const revision of [1, 2]) seed.prepare("INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id,default_ref) VALUES (?,?,'save',?,2,'2026-11-20T00:00:00.000Z','me',NULL)").run(storedKey, revision, `r${revision}`);
      seed.prepare("INSERT INTO prompt_uses(key,at,version,user_revision,caller,source_ref) VALUES (?,'2026-11-20T00:00:00.000Z',2,2,'plan',NULL)").run(storedKey);
    }
    bindDatabaseSpace(seed, ensureStorageSpace(home));
  } finally { seed.close(); }
  const descriptor = homeUpgradeDescriptors().find(entry => entry.pattern === "agent-definitions/agent-definitions.db");
  assert.ok(descriptor, "the prompt settings' own descriptor");
  useDescriptors(t, descriptor);

  const report = runHomeUpgrade(home);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.state, unit.from, unit.to]), [["agent-definitions/agent-definitions.db", "committed", from, 3]]);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const keys = (table: string) => db.prepare(`SELECT key, COUNT(*) AS rows FROM ${table} WHERE key IN (?, ?, ?) GROUP BY key ORDER BY key`).all(OLD, NEW, OTHER).map(row => [row.key, row.rows]);
    for (const [table, rows] of [["prompt_overrides", 1], ["prompt_history", 2], ["prompt_uses", 1]] as const) {
      assert.deepEqual(keys(table), [[NEW, rows], [OTHER, rows]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))), `${table}: the plan's rows are under Feed's key, the others untouched`);
    }
    assert.deepEqual({ ...db.prepare("SELECT revision, base_version, body FROM prompt_overrides WHERE key = ?").get(NEW) }, { revision: 2, base_version: 2, body: EDITED_BODY },
      "the edit itself is as the person left it");
    assert.deepEqual(
      db.prepare("SELECT key FROM personal_prompt_overrides_replica_changes ORDER BY key").all().map(row => row.key),
      db.prepare("SELECT key FROM prompt_overrides ORDER BY key").all().map(row => row.key),
      "the journal enqueues each existing override exactly once under its current key",
    );
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 3);
  } finally { db.close(); }
  assert.equal(FEED_INFORMATION_PLAN.version, 2, "Feed's instruction goes on from the Host's version, so the edit's base version still compares");
});
