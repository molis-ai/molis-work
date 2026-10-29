import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { MCP_TOOLS } from "@molis-ai/molis-work-app-local-host";
import { MANAGEMENT_GOAL_ACTIONS } from "@molis-ai/molis-work-app-mcp";
import * as contract from "@molis-ai/molis-work-plugin-goals/contract";
import { GoalEventFacts } from "@molis-ai/molis-work-plugin-goals/module";

// PG-111 for Goals and BL-781 (T-112): Goals' contracts belong to Goals, and the event facts API no longer carries the
// state and intent calls that the facade only forwarded.

/** Type errors a small caller gets from the built declarations; the test runner strips types, so they are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./goals-contract-types.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
}
const EXACT = "type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;";

const FACTS_API = ["configure", "configureRequested", "intent", "isEventStateOwner", "listEvents", "listLatestEvents", "listLatestReports",
  "listLatestTimeline", "readConfig", "readCurrentRequirements", "readEvent", "readIntentSourceKind", "readObservedEventCursor", "report",
  "runImmediate", "state"];
const STATE_API = ["adoptOwner", "applyConcern", "citeDecision", "readProgressReceipt", "readWorkState", "recordNote", "recordProgress",
  "recordTrustedDecision", "requestDecision", "resumeWork", "setAgreement", "submitClosure"];
const INTENT_API = ["recordArtifacts", "remember", "replay"];

test("RAC-1772: the event facts API holds facts, and the state and intent calls are reached through state and intent", () => {
  const union = (names: readonly string[]) => names.map(name => JSON.stringify(name)).join(" | ");
  assert.deepEqual(typeErrors(`
    import type { GoalEventFactsApi, GoalEventStateApi, GoalEventIntentApi } from "@molis-ai/molis-work-plugin-goals/contract";
    import type { GoalEventFacts } from "@molis-ai/molis-work-plugin-goals/module";
    ${EXACT}
    export const facts: Exact<keyof GoalEventFactsApi, ${union(FACTS_API)}> = true;
    export const state: Exact<keyof GoalEventStateApi, ${union(STATE_API)}> = true;
    export const intent: Exact<keyof GoalEventIntentApi, ${union(INTENT_API)}> = true;
    export const reached: Exact<GoalEventFactsApi["state"], GoalEventStateApi> = true;
    export const reachedIntent: Exact<GoalEventFactsApi["intent"], GoalEventIntentApi> = true;
    // The facade's public members are the contract types, not its concrete GoalEventState and GoalEventIntent.
    export const facadeState: Exact<GoalEventFacts["state"], GoalEventStateApi> = true;
    export const facadeIntent: Exact<GoalEventFacts["intent"], GoalEventIntentApi> = true;
    export const implemented: GoalEventFactsApi = null as unknown as GoalEventFacts;
  `), []);
  // The facade carries only what it composes; the 15 calls it used to forward are gone from it.
  const facade = Object.getOwnPropertyNames(GoalEventFacts.prototype).filter(name => name !== "constructor").sort();
  assert.deepEqual(facade, [...FACTS_API.filter(name => name !== "state" && name !== "intent"), "readCompletionContext"].sort());
});

const source = (file: string) => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
const tracked = (...directories: string[]) => execFileSync("git", ["ls-files", "-z", "--", ...directories], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" })
  .split("\0").filter(file => /\.(?:ts|tsx|mts|mjs|js|json)$/u.test(file));

// RAC-1770: the contract lives in the Goals plugin, with the runtime values it had; the platform contracts' three subpaths are gone.
const CONTRACT_RUNTIME_EXPORTS = ["GOALS_TREE_INTAKE", "GOALS_TREE_SUBMIT_RESULT", "GOAL_PLUGIN_OBJECT_SOURCE", "agreement", "array", "artifactSource", "binding",
  "boardSnapshotSchema", "boolean", "change", "closure", "concern", "count", "decision", "decisionRequest", "effect", "enumeration", "eventType",
  "goalAcceptanceCriterionSchema", "goalAction", "goalArchiveResultSchema", "goalConfigSchema", "goalConfirmedInputSchema", "goalContractSchema", "goalDecisionMethods",
  "goalDecompositionReviewSchema", "goalDecompositionReviewStatuses", "goalDirectoryItemSchema", "goalEntryActions", "goalEventAcknowledgementCategories",
  "goalEventAcknowledgementTreatments", "goalEventClosureKinds", "goalEventConcernActions", "goalEventConcernStatuses", "goalEventDecisionEffectKinds",
  "goalEventDecisionPurposes", "goalEventFieldFormats", "goalEventJudgmentVerdicts", "goalEventPageSchema", "goalEventRequirementCurrentStatuses", "goalEventSchema",
  "goalEventSemanticFamilies", "goalEventSystemOperations", "goalEventTrustedAuthoritySources", "goalEventTypeSourceKinds", "goalEventUserConclusionVerdicts",
  "goalEventWorkStatuses", "goalHistoryItemSchema", "goalHistoryPageSchema", "goalIntentSourceKinds", "goalPluginActions", "goalPluginObjectRef", "goalPolicyBindingSchema",
  "goalPolicySchema", "goalProgressResultSchema", "goalRecordSchema", "goalRelationEndpoints", "goalRelationSchema", "goalRelationTypes", "goalReportEventSchema",
  "goalStateSchema", "goalTimelineSchema", "goalTrashResultSchema", "guidanceCommonSchema", "guidanceKindSchema", "identifier", "inGoalRelation", "judgment",
  "nullable", "object", "option", "parseGoalPluginObjectRef", "planningCompositionSchema", "planningGraphIssueSchema", "planningImpactSchema", "planningMethodInputSchema",
  "planningMethodSchema", "planningMethodSummarySchema", "planningSavedSchema", "progress", "projectGuidanceEntrySchema", "projectGuidanceRevisionSchema",
  "readGoalResumeFacts", "reason", "recordedDecisionMethod", "recordedReviewStatus", "scope", "text", "treeCheckInputSchema", "treeCheckResultSchema",
  "treeDecideInputSchema", "treeDecisionResultSchema", "treeItemDecisionSchema", "treeItemInputSchema", "treeNarrativeSchema", "treeProposalSchema",
  "treeReadInputSchema", "treeReadResultSchema", "treeSubmitInputSchema", "treeSubmitResultSchema"];
const PLUGIN_ACTIONS = { list: ["goals.list", 1, "query"], contract: ["goals.contract.read", 2, "query"], state: ["goals.state.read", 1, "query"],
  progress: ["goals.progress.record", 1, "command"], receipt: ["goals.progress.receipt", 1, "query"] };
const ENTRY_ACTIONS = { initialize: ["goals.board.initialize", 2, "command"], treeSubmit: ["goals.tree.submit", 1, "command"], treeRead: ["goals.tree.read", 1, "query"],
  treeCheck: ["goals.tree.check", 2, "command"], treeDecide: ["goals.tree.decide", 2, "command"], active: ["goals.active.set", 1, "command"],
  snapshot: ["goals.snapshot.read", 2, "query"], decide: ["goals.decisions.record", 1, "command"], guidanceRead: ["goals.guidance.read", 1, "query"],
  create: ["goals.create", 1, "command"], directoryItem: ["goals.directory.read", 1, "query"], inputsConfirm: ["goals.inputs.confirm", 1, "command"] };

test("RAC-1770: the Goals plugin's ./contract exports the contract with its old values, and the platform contracts' three Goals subpaths are gone", async () => {
  assert.deepEqual(Object.keys(contract).sort(), CONTRACT_RUNTIME_EXPORTS);
  const idOf = (table: Record<string, { capability_id: string; version: number; operation: string }>) =>
    Object.fromEntries(Object.entries(table).map(([name, entry]) => [name, [entry.capability_id, entry.version, entry.operation]]));
  assert.deepEqual(idOf(contract.goalPluginActions), PLUGIN_ACTIONS);
  assert.deepEqual(idOf(contract.goalEntryActions), ENTRY_ACTIONS);
  assert.deepEqual([contract.goalEventWorkStatuses, contract.goalIntentSourceKinds, contract.goalRelationTypes], [["open", "completed", "cancelled"],
    ["web", "onboarding", "feed", "runtime", "tree"], ["part_of", "depends_on", "conflicts_with", "mitigates", "extends", "replaces", "corrects", "invalidates", "migrates_from"]]);
  const published = (file: string) => (JSON.parse(source(file)) as { exports: Record<string, unknown> }).exports;
  assert.ok("./contract" in published("plugins/native/goals/package.json"));
  const platform = published("packages/contracts/package.json");
  for (const subpath of ["modules/goals", "modules/goal-actions", "modules/governance-collaboration"]) {
    assert.equal(`./${subpath}` in platform, false, subpath);
    await assert.rejects(import(`@molis-ai/molis-work-contracts/${subpath}`), (error: NodeJS.ErrnoException) => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED", subpath);
  }
  // No Goals file stays behind in the platform contracts' modules.
  assert.deepEqual(readdirSync(fileURLToPath(new URL("../packages/contracts/src/modules", import.meta.url))).filter(name => /^goal|^governance/u.test(name)), []);
});

// RAC-1771: nothing outside Goals reaches a Goals contract by the old platform paths; the entries, Coding, Feed and the server name the Goals package not at all.
test("RAC-1771: no source outside Goals names the moved contract's old paths, and the entries, Coding, Feed and the server name no Goals package", () => {
  const OLD = /molis-work-contracts\/modules\/(?:goals|goal-[a-z-]+|governance-collaboration)(?:\.js)?["'`]|contracts\/(?:src|dist)\/modules\/(?:goals|goal-[a-z-]+|governance-collaboration)\b/u;
  const outside = tracked("apps", "packages", "plugins", "server", "horizontal", "services", "scripts").filter(file => !file.startsWith("plugins/native/goals/") && !file.startsWith("tooling/"));
  assert.ok(outside.length > 1000, "the scan reads the repository's sources");
  assert.deepEqual(outside.filter(file => OLD.test(source(file))), []);
  const named = tracked("apps/cli/src", "apps/mcp/src", "plugins/native/coding/src", "plugins/native/feed/src", "server/src")
    .filter(file => /molis-work-plugin-goals|plugins\/native\/goals\//u.test(source(file)));
  assert.deepEqual(named, []);
});

// RAC-1773: what the entries, Coding and Feed call is what Goals registers, and the MCP tools say what the action directory says.
/** `const <name> = { key: { capability_id, version } | call("id", version, "operation") }` read from a source file. */
function referencesIn(file: string, name: string): Record<string, [string, number, string?]> {
  const found: Record<string, [string, number, string?]> = {};
  const sourceFile = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let initializer: ts.Expression = node.initializer;
      while (ts.isAsExpression(initializer)) initializer = initializer.expression;
      assert.ok(ts.isObjectLiteralExpression(initializer), `${name} is an object literal`);
      for (const member of initializer.properties) {
        assert.ok(ts.isPropertyAssignment(member) && ts.isIdentifier(member.name), `${name}: a named entry`);
        const value = member.initializer;
        if (ts.isObjectLiteralExpression(value)) {
          const field = (key: string) => (value.properties.find(item => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === key) as ts.PropertyAssignment).initializer;
          found[member.name.text] = [(field("capability_id") as ts.StringLiteral).text, Number((field("version") as ts.NumericLiteral).text)];
        } else {
          assert.ok(ts.isCallExpression(value), `${name}.${member.name.text}`);
          const [id, version, operation] = value.arguments;
          found[member.name.text] = [(id as ts.StringLiteral).text, Number((version as ts.NumericLiteral).text), (operation as ts.StringLiteral).text];
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(Object.keys(found).length > 0, `${file} declares ${name}`);
  return found;
}
interface RegisteredAction { capability_id: string; version: number; operation: string;
  action: { kind: string; scope: string; permissions: readonly string[]; description: string; input_schema: { properties: Record<string, unknown>; required?: string[] } } }
const registered = (table: "goalEntryActions" | "goalPluginActions", key: string): RegisteredAction => (contract[table] as Record<string, RegisteredAction>)[key]!;

test("RAC-1773: the CLI, MCP, Feed and Coding tables hold the ids, versions and kinds of the actions Goals registers, and the management tools carry the directory's words", () => {
  // CLI: seven of the entry actions, each equal to the registered one.
  const cli = referencesIn("apps/cli/src/command-dispatch.ts", "GOALS");
  assert.deepEqual(Object.keys(cli).sort(), ["active", "initialize", "snapshot", "treeCheck", "treeDecide", "treeRead", "treeSubmit"]);
  for (const [name, [id, version]] of Object.entries(cli)) assert.deepEqual([id, version], [registered("goalEntryActions", name).capability_id, registered("goalEntryActions", name).version], `CLI ${name}`);
  // Feed: the three entry actions a promotion calls.
  const feed = referencesIn("plugins/native/feed/src/goal-promotion.ts", "GOALS");
  assert.deepEqual(Object.keys(feed).sort(), ["create", "directoryItem", "inputsConfirm"]);
  for (const [name, [id, version]] of Object.entries(feed)) assert.deepEqual([id, version], [registered("goalEntryActions", name).capability_id, registered("goalEntryActions", name).version], `Feed ${name}`);
  // MCP: the three management actions, exported by the MCP package.
  assert.deepEqual(Object.keys(MANAGEMENT_GOAL_ACTIONS).sort(), ["decide", "initialize", "treeDecide"]);
  for (const [name, reference] of Object.entries(MANAGEMENT_GOAL_ACTIONS)) {
    assert.deepEqual([reference.capability_id, reference.version], [registered("goalEntryActions", name).capability_id, registered("goalEntryActions", name).version], `MCP ${name}`);
  }
  // Coding: the five plugin actions, with the kind, scope and the one permission its Manifest declares for them.
  const coding = referencesIn("plugins/native/coding/src/goals-actions.ts", "GOALS_ACTIONS");
  assert.deepEqual(Object.keys(coding).sort(), Object.keys(PLUGIN_ACTIONS).sort());
  for (const [name, [id, version, operation]] of Object.entries(coding)) {
    const real = registered("goalPluginActions", name);
    assert.deepEqual([id, version, operation], [real.capability_id, real.version, real.operation], `Coding ${name}`);
    assert.deepEqual([real.action.kind, real.action.scope, [...real.action.permissions]], [operation === "query" ? "query" : "operation", "project", [operation === "query" ? "goals:read" : "goals:write"]], `Coding ${name}: the handle's kind and permission`);
  }
  // The management tools: the names and order of the platform tools, the description and business fields the Goals actions declare.
  assert.deepEqual(MCP_TOOLS.map(tool => tool.name), ["molis_work_v1_initialize", "molis_work_v1_goal_tree_decide", "molis_work_v1_event_decide", "molis_work_v1_context_resolve",
    "molis_work_v1_context_list_projects", "molis_work_v1_context_reject_suggestion", "molis_work_v1_context_bind", "molis_work_v1_context_unbind",
    "molis_work_v1_context_create_and_bind", "molis_work_v1_project_delete"]);
  const tool = (name: string) => MCP_TOOLS.find(item => item.name === name)!;
  const business = (key: "initialize" | "treeDecide" | "decide") => registered("goalEntryActions", key).action;
  for (const [name, key, keys, required] of [
    ["molis_work_v1_initialize", "initialize", ["database_path", "project_id", "idempotency_key"], ["project_id", "idempotency_key"]],
    ["molis_work_v1_goal_tree_decide", "treeDecide", ["proposal_id", "decisions", "reason", "confirm_all_pending", "idempotency_key", "database_path", "project_id", "authority"], ["project_id", "proposal_id", "idempotency_key"]],
    ["molis_work_v1_event_decide", "decide", ["database_path", "project_id", "goal_id", "idempotency_key", "request_id", "selected_option_id", "conclusion", "accepts_requirements", "effects", "authorized_change", "scope"],
      ["project_id", ...(business("decide").input_schema.required ?? [])]],
  ] as const) {
    const wire = tool(name);
    assert.equal(wire.description, business(key).description, name);
    assert.deepEqual(Object.keys(wire.inputSchema.properties as object), [...keys], name);
    assert.deepEqual(wire.inputSchema.required, [...required], name);
    // The business fields are the action's own, unchanged in shape.
    for (const field of Object.keys(business(key).input_schema.properties)) assert.deepEqual((wire.inputSchema.properties as Record<string, unknown>)[field], business(key).input_schema.properties[field], `${name}.${field}`);
  }
});
