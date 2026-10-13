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

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const transportSources = () => ({ cli: { dispatcher: read("apps/cli/src/command-dispatch.ts"), project: read("apps/local-host/src/cli-project.ts") },
  mcp: { dispatcher: read("apps/mcp/src/tool-dispatch.ts"), host: read("apps/local-host/src/mcp-v1-tool.ts") } });
/** The rule's answer for the real sources with one dispatcher or its Host composition edited. */
const changed = (part, edit) => {
  const all = transportSources();
  const next = part === "mcp" || part === "mcpHost" ? { ...all, mcp: { ...all.mcp, [part === "mcp" ? "dispatcher" : "host"]: edit(all.mcp[part === "mcp" ? "dispatcher" : "host"]) } }
    : { ...all, cli: { ...all.cli, [part]: edit(all.cli[part]) } };
  return checkGoalTransportCallers(next).join("\n");
};
const add = text => source => `${text}\n${source}`;

test("the CLI and management MCP call Goals' actions through the management caller the Host builds", () => {
  assert.deepEqual(checkGoalTransportCallers(transportSources()), []);
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
  // W3-07-4-01: management MCP has the same boundary; Runtime is handed no management port.
  assert.match(changed("mcp", source => source.replace(/McpManagementActions/g, "Other")), /tool-dispatch\.ts.*McpManagementActions/);
  assert.match(changed("mcp", add("const x = coordinator.goals;")), /tool-dispatch\.ts/);
});

test("W3-07-4-01: the MCP gate rejects typed or domain callers and requires three actual Goals action calls", () => {
  const goals = "@molis-ai/molis-work-plugin-goals";
  for (const code of [
    `import { initializeBoardCapability } from "${goals}";`,
    `import { goalTreeCapabilities } from "${goals}";`,
    `import { recordGoalUserDecisionCapability } from "${goals}";`,
    `import * as goals from "${goals}";`, `import goals from "${goals}";`, `import "${goals}";`,
    `import { initializeBoardCapability as goalsActions } from "${goals}";`,
    `export { initializeBoardCapability } from "${goals}";`, `export * from "${goals}";`,
    `const goals = await import("${goals}");`, `const goals = require("${goals}");`,
    `type Typed = import("${goals}").GoalTreeEntryApi;`, "const goals = await import(specifier);",
  ]) assert.match(changed("mcp", add(code)), /tool-dispatch\.ts/, code);
  for (const specifier of ["@molis-ai/molis-work-contracts/platform/app-host", "@molis-ai/molis-work-app-local-host",
    `${goals}/typed`, "./goal-event-commands.js", "./goal-tree-commands.js", "node:fs"]) {
    assert.match(changed("mcp", add(`import { anything } from "${specifier}";`)), /tool-dispatch\.ts.*imports/, specifier);
  }
  for (const code of ["const c = host.client(reference);", 'const c = host["client"](reference);', "const { client } = host;",
    "const c = host.actionClient(reference, false);", "const c = reader.withProject(reference);", "const c = reader.withScope(scope);",
    "let c: LocalHostProjectClient | undefined;", "const c = coordinator.goals.query;"]) {
    assert.match(changed("mcp", add(code)), /tool-dispatch\.ts.*Host client/, code);
  }
  assert.equal(changed("mcp", add('// No host.client(reference), withScope or coordinator.goals here.\nconst note = "LocalHostProjectClient";')), "");
  for (const action of ["initialize", "decide", "treeDecide"]) {
    const actual = `actions.invoke(goalsActions.${action},`;
    const source = transportSources().mcp.dispatcher;
    assert.ok(source.includes(actual), `${action} mutation reaches the production call`);
    assert.match(changed("mcp", text => text.replace(actual, "actions.invoke(goalsActions.list,")
      .concat(`\n// ${actual}\nconst note = ${JSON.stringify(actual)};`)), new RegExp(`goalsActions\\.${action}`));
  }
  assert.match(changed("mcp", text => text.replace("actions.invoke(goalsActions.initialize,", "actions.invoke(typed,")), /invoke must name a Goals action/);
});

