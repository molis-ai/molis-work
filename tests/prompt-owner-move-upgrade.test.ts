// BL-b44-information-plan-to-feed (user 2026-11-21): the information plan's instruction moved from the Host's `system:information` to Feed.
// The prompt settings' upgrade (agent definitions 1 → 2) moves the person's edit, its history and its uses to the key Feed's instruction is
// read by, through the real upgrade process and the store's own descriptor; another prompt's rows stay where they are.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AGENT_DEFINITIONS_BASELINE, homeUpgradeDescriptors, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { bindDatabaseSpace, ensureStorageSpace, homeSqlitePath } from "@molis-ai/molis-work-storage";
import { FEED_INFORMATION_PLAN } from "@molis-ai/molis-work-plugin-feed";
import { upgradeTestHome, useDescriptors } from "./fixtures/home-upgrade-home.js";

const OLD = "system:information/information.plan", OTHER = "system:skills/skills.draft";
const NEW = `${FEED_INFORMATION_PLAN.owner_id}/${FEED_INFORMATION_PLAN.prompt_id}`;

test("BL-b44-information-plan-to-feed: the upgrade moves the person's edit of the information plan, with its history and uses, to Feed's key", t => {
  const { home } = upgradeTestHome(t);
  const file = homeSqlitePath(home, "agent-definitions");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const seed = new DatabaseSync(file);
  try {
    seed.exec(`PRAGMA journal_mode = DELETE; ${AGENT_DEFINITIONS_BASELINE.schema} PRAGMA user_version = 1;`);
    for (const key of [OLD, OTHER]) {
      seed.prepare("INSERT INTO prompt_overrides(key,revision,base_version,body,updated_at,actor_id,default_ref) VALUES (?,2,2,?,'2026-11-20T00:00:00.000Z','me',NULL)").run(key, `edited ${key}`);
      for (const revision of [1, 2]) seed.prepare("INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id,default_ref) VALUES (?,?,'save',?,2,'2026-11-20T00:00:00.000Z','me',NULL)").run(key, revision, `r${revision}`);
      seed.prepare("INSERT INTO prompt_uses(key,at,version,user_revision,caller,source_ref) VALUES (?,'2026-11-20T00:00:00.000Z',2,2,'plan',NULL)").run(key);
    }
    bindDatabaseSpace(seed, ensureStorageSpace(home));
  } finally { seed.close(); }
  const descriptor = homeUpgradeDescriptors().find(entry => entry.pattern === "agent-definitions/agent-definitions.db");
  assert.ok(descriptor, "the prompt settings' own descriptor");
  useDescriptors(t, descriptor);

  const report = runHomeUpgrade(home);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.state, unit.from, unit.to]), [["agent-definitions/agent-definitions.db", "committed", 1, 2]]);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const keys = (table: string) => db.prepare(`SELECT key, COUNT(*) AS rows FROM ${table} GROUP BY key ORDER BY key`).all().map(row => [row.key, row.rows]);
    for (const [table, rows] of [["prompt_overrides", 1], ["prompt_history", 2], ["prompt_uses", 1]] as const) {
      assert.deepEqual(keys(table), [[NEW, rows], [OTHER, rows]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))), `${table}: the plan's rows are under Feed's key, the others untouched`);
    }
    assert.deepEqual({ ...db.prepare("SELECT revision, base_version, body FROM prompt_overrides WHERE key = ?").get(NEW) }, { revision: 2, base_version: 2, body: `edited ${OLD}` },
      "the edit itself is as the person left it");
    assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  } finally { db.close(); }
  assert.equal(FEED_INFORMATION_PLAN.version, 2, "Feed's instruction goes on from the Host's version, so the edit's base version still compares");
});
