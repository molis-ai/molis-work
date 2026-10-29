import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
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
    import type { GoalEventFactsApi, GoalEventStateApi, GoalEventIntentApi } from "@molis-ai/molis-work-contracts/modules/goals";
    import type { GoalEventFacts } from "@molis-ai/molis-work-plugin-goals/module";
    ${EXACT}
    export const facts: Exact<keyof GoalEventFactsApi, ${union(FACTS_API)}> = true;
    export const state: Exact<keyof GoalEventStateApi, ${union(STATE_API)}> = true;
    export const intent: Exact<keyof GoalEventIntentApi, ${union(INTENT_API)}> = true;
    export const reached: Exact<GoalEventFactsApi["state"], GoalEventStateApi> = true;
    export const implemented: GoalEventFactsApi = null as unknown as GoalEventFacts;
  `), []);
  // The facade carries only what it composes; the 15 calls it used to forward are gone from it.
  const facade = Object.getOwnPropertyNames(GoalEventFacts.prototype).filter(name => name !== "constructor").sort();
  assert.deepEqual(facade, [...FACTS_API.filter(name => name !== "state" && name !== "intent"), "readCompletionContext"].sort());
});