test("W3-07-4-01 / W3-07-4-02: the MCP Host gate preserves the bound pre-open and gives only management its unprepared action port", () => {
  const bind = "bindGoalsManagementActions(caller.localHost.actionClient(reference, false), reference)";
  const preopen = "await caller.localHost.client(reference).withScope(() => undefined);";
  const dispatch = "dispatchMcpProjectTool(actions, name, arguments_,";
  const source = transportSources().mcp.host;
  for (const actual of [bind, preopen, dispatch]) assert.ok(source.includes(actual), "mutation reaches the production call");
  for (const [mutation, edit] of [
    ["wrong factory", text => text.replace("bindGoalsManagementActions(", "anotherFactory(")],
    ["factory from elsewhere", text => text.replace('from "./goals-actions.js"', 'from "./elsewhere.js"')],
    ["type-only factory", text => text.replace("import { bindGoalsManagementActions }", "import type { bindGoalsManagementActions }")],
    ["prepared client", text => text.replace("actionClient(reference, false)", "actionClient(reference, true)")],
    ["default preparation", text => text.replace("actionClient(reference, false)", "actionClient(reference)")],
    ["another Host", text => text.replace("caller.localHost.actionClient", "otherHost.actionClient")],
    ["another client reference", text => text.replace("actionClient(reference, false)", "actionClient(otherReference, false)")],
    ["another factory reference", text => text.replace(bind, bind.replace(", reference)", ", otherReference)"))],
    ["extra factory argument", text => text.replace(bind, `${bind.slice(0, -1)}, caller)`) ],
    ["missing reference", text => text.replace(bind, "bindGoalsManagementActions(caller.localHost.actionClient(reference, false))")],
    ["Runtime gets a port", text => text.replace('audience === "management"', 'audience === "runtime"')],
    ["every audience gets a port", text => text.replace(`audience === "management" ? ${bind} : null`, bind)],
    ["Runtime gets an object", text => text.replace(`${bind} : null`, `${bind} : {}`)],
    ["unused factory result", text => text.replace(dispatch, "dispatchMcpProjectTool(makeActions(), name, arguments_,")],
    ["typed route", text => text.replace("const actions =", "const extra = caller.localHost.client(reference);\n  const actions =")],
    ["second action client", text => text.replace("const actions =", "const extra = caller.localHost.actionClient(reference);\n  const actions =")],
    ["aliased typed route", text => text.replace("const actions =", "const { client: extra } = caller.localHost;\n  const actions =")],
    ["no pre-open", text => text.replace(preopen, `// ${preopen}`)],
    ["unawaited pre-open", text => text.replace(preopen, preopen.replace("await ", ""))],
    ["another pre-open reference", text => text.replace(preopen, preopen.replace("client(reference)", "client(otherReference)"))],
    ["another pre-open Host", text => text.replace(preopen, preopen.replace("caller.localHost", "otherHost"))],
    ["business IO in pre-open", text => text.replace(preopen, preopen.replace("undefined", "runtime.goalQueries.snapshot(reference)"))],
    ["typed invocation in scope", text => text.replace(preopen, preopen.replace("() => undefined", "project => project.invoke(initializeBoardCapability, input)"))],
    ["preparation in pre-open", text => text.replace(preopen, "await caller.localHost.withProject(reference, () => undefined);")],
    ["second typed scope", text => `${preopen}\n${text}`],
    ["pre-open after dispatch", text => text.replace(preopen, "").concat(`\n${preopen}`)],
  ]) {
    assert.notEqual(edit(source), source, mutation);
    assert.match(changed("mcpHost", edit), /mcp-v1-tool\.ts/, mutation);
  }
  assert.equal(changed("mcpHost", add('// client.withScope and coordinator.goals are not calls.\nconst note = "client(reference)";')), "");
});

