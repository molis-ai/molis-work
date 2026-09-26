import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkGoalReadOwnerSql, checkGoalQueryCapabilityAdapters } from "../scripts/check-package-boundaries.mjs";

test("Goal read guard covers actual root callers and rejects restored Policy, Risk and relation SQL", () => {
  for (const file of ["apps/desktop/launchers/web/server.ts", "apps/local-host/src/web-request.ts", "apps/local-host/src/goal-project-application.ts", "apps/desktop/launchers/mcp/server.ts", "apps/local-host/src/mcp-server.ts", "apps/mcp/src/tool-dispatch.ts", "apps/local-host/src/cli-project.ts", "apps/cli/src/command-dispatch.ts", "apps/local-host/src/feed-application.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.deepEqual(checkGoalReadOwnerSql(source), [], file);
    for (const sql of ["SELECT 1 FROM goals WHERE board_id = ? AND goal_id = ?", "SELECT * FROM policy_bindings", "SELECT risk_id, goal_id FROM goal_risks",
      "SELECT title FROM goal_relations r JOIN goals g ON g.goal_id = r.to_goal_id", "SELECT * FROM risks"]) {
      assert.match(checkGoalReadOwnerSql(`${source}\nstore.db.prepare(${JSON.stringify(sql)});`).join("\n"), /public Goals Query/);
    }
  }
});

test("typed Goal read adapters return the shared Action result, not a direct owner read", () => {
  const source = readFileSync(new URL("../apps/local-host/src/project-capabilities.ts", import.meta.url), "utf8");
  assert.deepEqual(checkGoalQueryCapabilityAdapters(source), []);
  for (const action of ["contract", "snapshot"]) {
    const direct = source.replace(`return goalAction(runtime, goalsActions.${action},`, `return runtime.goalQueries.${action}(`);
    assert.notEqual(direct, source);
    assert.match(checkGoalQueryCapabilityAdapters(direct).join("\n"), new RegExp(`goalsActions\\.${action}`));
    const wrongAction = source.replace(`return goalAction(runtime, goalsActions.${action},`, "return goalAction(runtime, goalsActions.list,");
    assert.notDeepEqual(checkGoalQueryCapabilityAdapters(wrongAction), []);
    const noReturn = source.replace(`return goalAction(runtime, goalsActions.${action},`, `// return goalAction(runtime, goalsActions.${action},`);
    assert.notDeepEqual(checkGoalQueryCapabilityAdapters(noReturn), []);
  }
});
