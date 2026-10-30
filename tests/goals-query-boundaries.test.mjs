import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkGoalReadOwnerSql, checkNoGoalTypedAdapters, checkGoalTransportCallers, checkGoalsCommandOwnership, ENTRY_SOURCE_FILE, hostSourceFiles, readEntrySources, WEB_DISPATCH_FILES } from "../scripts/check-package-boundaries.mjs";

test("Goal read guard covers actual root callers and rejects restored Policy and relation SQL", () => {
  for (const file of ["apps/desktop/launchers/web/server.ts", ...WEB_DISPATCH_FILES, "apps/desktop/launchers/mcp/server.ts", "apps/local-host/src/mcp-server.ts", "apps/mcp/src/tool-dispatch.ts", "apps/local-host/src/cli-project.ts", "apps/cli/src/command-dispatch.ts",
    // The Host's Feed composition went with FI-6: the demo seed's library and the Runtime Feed's own composition are the callers now, as the boundary check reads them.
    "apps/local-host/src/demo-feed-library.ts", ...["application-assembly.ts", "plugin.ts", "goal-promotion.ts"].map(file => `plugins/native/feed/src/${file}`)]) {
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
    "plugins/native/goals/src/contract/goals.ts", "plugins/native/coding/src/manifest.ts", "plugins/native/coding/src/goal-context.ts", "plugins/native/coding/src/routes.ts"];
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
/** Every source file of the two entry packages, read by the production reader (PG-111: they name no Goals contract anywhere, not only in the dispatchers). */
const entrySources = () => readEntrySources(fileURLToPath(new URL("..", import.meta.url)));
const transportSources = () => ({ cli: { dispatcher: read("apps/cli/src/command-dispatch.ts"), project: read("apps/local-host/src/cli-project.ts") },
  mcp: { dispatcher: read("apps/mcp/src/tool-dispatch.ts"), host: read("apps/local-host/src/mcp-v1-tool.ts") }, entries: entrySources() });
/** The rule's answer for the real sources with one dispatcher or its Host composition edited. */
const changed = (part, edit) => {
  const all = transportSources();
  const next = part === "mcp" || part === "mcpHost" ? { ...all, mcp: { ...all.mcp, [part === "mcp" ? "dispatcher" : "host"]: edit(all.mcp[part === "mcp" ? "dispatcher" : "host"]) } }
    : { ...all, cli: { ...all.cli, [part]: edit(all.cli[part]) } };
  return checkGoalTransportCallers(next).join("\n");
};
const add = text => source => `${text}\n${source}`;
/** The rule's answer for the real sources with one more file among the entries' own. */
const withEntryFile = (path, source) => { const all = transportSources(); return checkGoalTransportCallers({ ...all, entries: [...all.entries, { path, source }] }).join("\n"); };

test("the CLI and management MCP call Goals' actions through the management caller the Host builds", () => {
  assert.deepEqual(checkGoalTransportCallers(transportSources()), []);
  // The dispatcher is handed the management port; it holds no Host client, no typed Goals descriptor and no domain port of its own.
  assert.match(changed("dispatcher", add('import type { LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";')), /command-dispatch\.ts.*LocalHostProjectClient/);
  for (const name of ["initializeBoardCapability", "snapshotBoardCapability", "setActiveGoalCapability", "goalTreeCapabilities", "createGoalProposalClients", "goalEntryActions"]) {
    assert.match(changed("dispatcher", add(`import { ${name} } from "@molis-ai/molis-work-contracts/modules/goal-actions";`)), /command-dispatch\.ts.*imports @molis-ai\/molis-work-contracts\/modules\/goal-actions/, name);
  }
  assert.match(changed("dispatcher", source => source.replace(/CliManagementActions/g, "SomethingElse")), /management/);
  assert.match(changed("dispatcher", add("const x = client.withProject(reference);")), /withProject/);
  assert.match(changed("dispatcher", add("const x = coordinator.goals.query;")), /coordinator\.goals/);
  // The snapshot is read through Goals' own action, not another one and not by hand.
  assert.match(changed("dispatcher", source => source.replace("GOALS.snapshot", "GOALS.list")), /GOALS\.snapshot/);
  // The Host side builds the caller with the factory, over the project's client (it starts the project's plugins, Goals among them).
  assert.match(changed("project", source => source.replace("bindGoalsManagementActions(", "somethingElse(")), /cli-project\.ts.*bindGoalsManagementActions/);
  assert.match(changed("project", source => source.replace("actionClient(reference)", "actionClient(reference, false)")), /cli-project\.ts.*actionClient\(reference\)/);
  assert.match(changed("project", source => source.replace("actionClient(reference)", "client(reference)")), /cli-project\.ts/);
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
  for (const code of [`import { goalEntryActions } from "@molis-ai/molis-work-plugin-goals/contract";`, `import type { GoalRecord } from "@molis-ai/molis-work-plugin-goals/contract";`]) {
    assert.match(changed("mcp", add(code)), /tool-dispatch\.ts.*imports @molis-ai\/molis-work-plugin-goals\/contract/, code);
  }
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
    const actual = `actions.invoke(MANAGEMENT_GOAL_ACTIONS.${action},`;
    const source = transportSources().mcp.dispatcher;
    assert.ok(source.includes(actual), `${action} mutation reaches the production call`);
    assert.match(changed("mcp", text => text.replace(actual, "actions.invoke(MANAGEMENT_GOAL_ACTIONS.list,")
      .concat(`\n// ${actual}\nconst note = ${JSON.stringify(actual)};`)), new RegExp(`MANAGEMENT_GOAL_ACTIONS\\.${action}`));
  }
  assert.match(changed("mcp", text => text.replace("actions.invoke(MANAGEMENT_GOAL_ACTIONS.initialize,", "actions.invoke(typed,")), /invoke must name a Goals action/);
});

test("W3-07-4-01 / W3-07-4-02: the MCP Host gate preserves the bound pre-open and gives only management its project action port", () => {
  const bind = "bindGoalsManagementActions(caller.localHost.actionClient(reference), reference, { signal: caller.resident?.signal })";
  const preopen = "await caller.localHost.client(reference).withScope(() => undefined);";
  const dispatch = "dispatchMcpProjectTool(actions, name, arguments_,";
  const source = transportSources().mcp.host;
  for (const actual of [bind, preopen, dispatch]) assert.ok(source.includes(actual), "mutation reaches the production call");
  for (const [mutation, edit] of [
    ["wrong factory", text => text.replace("bindGoalsManagementActions(", "anotherFactory(")],
    ["factory from elsewhere", text => text.replace('from "./goal-callers.js"', 'from "./elsewhere.js"')],
    ["type-only factory", text => text.replace("import { bindGoalsManagementActions }", "import type { bindGoalsManagementActions }")],
    ["explicit preparation", text => text.replace("actionClient(reference)", "actionClient(reference, true)")],
    ["unprepared client", text => text.replace("actionClient(reference)", "actionClient(reference, false)")],
    ["another Host", text => text.replace("caller.localHost.actionClient", "otherHost.actionClient")],
    ["another client reference", text => text.replace("actionClient(reference)", "actionClient(otherReference)")],
    ["another factory reference", text => text.replace(bind, bind.replace(", reference,", ", otherReference,"))],
    ["extra factory argument", text => text.replace(bind, `${bind.slice(0, -1)}, caller)`) ],
    ["missing reference", text => text.replace(bind, "bindGoalsManagementActions(caller.localHost.actionClient(reference))")],
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
  // Any way into a Goals contract is a typed entry the CLI must not hold (PG-111: it calls Goals' actions by id and version from a local table), in whatever shape it is reached.
  const namespace = add(`import * as goals from "${goals}";\nconst typed = goals.initializeBoardCapability;`);
  assert.match(changed("dispatcher", namespace), /command-dispatch\.ts.*imports .*goal-actions/);
  assert.match(changed("dispatcher", add(`import goals from "${goals}";`)), /command-dispatch\.ts.*imports .*goal-actions/);
  assert.match(changed("dispatcher", add(`import "${goals}";`)), /command-dispatch\.ts.*imports .*goal-actions/);
  assert.match(changed("dispatcher", add(`import { goalEntryActions, initializeBoardCapability } from "${goals}";`)), /command-dispatch\.ts.*imports .*goal-actions/);
  assert.match(changed("dispatcher", add(`import { initializeBoardCapability as goalEntryActions } from "${goals}";`)), /command-dispatch\.ts.*imports .*goal-actions/);
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
  // The dispatcher reaches the action contract and its protocol file; another module (the Goals plugin package and its contract too, PG-031 and PG-111) is another way in.
  for (const specifier of ["@molis-ai/molis-work-plugin-goals", "@molis-ai/molis-work-plugin-goals/contract", "@molis-ai/molis-work-contracts/platform/app-host", "@molis-ai/molis-work-local-host", "../../local-host/src/project-host.js", "./goal-tree-commands.js", "node:fs"]) {
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
  assert.match(changed("dispatcher", source => source.replace("GOALS.snapshot", "GOALS.list").concat('\n// GOALS.snapshot\nconst note = "GOALS.snapshot";')), /GOALS\.snapshot/);

  // The local fallback keeps its original reference and signal; the dispatcher receives the selected resident/local port.
  const bind = "bindGoalsManagementActions((localHost ??= createMolisWorkLocalHost()).actionClient(reference), reference, { signal: options.signal })";
  const source = read("apps/local-host/src/cli-project.ts");
  assert.ok(source.includes(bind), "the real cli-project.ts holds the call these mutations edit");
  for (const [mutation, edit] of [
    ["another factory reference", source => source.replace(bind, bind.replace(", reference,", ", otherReference,"))],
    ["a copy of the factory reference", source => source.replace(bind, bind.replace(", reference,", ", { ...reference },"))],
    ["extra factory argument", source => source.replace(bind, `${bind.slice(0, -1)}, caller)`)],
    ["missing factory reference", source => source.replace(bind, "bindGoalsManagementActions(localHost.actionClient(reference))")],
    ["another client reference", source => source.replace("actionClient(reference)", "actionClient(otherReference)")],
    ["explicit preparation", source => source.replace("actionClient(reference)", "actionClient(reference, true)")],
    ["unprepared client", source => source.replace("actionClient(reference)", "actionClient(reference, false)")],
    ["wrong factory import", source => source.replace('from "./goal-callers.js"', 'from "./elsewhere.js"')],
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


// PG-111 (T-112) · RAC-1774: the entries name no Goals contract; the old forms (the platform's goal-actions subpath, `goalEntryActions`, a Goals import) are refused.
test("RAC-1774: the CLI and MCP name no Goals contract in any file and call Goals' actions from a local table of ids", () => {
  assert.deepEqual(checkGoalTransportCallers(transportSources()), []);
  // Any way into a Goals contract or the Goals package, in any file of the two entry packages, whatever the syntax.
  for (const code of [
    'import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";',
    'import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";',
    'import { governanceCollaborationContract } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";',
    'import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals";',
    'import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";',
    'export { goalEntryActions } from "@molis-ai/molis-work-plugin-goals/contract";',
    'export * from "../../../plugins/native/goals/src/contract/goals.js";',
    'const contract = await import("@molis-ai/molis-work-plugin-goals/contract");',
    'const contract = require("@molis-ai/molis-work-plugin-goals/contract");',
    'type Typed = import("@molis-ai/molis-work-plugin-goals/contract").GoalRecord;',
  ]) {
    for (const file of ["apps/cli/src/elsewhere.ts", "apps/mcp/src/elsewhere.ts"]) {
      assert.match(withEntryFile(file, `${code}\nexport const x = 1;`), new RegExp(`${file.replace(/[/.]/g, "\\$&")}.*Goals contract`), `${file}: ${code}`);
    }
  }
  // A comment or a string that names them is not a reference, and the platform's own action contract is what the entries are meant to use.
  assert.equal(withEntryFile("apps/mcp/src/elsewhere.ts", '// import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";\nconst note = "@molis-ai/molis-work-plugin-goals/contract";'), "");
  assert.equal(withEntryFile("apps/mcp/src/elsewhere.ts", 'import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";\nexport const x = ActionError;'), "");
  // The old dispatchers: Goals' descriptors imported from the platform's contracts and called as `goalEntryActions.<name>`.
  const oldCli = source => source.replace(/const GOALS = \{[\s\S]*?\} as const;\n/u, "").replace(/\bGOALS\./gu, "goalEntryActions.")
    .replace("import { printCliJson", 'import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";\nimport { printCliJson');
  const oldMcp = source => source.replace(/export const MANAGEMENT_GOAL_ACTIONS = \{[\s\S]*?\} as const;\n/u, "").replace(/\bMANAGEMENT_GOAL_ACTIONS\./gu, "goalEntryActions.")
    .replace("import type { McpPresentationErrorFactory", 'import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";\nimport type { McpPresentationErrorFactory');
  assert.notEqual(oldCli(transportSources().cli.dispatcher), transportSources().cli.dispatcher);
  assert.notEqual(oldMcp(transportSources().mcp.dispatcher), transportSources().mcp.dispatcher);
  assert.match(changed("dispatcher", oldCli), /command-dispatch\.ts.*imports @molis-ai\/molis-work-contracts\/modules\/goal-actions/);
  assert.match(changed("dispatcher", oldCli), /command-dispatch\.ts.*GOALS/);
  assert.match(changed("mcp", oldMcp), /tool-dispatch\.ts.*imports @molis-ai\/molis-work-contracts\/modules\/goal-actions/);
  assert.match(changed("mcp", oldMcp), /tool-dispatch\.ts.*MANAGEMENT_GOAL_ACTIONS/);
  // The dispatchers' own module lists carry no Goals contract either.
  assert.match(changed("dispatcher", add('import { x } from "@molis-ai/molis-work-plugin-goals/contract";')), /command-dispatch\.ts.*imports @molis-ai\/molis-work-plugin-goals\/contract/);
  assert.match(changed("mcp", add('import { x } from "@molis-ai/molis-work-plugin-goals/contract";')), /tool-dispatch\.ts.*imports @molis-ai\/molis-work-plugin-goals\/contract/);
  // The table is the dispatcher's own: removing it, importing one, or invoking a Goals action from anywhere else is refused.
  assert.match(changed("dispatcher", source => source.replace(/const GOALS = \{[\s\S]*?\} as const;\n/u, "")), /command-dispatch\.ts.*GOALS/);
  assert.match(changed("dispatcher", source => source.replace("actions.invoke(GOALS.snapshot,", "actions.invoke(typed,")), /command-dispatch\.ts.*invoke must name a Goals action/);
  assert.match(changed("dispatcher", source => source.replace("actions.invoke(GOALS.snapshot,", "actions.invoke(other.snapshot,")), /command-dispatch\.ts.*invoke must name a Goals action/);
  assert.match(changed("mcp", source => source.replace(/export const MANAGEMENT_GOAL_ACTIONS = \{[\s\S]*?\} as const;\n/u, "")), /tool-dispatch\.ts.*MANAGEMENT_GOAL_ACTIONS/);
});

// PG094-CLI-04: restore the external no-Home expression while retaining every owner, mkdir, reference and signal mutation.
test("RAC-105-S-08: the CLI fallback requires ownership before Home init and retains its single management route", () => {
  const source = read("apps/local-host/src/cli-project.ts");
  const own = "if (homeProject || homeDatabase) ensureHomeStorageOwner(localHost ??= createMolisWorkLocalHost({ homeDirectory: home }), home);";
  const initialize = 'if (operation === "init" && homeDatabase) prepareLocalProjectStorage(databasePath, "create");';
  const bind = "bindGoalsManagementActions((localHost ??= createMolisWorkLocalHost()).actionClient(reference), reference, { signal: options.signal })";
  const guarded = `const fallback = () => {\n    ${own}\n    ${initialize}\n    return ${bind};\n  };`;
  assert.ok(source.includes(guarded), "mutations edit the actual canonical fallback");
  for (const [mutation, edit] of [
    ["old unguarded expression", text => text.replace(guarded, `const fallback = () => ${bind};`)],
    ["missing owner preparation", text => text.replace(own, "")],
    ["wrong Home predicate", text => text.replace("homeProject || homeDatabase", "homeProject")],
    ["wrong Home argument", text => text.replace("createMolisWorkLocalHost({ homeDirectory: home }), home);", "createMolisWorkLocalHost({ homeDirectory: home }), otherHome);")],
    ["external fallback takes the selected Home", text => text.replace(bind, bind.replace("createMolisWorkLocalHost()", "createMolisWorkLocalHost({ homeDirectory: home })"))],
    ["mkdir before ownership", text => text.replace(`${own}\n    ${initialize}`, `${initialize}\n    ${own}`)],
    ["mkdir on every operation", text => text.replace(initialize, 'prepareLocalProjectStorage(databasePath, "create");')],
    ["wrong Home classification", text => text.replace("const homeDatabase = databaseInHome(home, databasePath);", "const homeDatabase = false;")],
    ["Home mkdir before ownership", text => text.replace('operation === "init" && !homeDatabase', 'operation === "init"')],
    ["extra directory creation", text => `${text}\nprepareLocalProjectStorage(databasePath, "create");`],
    ["extra business statement", text => text.replace(`return ${bind};`, `writeBusinessData();\n    return ${bind};`)],
    ["early return", text => text.replace(`return ${bind};`, `return otherPort;\n    return ${bind};`)],
    ["lost original signal", text => text.replace("{ signal: options.signal }", "{ signal: otherSignal }")],
    ["explicit client preparation", text => text.replace("actionClient(reference)", "actionClient(reference, true)")],
    ["extra client path", text => text.replace(`return ${bind};`, `localHost.client(reference);\n    return ${bind};`)],
  ]) {
    assert.notEqual(edit(source), source, mutation);
    assert.match(changed("project", edit), /cli-project\.ts/, mutation);
  }
});

// BL-386 · RAC-1514: the mouth is the plugin's own runtime mount; the Host may not reach it at all, not even by importing the mount.
test("RAC-1514 the Goals routes are mounted by the plugin and the Host cannot mount or pass them on", () => {
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const plugin = () => read("plugins/native/goals/src/plugin.ts");
  const httpContext = () => read("plugins/native/goals/src/http/types.ts");
  const sources = () => hostSourceFiles(repositoryRoot);
  const check = (edit = {}) => checkGoalsCommandOwnership({ goalsPlugin: edit.plugin ?? plugin(), httpContext: edit.httpContext ?? httpContext(), hostSources: edit.hostSources ?? sources() });
  assert.deepEqual(check(), []);
  // The retired rule only asked web-request.ts for `actions: () => goalActions`; the old rewrite satisfies that and must not come back.
  const restoredWebRequest = `${read("apps/local-host/src/web-request.ts")}\n{ id: "goals", handle: () => goalsRoutes({ actions: () => goalActions }) };\n`;
  assert.match(restoredWebRequest, /actions: \(\) => goalActions/u);
  const restoredHost = sources().map(entry => entry.file === "apps/local-host/src/web-request.ts" ? { ...entry, source: restoredWebRequest } : entry);
  assert.match(check({ hostSources: restoredHost }).join("\n"), /apps\/local-host\/src\/web-request\.ts: the Host must not mount/u);
  // An import alone is enough to bring the old address back.
  const importedHost = sources().map(entry => entry.file === "apps/local-host/src/web-request.ts" ? { ...entry, source: `${entry.source}\nimport { goalsRoutes as mount } from "@molis-ai/molis-work-plugin-goals";\nvoid mount;\n` } : entry);
  assert.match(check({ hostSources: importedHost }).join("\n"), /web-request\.ts: the Host must not mount, import or pass on/u);
  // Deleting the plugin's mount leaves nobody serving the routes.
  assert.match(check({ plugin: plugin().replace("routes: goalsRoutes({", "routes: [],") }).join("\n"), /plugins\/native\/goals\/src\/plugin\.ts: Goals' declared routes must be mounted/u);
  // Restoring a domain port in the route context is refused by both conditions.
  const domainPort = `${httpContext()}\nexport type DomainPort = { query: (sql: string) => unknown };\n`;
  assert.match(check({ httpContext: domainPort }).join("\n"), /http\/types\.ts: Goals HTTP business operations must consume BoundActionClient/u);
  // Reading no Host files must not count as a pass.
  assert.match(check({ hostSources: [] }).join("\n"), /no Host source files were read/u);
});

test("RAC-1774: the entries' files are TypeScript and JavaScript of every module flavour, and a check without them throws instead of passing", () => {
  for (const name of ["a.ts", "a.mts", "a.cts", "a.tsx", "a.js", "a.mjs", "a.cjs", "a.jsx"]) assert.ok(ENTRY_SOURCE_FILE.test(name), name);
  for (const name of ["a.md", "a.json", "a.d.ts.map"]) assert.ok(!ENTRY_SOURCE_FILE.test(name), name);
  // A Goals import in a `.mjs` file of the CLI is refused like one in a `.ts` file.
  assert.match(withEntryFile("apps/cli/src/extra.mjs", 'import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";\n'), /apps\/cli\/src\/extra\.mjs/u);
  const { cli, mcp } = transportSources();
  assert.throws(() => checkGoalTransportCallers({ cli, mcp }), /entries \(the entry packages. source files\) are required/u);
});

test("RAC-2297: reading the entry packages covers every JavaScript and TypeScript flavour, and a Goals import in one of them is refused", () => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-entry-sources-"));
  try {
    const write = (relative, source) => { mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); writeFileSync(path.join(root, relative), source); };
    write("apps/cli/src/command.mts", 'import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";\n');
    write("apps/cli/src/view.tsx", "export const view = null;\n");
    write("apps/cli/src/legacy.cjs", "module.exports = {};\n");
    write("apps/mcp/src/tool.mts", "export const tool = null;\n");
    write("apps/mcp/src/render.tsx", "export const render = null;\n");
    write("apps/mcp/src/helper.cjs", "module.exports = {};\n");
    // The plain files of every other flavour: they name no Goals contract, and the scan has to read each of them.
    const plain = { "a.ts": "export const a = 1;\n", "a.js": "export const a = 1;\n", "a.mjs": "export const a = 1;\n", "a.jsx": "export const a = null;\n", "a.cts": "export const a = 1;\n" };
    for (const directory of ["apps/cli/src", "apps/mcp/src"]) for (const [name, source] of Object.entries(plain)) write(`${directory}/${name}`, source);
    write("apps/cli/src/notes.md", "not a source file\n");
    write("apps/mcp/src/types.d.ts.map", "{}\n");
    const entries = readEntrySources(root);
    assert.deepEqual(entries.map(entry => entry.path).sort(), [
      "apps/cli/src/a.cts", "apps/cli/src/a.js", "apps/cli/src/a.jsx", "apps/cli/src/a.mjs", "apps/cli/src/a.ts",
      "apps/cli/src/command.mts", "apps/cli/src/legacy.cjs", "apps/cli/src/view.tsx",
      "apps/mcp/src/a.cts", "apps/mcp/src/a.js", "apps/mcp/src/a.jsx", "apps/mcp/src/a.mjs", "apps/mcp/src/a.ts",
      "apps/mcp/src/helper.cjs", "apps/mcp/src/render.tsx", "apps/mcp/src/tool.mts",
    ], "every .ts/.mts/.cts/.tsx/.js/.mjs/.cjs/.jsx file of both entry packages is read, and neither the .md nor the .d.ts.map");
    assert.equal(entries.find(entry => entry.path === "apps/cli/src/view.tsx").source, "export const view = null;\n", "the source of each file is read");
    const { cli, mcp } = transportSources();
    assert.match(checkGoalTransportCallers({ cli, mcp, entries }).join("\n"),
      /apps\/cli\/src\/command\.mts: a [a-z]+ of @molis-ai\/molis-work-plugin-goals\/contract is a Goals contract/u);
    // The fixture's plain .ts/.js/.mjs/.jsx/.cts files name no Goals contract, so the rule passes them: this [] is ten files the scan
    // really read, not an empty list (a filter that dropped those extensions would read none of them and let PG-031 pass unlooked at).
    const plainEntries = entries.filter(entry => /\.(?:ts|js|mjs|jsx|cts)$/u.test(entry.path));
    assert.equal(plainEntries.length, 10, "the fixture's plain files are the ones passed to the rule");
    assert.deepEqual(checkGoalTransportCallers({ cli, mcp, entries: plainEntries }), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