test("the CLI boundary rule reads every way into the Goals package and into a Host client, not only a named import and one identifier", () => {
  const goals = "@molis-ai/molis-work-plugin-goals";
  // Anything of the Goals package other than `{ goalsActions }` is a typed entry the CLI must not hold, in whatever shape it is reached.
  const namespace = add(`import * as goals from "${goals}";\nconst typed = goals.initializeBoardCapability;`);
  assert.match(changed("dispatcher", namespace), /command-dispatch\.ts.*\* as goals/);
  assert.match(changed("dispatcher", add(`import goals from "${goals}";`)), /command-dispatch\.ts.*default import goals/);
  assert.match(changed("dispatcher", add(`import "${goals}";`)), /command-dispatch\.ts.*goalsActions/);
  assert.match(changed("dispatcher", add(`import { goalsActions, initializeBoardCapability } from "${goals}";`)), /command-dispatch\.ts.*initializeBoardCapability/);
  assert.match(changed("dispatcher", add(`import { initializeBoardCapability as goalsActions } from "${goals}";`)), /command-dispatch\.ts.*initializeBoardCapability/);
  for (const subpath of [`${goals}/typed`, `${goals}/dist/index.js`]) {
    assert.match(changed("dispatcher", add(`import { goalsActions } from "${subpath}";`)), new RegExp(`command-dispatch\\.ts.*${subpath.replace(/[/.]/g, "\\$&")}`), subpath);
  }
  assert.match(changed("dispatcher", add(`export { initializeBoardCapability } from "${goals}";`)), /command-dispatch\.ts.*re-export/);
  assert.match(changed("dispatcher", add(`export * from "${goals}";`)), /command-dispatch\.ts.*re-export/);
  assert.match(changed("dispatcher", add(`export * as everything from "${goals}";`)), /command-dispatch\.ts.*re-export/);
  assert.match(changed("dispatcher", add(`const goals = await import("${goals}");`)), /command-dispatch\.ts.*import\(\)/);
  assert.match(changed("dispatcher", add(`const goals = require("${goals}");`)), /command-dispatch\.ts.*require\(\)/);
  assert.match(changed("dispatcher", add(`type Typed = import("${goals}").GoalTreeEntryApi;`)), /command-dispatch\.ts.*import type/);
  assert.match(changed("dispatcher", add("const goals = await import(specifier);")), /command-dispatch\.ts.*string literal/);
  // The dispatcher reaches the action contract, goalsActions and its protocol file; another module is another way to a Host client.
  for (const specifier of ["@molis-ai/molis-work-contracts/platform/app-host", "@molis-ai/molis-work-local-host", "../../local-host/src/project-host.js", "./goal-tree-commands.js", "node:fs"]) {
    assert.match(changed("dispatcher", add(`import { anything } from "${specifier}";`)), new RegExp(`command-dispatch\\.ts.*imports ${specifier.replace(/[/.]/g, "\\$&")}`), specifier);
  }
  // A Host client is a Host client whatever the variable is called and however the property is spelled.
  for (const [name, code] of [
    ["client", "const c = host.client(reference);"],
    ["client", 'const c = host["client"](reference);'],
    ["client", "const { client } = host;"],
    ["actionClient", "const c = host.actionClient(reference, false);"],
    ["withProject", "const c = reader.withProject(reference);"],
    ["withScope", "const c = reader.withScope(scope);"],
    ["LocalHostProjectClient", "let c: LocalHostProjectClient | undefined;"],
    ["coordinator", "const c = coordinator.goals.query;"],
  ]) {
    assert.match(changed("dispatcher", add(code)), new RegExp(`command-dispatch\\.ts.*${name}`), code);
  }
  // A comment or a string that names them is not a caller.
  assert.equal(changed("dispatcher", add('// the CLI never calls host.client(reference) or client.withProject(reference)\nconst note = "coordinator.goals";')), "");
  // The snapshot is read through the action, not by a look-alike in a comment or a string.
  assert.match(changed("dispatcher", source => source.replace("goalsActions.snapshot", "goalsActions.list").concat('\n// goalsActions.snapshot\nconst note = "goalsActions.snapshot";')), /goalsActions\.snapshot/);

  // The Host side: the factory gets the client that does not prepare plugins and the very reference the command is bound to, and the dispatcher gets what it returned.
  const bind = "bindGoalsManagementActions(localHost.actionClient(reference, false), reference)";
  assert.ok(read("apps/local-host/src/cli-project.ts").includes(bind), "the real cli-project.ts holds the call these mutations edit");
  for (const [mutation, edit] of [
    ["a second argument that is not the reference", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference, false), otherReference)")],
    ["a second argument that is a copy of it", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference, false), { ...reference })")],
    ["a third argument", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference, false), reference, caller)")],
    ["no second argument", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference, false))")],
    ["a client opened for another reference", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(otherReference, false), reference)")],
    ["a client that prepares the plugins", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference, true), reference)")],
    ["a factory from somewhere else", source => source.replace('from "./goals-actions.js"', 'from "./elsewhere.js"')],
    ["a dispatcher given something other than the factory's result", source => source.replace("dispatchCliProjectCommand(actions, args, input)", "dispatchCliProjectCommand(localHost, args, input)")],
    ["a second route to the project through a Host client", source => source.replace("const actions =", "const extra = localHost.client(reference);\n  const actions =")],
    ["a factory result nobody uses", source => source.replace("dispatchCliProjectCommand(actions, args, input)", "dispatchCliProjectCommand(makeActions(), args, input)")],
  ]) {
    assert.match(changed("project", edit), /cli-project\.ts/, mutation);
  }
});
