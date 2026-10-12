import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkGoalReadOwnerSql, checkGoalQueryCapabilityAdapters, checkGoalsTypedHostCallers, checkGoalTransportCallers } from "../scripts/check-package-boundaries.mjs";

test("Goal read guard covers actual root callers and rejects restored Policy and relation SQL", () => {
  for (const file of ["apps/desktop/launchers/web/server.ts", "apps/local-host/src/web-request.ts", "apps/local-host/src/goal-project-application.ts", "apps/desktop/launchers/mcp/server.ts", "apps/local-host/src/mcp-server.ts", "apps/mcp/src/tool-dispatch.ts", "apps/local-host/src/cli-project.ts", "apps/cli/src/command-dispatch.ts", "apps/local-host/src/feed-application.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.deepEqual(checkGoalReadOwnerSql(source), [], file);
    for (const sql of ["SELECT 1 FROM goals WHERE project_id = ? AND goal_id = ?", "SELECT * FROM policy_bindings",
      "SELECT title FROM goal_relations r JOIN goals g ON g.goal_id = r.to_goal_id", "SELECT * FROM acceptance_criteria"]) {
      assert.match(checkGoalReadOwnerSql(`${source}\nstore.db.prepare(${JSON.stringify(sql)});`).join("\n"), /public Goals Query/);
    }
  }
});

test("typed Goal read adapters return the shared Action result, not a direct owner read", () => {
  const source = readFileSync(new URL("../apps/local-host/src/project-capabilities.ts", import.meta.url), "utf8");
  assert.deepEqual(checkGoalQueryCapabilityAdapters(source), []);
  for (const action of ["snapshot"]) {
    const direct = source.replace(`return goalAction(runtime, goalsActions.${action},`, `return runtime.goalQueries.${action}(`);
    assert.notEqual(direct, source);
    assert.match(checkGoalQueryCapabilityAdapters(direct).join("\n"), new RegExp(`goalsActions\\.${action}`));
    const wrongAction = source.replace(`return goalAction(runtime, goalsActions.${action},`, "return goalAction(runtime, goalsActions.list,");
    assert.notDeepEqual(checkGoalQueryCapabilityAdapters(wrongAction), []);
    const noReturn = source.replace(`return goalAction(runtime, goalsActions.${action},`, `// return goalAction(runtime, goalsActions.${action},`);
    assert.notDeepEqual(checkGoalQueryCapabilityAdapters(noReturn), []);
  }
});

test("Host-internal callers reach the first-run Goal and the project guidance through Goals' actions, not the typed entries", () => {
  const production = (source, file = "apps/local-host/src/web-onboarding.ts") => [{ path: file, source }];
  assert.deepEqual(checkGoalsTypedHostCallers(production('import { goalsActions } from "@molis-ai/molis-work-plugin-goals";\nbindGoalsWebActions(client, reference).invoke(goalsActions.create, input);')), []);
  for (const name of ["createGoalIntentCapability", "readProjectGuidanceCapability"]) {
    for (const file of ["apps/local-host/src/web-onboarding.ts", "apps/local-host/src/agent-host-composition.ts", "apps/local-host/src/assistant/assistant-authority.ts", "plugins/native/coding/src/routes.ts"]) {
      const errors = checkGoalsTypedHostCallers(production(`import { ${name} } from "@molis-ai/molis-work-plugin-goals";\nclient.invoke(${name}, input);`, file));
      assert.match(errors.join("\n"), new RegExp(`${file}.*${name}`), `${name} in ${file}`);
    }
    // The Goals package defines them, the Host's project capabilities register them and the entry re-exports them, until the bridges go.
    for (const file of ["plugins/native/goals/src/goal-entry-contract.ts", "apps/local-host/src/project-capabilities.ts", "apps/local-host/src/index.ts"]) {
      assert.deepEqual(checkGoalsTypedHostCallers(production(`export const ${name} = {};`, file)), [], file);
    }
  }
  assert.deepEqual(checkGoalsTypedHostCallers(production("// createGoalIntentCapability was the typed first-run entry\nconst unrelated = 1;")), [], "a comment is not a caller");
});

test("the CLI calls Goals' actions through the management caller the Host builds, and the management MCP still uses the scoped Host client", () => {
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const sources = () => ({ cli: { dispatcher: read("apps/cli/src/command-dispatch.ts"), project: read("apps/local-host/src/cli-project.ts") }, mcp: read("apps/mcp/src/tool-dispatch.ts") });
  assert.deepEqual(checkGoalTransportCallers(sources()), []);
  const changed = (part, edit) => {
    const all = sources();
    const next = part === "mcp" ? { ...all, mcp: edit(all.mcp) } : { ...all, cli: { ...all.cli, [part]: edit(all.cli[part]) } };
    return checkGoalTransportCallers(next).join("\n");
  };
  const add = text => source => `${text}\n${source}`;
  // The dispatcher is handed the management port; it holds no Host client, no typed Goals descriptor and no domain port of its own.
  assert.match(changed("dispatcher", add('import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";')), /command-dispatch\.ts.*LocalHostProjectClient/);
  for (const name of ["initializeBoardCapability", "snapshotBoardCapability", "setActiveGoalCapability", "goalTreeCapabilities", "createGoalProposalClients"]) {
    assert.match(changed("dispatcher", add(`import { ${name} } from "@molis-ai/molis-work-plugin-goals";`)), new RegExp(`command-dispatch\\.ts.*${name}`), name);
  }
  assert.match(changed("dispatcher", source => source.replace(/CliManagementActions/g, "SomethingElse")), /management/);
  assert.match(changed("dispatcher", add("const x = client.withProject(reference);")), /withProject/);
  assert.match(changed("dispatcher", add("const x = coordinator.goals.query;")), /coordinator\.goals/);
  // The snapshot is read through Goals' own action, not another one and not by hand.
  assert.match(changed("dispatcher", source => source.replace("goalsActions.snapshot", "goalsActions.list")), /goalsActions\.snapshot/);
  // The Host side builds the caller with the factory, over the client that does not prepare the project's plugins.
  assert.match(changed("project", source => source.replace("bindGoalsManagementActions(", "somethingElse(")), /cli-project\.ts.*bindGoalsManagementActions/);
  assert.match(changed("project", source => source.replace("actionClient(reference, false)", "actionClient(reference)")), /cli-project\.ts.*actionClient\(reference, false\)/);
  assert.match(changed("project", source => source.replace("actionClient(reference, false)", "client(reference)")), /cli-project\.ts/);
  // The management MCP keeps the old rule until it moves too.
  assert.match(changed("mcp", source => source.replace(/LocalHostProjectClient/g, "Other")), /tool-dispatch\.ts.*scoped Host Client/);
  assert.match(changed("mcp", add("const x = coordinator.goals;")), /tool-dispatch\.ts/);
});
