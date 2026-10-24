import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkGoalReadOwnerSql, checkNoGoalTypedAdapters, checkGoalTransportCallers, WEB_DISPATCH_FILES } from "../scripts/check-package-boundaries.mjs";

test("Goal read guard covers actual root callers and rejects restored Policy and relation SQL", () => {
  for (const file of ["apps/desktop/launchers/web/server.ts", ...WEB_DISPATCH_FILES, "apps/local-host/src/goal-project-application.ts", "apps/desktop/launchers/mcp/server.ts", "apps/local-host/src/mcp-server.ts", "apps/mcp/src/tool-dispatch.ts", "apps/local-host/src/cli-project.ts", "apps/cli/src/command-dispatch.ts", "apps/local-host/src/feed-application.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.deepEqual(checkGoalReadOwnerSql(source), [], file);
    for (const sql of ["SELECT 1 FROM goals WHERE project_id = ? AND goal_id = ?", "SELECT * FROM policy_bindings",
      "SELECT title FROM goal_relations r JOIN goals g ON g.goal_id = r.to_goal_id", "SELECT * FROM acceptance_criteria"]) {
      assert.match(checkGoalReadOwnerSql(`${source}\nstore.db.prepare(${JSON.stringify(sql)});`).join("\n"), /public Goals Query/);
    }
  }
});

test("W3-07-5-01 / W3-07-9-01: no production definition, export, registration or caller restores a Goals typed adapter", () => {
  const production = (source, path = "apps/local-host/src/project-capabilities.ts") => [{ path, source }];
  const files = ["apps/local-host/src/project-capabilities.ts", "apps/local-host/src/index.ts", "plugins/native/goals/src/index.ts",
    "plugins/native/goals/src/goal-entry-contract.ts", "plugins/native/goals/src/goal-tree-contract.ts", "plugins/native/goals/src/management-evidence.ts",
    "packages/contracts/src/modules/goals.ts", "plugins/native/coding/src/manifest.ts", "plugins/native/coding/src/goal-context.ts", "plugins/native/coding/src/routes.ts"];
  for (const file of files) assert.deepEqual(checkNoGoalTypedAdapters(production(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), file)), []);
  const goals = "@molis-ai/molis-work-plugin-goals";
  for (const mutation of [
    `import { snapshotBoardCapability as read } from "${goals}"; reader.invoke(read, input);`,
    `import * as goals from "${goals}"; reader.invoke(goals["snapshotBoardCapability"], input);`,
    `export { goalTreeCapabilities as tree } from "${goals}";`,
    `export * from "./proposal-capabilities.js";`,
    `const module = await import("./board-entry-capabilities.js");`,
    `const modulePath = "./goal-event-entry-capabilities.js"; const module = require(modulePath);`,
    `type Entry = import("${goals}").GoalTreeEntryApi;`,
    `host.register({ capability_id: "io.molis.work.local-host.board.snapshot", version: 1 }, read);`,
    `const entry = { capability_id: "io.molis.work.goals." + "events.decide", version: 1 }; reader.invoke(entry, input);`,
    'import { goalContextCapabilities as context } from "@molis-ai/molis-work-contracts/modules/goals"; reader.invoke(context.read, input);',
    'export { goalProgressCapabilities as progress } from "@molis-ai/molis-work-contracts/modules/goals";',
    'type Actor = import("@molis-ai/molis-work-contracts/modules/goals").GoalProgressActor;',
    ...["goals.context.list.v1", "goals.context.read.v1", "goals.progress.record.v1", "goals.progress.receipt.v1"].map(id =>
      `host.register({ capability_id: ${JSON.stringify(id)}, version: 1, operation: "query" }, read);`),
    'const entry = { capability_id: "goals.progress." + "record.v1", version: 1 }; reader.invoke(entry, input);',
  ]) {
    const original = readFileSync(new URL("../apps/local-host/src/project-capabilities.ts", import.meta.url), "utf8");
    assert.match(checkNoGoalTypedAdapters(production(`${original}\n${mutation}`)).join("\n"), /retired Goals typed adapter/, mutation);
  }
  assert.match(checkNoGoalTypedAdapters(production("export const unrelated = 1;", "plugins/native/goals/src/board-entry-capabilities.ts")).join("\n"), /retired/);
  assert.deepEqual(checkNoGoalTypedAdapters(production("// snapshotBoardCapability and io.molis.work.local-host.board.snapshot are retired.\nconst unrelated = 1;")), []);
  for (const mutation of ['import { pluginDevelopmentCapability as run } from "@molis-ai/molis-work-contracts/platform/tooling";',
    'host.register({ capability_id: "io.molis.work.local-host.plugin.development", version: 1, operation: "command" }, execute);',
    'const id = "io.molis.work.local-host.plugin." + "development"; client.invoke({ capability_id: id, version: 1 }, input);']) {
    assert.match(checkNoGoalTypedAdapters(production(mutation)).join("\n"), /retired private development protocol/);
  }
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
    assert.match(changed("dispatcher", add(`import { ${name} } from "@molis-ai/molis-work-contracts/modules/goal-actions";`)), new RegExp(`command-dispatch\\.ts.*${name}`), name);
  }
  assert.match(changed("dispatcher", source => source.replace(/CliManagementActions/g, "SomethingElse")), /management/);
  assert.match(changed("dispatcher", add("const x = client.withProject(reference);")), /withProject/);
  assert.match(changed("dispatcher", add("const x = coordinator.goals.query;")), /coordinator\.goals/);
  // The snapshot is read through Goals' own action, not another one and not by hand.
  assert.match(changed("dispatcher", source => source.replace("goalEntryActions.snapshot", "goalEntryActions.list")), /goalEntryActions\.snapshot/);
  // The Host side builds the caller with the factory, over the client that does not prepare the project's plugins.
  assert.match(changed("project", source => source.replace("bindGoalsManagementActions(", "somethingElse(")), /cli-project\.ts.*bindGoalsManagementActions/);
  assert.match(changed("project", source => source.replace("actionClient(reference, false)", "actionClient(reference)")), /cli-project\.ts.*actionClient\(reference, false\)/);
  assert.match(changed("project", source => source.replace("actionClient(reference, false)", "client(reference)")), /cli-project\.ts/);
  // W3-07-4-01: management MCP has the same boundary; Runtime is handed no management port.
  assert.match(changed("mcp", source => source.replace(/McpManagementActions/g, "Other")), /tool-dispatch\.ts.*McpManagementActions/);
  assert.match(changed("mcp", add("const x = coordinator.goals;")), /tool-dispatch\.ts/);
});

test("W3-07-4-01: the MCP gate rejects typed or domain callers and requires three actual Goals action calls", () => {
  const goals = "@molis-ai/molis-work-contracts/modules/goal-actions";
  for (const code of [
    `import { initializeBoardCapability } from "${goals}";`,
    `import { goalTreeCapabilities } from "${goals}";`,
    `import { recordGoalUserDecisionCapability } from "${goals}";`,
    `import * as goals from "${goals}";`, `import goals from "${goals}";`, `import "${goals}";`,
    `import { initializeBoardCapability as goalEntryActions } from "${goals}";`,
    `export { initializeBoardCapability } from "${goals}";`, `export * from "${goals}";`,
    `const goals = await import("${goals}");`, `const goals = require("${goals}");`,
    `type Typed = import("${goals}").GoalTreeEntryApi;`, "const goals = await import(specifier);",
  ]) assert.match(changed("mcp", add(code)), /tool-dispatch\.ts/, code);
  for (const specifier of ["@molis-ai/molis-work-plugin-goals", "@molis-ai/molis-work-contracts/platform/app-host", "@molis-ai/molis-work-app-local-host",
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
    const actual = `actions.invoke(goalEntryActions.${action},`;
    const source = transportSources().mcp.dispatcher;
    assert.ok(source.includes(actual), `${action} mutation reaches the production call`);
    assert.match(changed("mcp", text => text.replace(actual, "actions.invoke(goalEntryActions.list,")
      .concat(`\n// ${actual}\nconst note = ${JSON.stringify(actual)};`)), new RegExp(`goalEntryActions\\.${action}`));
  }
  assert.match(changed("mcp", text => text.replace("actions.invoke(goalEntryActions.initialize,", "actions.invoke(typed,")), /invoke must name a Goals action/);
});

test("W3-07-4-01 / W3-07-4-02: the MCP Host gate preserves the bound pre-open and gives only management its unprepared action port", () => {
  const bind = "bindGoalsManagementActions(caller.localHost.actionClient(reference, false), reference, { signal: caller.resident?.signal })";
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
    ["another factory reference", text => text.replace(bind, bind.replace(", reference,", ", otherReference,"))],
    ["extra factory argument", text => text.replace(bind, `${bind.slice(0, -1)}, caller)`) ],
    ["missing reference", text => text.replace(bind, "bindGoalsManagementActions(caller.localHost.actionClient(reference, false))")],
    ["Runtime gets a port", text => text.replace('audience === "management"', 'audience === "runtime"')],
    ["every audience gets a port", text => text.replace('audience !== "management" ? null : ', "")],
    ["Runtime gets an object", text => text.replace('audience !== "management" ? null : ', 'audience !== "management" ? {} : ')],
    ["Runtime receives fallback", text => text.replace('audience !== "management" ? null : ', 'audience !== "management" ? fallback() : ')],
    ["eager local fallback", text => text.replace('const fallback = () => ', 'const fallback = ')],
    ["lost cancellation signal", text => text.replace('signal: caller.resident.signal', 'signal: undefined')],
    ["forged resident project", text => text.replace('projectId: owned.project_id', 'projectId: arguments_.project_id')],
    ["unconditional pre-open", text => text.replace('if (!owned) ', '')],
    ["second local fallback", text => `${text}\nfallback();`],
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
  const goals = "@molis-ai/molis-work-contracts/modules/goal-actions";
  // Anything of the Goals descriptors module other than `{ goalEntryActions }` is a typed entry the CLI must not hold, in whatever shape it is reached.
  const namespace = add(`import * as goals from "${goals}";\nconst typed = goals.initializeBoardCapability;`);
  assert.match(changed("dispatcher", namespace), /command-dispatch\.ts.*\* as goals/);
  assert.match(changed("dispatcher", add(`import goals from "${goals}";`)), /command-dispatch\.ts.*default import goals/);
  assert.match(changed("dispatcher", add(`import "${goals}";`)), /command-dispatch\.ts.*goalEntryActions/);
  assert.match(changed("dispatcher", add(`import { goalEntryActions, initializeBoardCapability } from "${goals}";`)), /command-dispatch\.ts.*initializeBoardCapability/);
  assert.match(changed("dispatcher", add(`import { initializeBoardCapability as goalEntryActions } from "${goals}";`)), /command-dispatch\.ts.*initializeBoardCapability/);
  for (const subpath of [`${goals}/typed`, `${goals}/dist/index.js`]) {
    assert.match(changed("dispatcher", add(`import { goalEntryActions } from "${subpath}";`)), new RegExp(`command-dispatch\\.ts.*${subpath.replace(/[/.]/g, "\\$&")}`), subpath);
  }
  assert.match(changed("dispatcher", add(`export { initializeBoardCapability } from "${goals}";`)), /command-dispatch\.ts.*re-export/);
  assert.match(changed("dispatcher", add(`export * from "${goals}";`)), /command-dispatch\.ts.*re-export/);
  assert.match(changed("dispatcher", add(`export * as everything from "${goals}";`)), /command-dispatch\.ts.*re-export/);
  assert.match(changed("dispatcher", add(`const goals = await import("${goals}");`)), /command-dispatch\.ts.*import\(\)/);
  assert.match(changed("dispatcher", add(`const goals = require("${goals}");`)), /command-dispatch\.ts.*require\(\)/);
  assert.match(changed("dispatcher", add(`type Typed = import("${goals}").GoalTreeEntryApi;`)), /command-dispatch\.ts.*import type/);
  assert.match(changed("dispatcher", add("const goals = await import(specifier);")), /command-dispatch\.ts.*string literal/);
  // The dispatcher reaches the action contract, goalEntryActions and its protocol file; another module (the Goals plugin package too, PG-031) is another way in.
  for (const specifier of ["@molis-ai/molis-work-plugin-goals", "@molis-ai/molis-work-contracts/platform/app-host", "@molis-ai/molis-work-local-host", "../../local-host/src/project-host.js", "./goal-tree-commands.js", "node:fs"]) {
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
  assert.match(changed("dispatcher", source => source.replace("goalEntryActions.snapshot", "goalEntryActions.list").concat('\n// goalEntryActions.snapshot\nconst note = "goalEntryActions.snapshot";')), /goalEntryActions\.snapshot/);

  // The local fallback keeps its original reference and signal; the dispatcher receives the selected resident/local port.
  const bind = "bindGoalsManagementActions((localHost ??= createMolisWorkLocalHost()).actionClient(reference, false), reference, { signal: options.signal })";
  const source = read("apps/local-host/src/cli-project.ts");
  assert.ok(source.includes(bind), "the real cli-project.ts holds the call these mutations edit");
  for (const [mutation, edit] of [
    ["another factory reference", source => source.replace(bind, bind.replace(", reference,", ", otherReference,"))],
    ["a copy of the factory reference", source => source.replace(bind, bind.replace(", reference,", ", { ...reference },"))],
    ["extra factory argument", source => source.replace(bind, `${bind.slice(0, -1)}, caller)`)],
    ["missing factory reference", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference, false))")],
    ["another client reference", source => source.replace("actionClient(reference, false)", "actionClient(otherReference, false)")],
    ["prepared client", source => source.replace("actionClient(reference, false)", "actionClient(reference, true)")],
    ["wrong factory import", source => source.replace('from "./goals-actions.js"', 'from "./elsewhere.js"')],
    ["type-only factory import", source => source.replace('import { bindGoalsManagementActions }', 'import type { bindGoalsManagementActions }')],
    ["unused selected port", source => source.replace("dispatchCliProjectCommand(actions, args, input)", "dispatchCliProjectCommand(makeActions(), args, input)")],
    ["second typed route", source => source.replace("const actions =", "const extra = localHost.client(reference);\n  const actions =")],
    ["direct Goal Query port", source => `${source}\nconst query = runtime.goalQueries;`],
    ["eager local fallback", source => source.replace("const fallback = () => ", "const fallback = ")],
    ["bypass resident", source => source.replace("project ? residentManagementActions", "false ? residentManagementActions")],
    ["lost cancellation signal", source => source.replace("signal: options.signal, fallback", "signal: undefined, fallback")],
    ["forged resident database", source => source.replace("databasePath: project.database_path, projectId", "databasePath: databasePath, projectId")],
  ]) {
    assert.notEqual(edit(source), source, mutation);
    assert.match(changed("project", edit), /cli-project\.ts/, mutation);
  }
});
