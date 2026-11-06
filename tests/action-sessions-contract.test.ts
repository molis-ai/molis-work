import assert from "node:assert/strict";
import test from "node:test";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXTERNAL_TOOLS, externalTool, type ExternalToolEntry } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  EXTERNAL_SESSION_DEFAULT_LOCATION,
  EXTERNAL_SESSION_KEY_PATTERN,
  EXTERNAL_SESSION_LOCATION_KEY_PATTERN,
  EXTERNAL_SESSION_SOURCE_REASONS,
  EXTERNAL_SESSION_SOURCE_STATES,
  SESSIONS_PERMISSIONS,
  SESSIONS_PROVIDER_ID,
  externalSessionConnectionLocation,
  externalSessionConnectionRoute,
  sessionsActions,
  type ExternalSessionAttribution,
  type ExternalSessionHistoryOutput,
  type ExternalSessionListOutput,
  type ExternalSessionProjectAiRead,
  type ExternalSessionRow,
  type ExternalSessionScopeView,
  type ExternalSessionSource,
  type ExternalSessionSourceSummary,
} from "@molis-ai/molis-work-contracts/services/sessions";

const definitions: readonly ActionDefinition[] = Object.values(sessionsActions);
const reference = (definition: ActionDefinition) => `${definition.capability_id}@${definition.version}`;
const accepts = (schema: ActionSchema | undefined, value: unknown): boolean => compileActionSchema(schema!)(value) as boolean;
const output = (definition: ActionDefinition) => definition.action.output_schema;

const KEY = `xs_${"a".repeat(32)}`;
const PROJECT = { project_id: "p1", display_name: "青禾" };
const summary: ExternalSessionSourceSummary = { entry_id: "codex", display_name: "Codex", state: "complete", reason: null, session_count: 0, completed_at: null, next_step: null };
const source: ExternalSessionSource = { ...summary, location_key: "local:default", skipped_count: 0, progress: null };
/** A source with any state and reason, right or wrong, to hand the schema. */
const sourceWith = (status: { state: string; reason?: string | null }) => ({ ...source, ...status });
const row = (attribution: unknown): ExternalSessionRow => ({
  session_key: KEY, identity: { entry_id: "codex", location_key: EXTERNAL_SESSION_DEFAULT_LOCATION, native_id: "0190-abc" },
  tool: { entry_id: "codex", display_name: "Codex", surface: "cli", region: "global" }, seen_via: ["codex"], title: "改登录页", directory: "/work/app",
  last_activity_at: "2026-11-07T00:00:00Z", activity: "unknown", attribution: attribution as ExternalSessionAttribution, forked_from: null, return_target: null,
});
const list = (sessions: ExternalSessionRow[], sources: readonly object[] = [source]) =>
  ({ sessions, sources, unfiled_count: 0, next_cursor: null, scope_revision: 1, trust: "untrusted" }) as ExternalSessionListOutput;
const history: ExternalSessionHistoryOutput = { session_key: KEY, entries: [{ position: "p:1", role: "you", at: null, text: "你好", truncated: false }], older_cursor: null, newer_cursor: null,
  matches: [], search: null, read_state: "complete", stopped: null, activity: "idle", trust: "untrusted" };
const permit: ExternalSessionProjectAiRead = { project: PROJECT, directories: ["/work/app"], current: true, allowed: false, revision: 0, decided_at: null, counts: null };
const scope: ExternalSessionScopeView = { project_ai_reads: [permit], scope_revision: 0, sources: [
  { entry_id: "codex", location_key: "local:default", display_name: "Codex", allowed: false, directories: { mode: "linked_projects" }, connection_id: null, revision: 0, decided_at: null, adapter: "none", connections: [] },
  { entry_id: "copilot-coding-agent", location_key: null, display_name: "Copilot 编码 Agent", allowed: false, directories: { mode: "all" }, connection_id: null, revision: 0, decided_at: null, adapter: "available",
    connections: [{ connection_id: "external-0a1b", display_name: "GitHub", account_label: "octocat" }] },
] };

test("SRB-11: the read side declares these six actions and no control action", () => {
  assert.deepEqual(definitions.map(reference), ["sessions.list@1", "sessions.history.read@1", "sessions.scope.read@1", "sessions.scope.set@1", "sessions.project_ai_read.set@1", "sessions.discovery.run@1"]);
  assert.equal(SESSIONS_PROVIDER_ID, "system.sessions");
  assert.deepEqual([...SESSIONS_PERMISSIONS], ["sessions:read", "sessions:history", "sessions:manage"]);
  for (const definition of definitions) assert.doesNotMatch(definition.capability_id, /resume|send|stop|handoff/u);
});

test("the six actions pass the platform's declaration rules, every schema compiles, and all are Home actions", () => {
  assert.deepEqual(inspectActionDeclarations(definitions, undefined), []);
  for (const definition of definitions) {
    compileActionSchema(definition.action.input_schema);
    compileActionSchema(output(definition)!);
    assert.equal(definition.action.scope, "home", reference(definition));
  }
});

test("SRB-12: reading is a concurrent read: it neither writes nor waits in the Home's queue", () => {
  for (const definition of [sessionsActions.list, sessionsActions.historyRead, sessionsActions.scopeRead]) {
    assert.equal(definition.operation, "query");
    assert.equal(definition.action.effect, "read");
    assert.equal(definition.action.scheduling, "concurrent");
  }
  assert.deepEqual([...sessionsActions.list.action.permissions], ["sessions:read"]);
  assert.deepEqual([...sessionsActions.historyRead.action.permissions], ["sessions:history"]);
});

test("SRB-06: only the person changes what may be read; the two reads are one registration for every audience", () => {
  for (const definition of [sessionsActions.scopeRead, sessionsActions.scopeSet, sessionsActions.projectAiReadSet, sessionsActions.discoveryRun]) assert.deepEqual([...definition.action.audiences], ["user"], reference(definition));
  for (const definition of [sessionsActions.scopeSet, sessionsActions.projectAiReadSet, sessionsActions.discoveryRun]) {
    assert.equal(definition.operation, "command");
    assert.equal(definition.action.effect, "write");
    assert.equal(definition.action.scheduling, undefined);
    assert.deepEqual([...definition.action.permissions], ["sessions:manage"]);
  }
  for (const definition of [sessionsActions.list, sessionsActions.historyRead]) assert.deepEqual([...definition.action.audiences], ["user", "agent", "workflow", "mcp", "plugin"]);
});

test("SRB-06: no input carries a trusted identity, a native id or a path", () => {
  const smuggled = { actor_id: "a", project_id: "p", audience: "user", native_id: "n", path: "/etc", location_key: "local:default" };
  const inputs: Array<[ActionDefinition, Record<string, unknown>]> = [[sessionsActions.list, { view: "project" }], [sessionsActions.historyRead, { session_key: KEY }], [sessionsActions.scopeRead, {}],
    [sessionsActions.scopeSet, { sources: [], expected_revision: 0 }], [sessionsActions.projectAiReadSet, { allowed: true, expected_revision: 0 }], [sessionsActions.discoveryRun, {}]];
  for (const [definition, valid] of inputs) {
    assertActionInput(definition.action.input_schema, valid);
    for (const [name, value] of Object.entries(smuggled)) assert.throws(() => assertActionInput(definition.action.input_schema, { ...valid, [name]: value }), Error, `${reference(definition)} took ${name}`);
  }
  assert.throws(() => assertActionInput(sessionsActions.scopeSet.action.input_schema, { sources: [{ entry_id: "codex", allowed: true, directories: { mode: "all" }, location_key: "local:default" }], expected_revision: 0 }));
});

test("SRB-13: a session key is the fixed form and a read takes nothing else", () => {
  assert.match(KEY, new RegExp(EXTERNAL_SESSION_KEY_PATTERN, "u"));
  for (const session_key of ["xs_short", `xs_${"A".repeat(32)}`, "0190-abc", `--dangerously-${"a".repeat(32)}`]) assert.throws(() => assertActionInput(sessionsActions.historyRead.action.input_schema, { session_key }), Error, session_key);
});

test("SRB-13: a location tells two data roots and two connections apart, and holds no path or account name", () => {
  const location = new RegExp(EXTERNAL_SESSION_LOCATION_KEY_PATTERN, "u");
  for (const key of ["local:default", `local:${"0".repeat(24)}`, externalSessionConnectionLocation("external-0a1b")]) assert.match(key, location);
  for (const key of ["local:/Users/me/.codex", "local:", "connection:", "gh:octocat", `connection:${"a".repeat(101)}`]) assert.doesNotMatch(key, location);
  assert.equal(externalSessionConnectionLocation("external-0a1b"), "connection:external-0a1b");
});

test("SRB-13: seven states, one at a time, and a state that has reasons gives one of its own", () => {
  assert.deepEqual([...EXTERNAL_SESSION_SOURCE_STATES], ["complete", "reading", "needs_login", "version_unreadable", "failed", "unsupported", "not_allowed"]);
  const schema = output(sessionsActions.list);
  for (const state of EXTERNAL_SESSION_SOURCE_STATES) {
    const reasons: readonly string[] = EXTERNAL_SESSION_SOURCE_REASONS[state];
    for (const reason of reasons.length ? reasons : [null]) assert.ok(accepts(schema, list([], [sourceWith({ state, reason })])), `${state} / ${String(reason)}`);
    const foreign = Object.values(EXTERNAL_SESSION_SOURCE_REASONS).flat().filter(reason => !reasons.includes(reason));
    for (const reason of foreign) assert.equal(accepts(schema, list([], [sourceWith({ state, reason })])), false, `${state} took ${reason}`);
    if (reasons.length) assert.equal(accepts(schema, list([], [sourceWith({ state, reason: null })])), false, `${state} gave no reason`);
  }
  assert.equal(accepts(schema, list([], [sourceWith({ state: "empty" })])), false);
});

test("SRB-01: what Molis has not connected and what the tool does not give are two reasons, and connected or not is not the register's to say", () => {
  assert.deepEqual([...EXTERNAL_SESSION_SOURCE_REASONS.unsupported], ["adapter_pending", "tool_gap"]);
  assert.ok(accepts(output(sessionsActions.scopeRead), scope));
  const [first, second] = scope.sources;
  assert.equal(accepts(output(sessionsActions.scopeRead), { ...scope, sources: [{ ...first, adapter: "connected" }, second] }), false);
  for (const tool of EXTERNAL_TOOLS as readonly ExternalToolEntry[]) assert.equal("adapter" in tool, false, tool.id);
});

test("SRB-13: the person's source says how far it read; any other caller's summary leaves that out and still fits", () => {
  const schema = output(sessionsActions.list);
  assert.ok(accepts(schema, list([], [summary])));
  assert.ok(accepts(schema, { ...list([], [summary]), unfiled_count: null }));
  assert.ok(accepts(schema, list([], [{ ...source, state: "reading", reason: null, progress: { read: 40, total: null } }])));
  assert.equal(accepts(schema, list([], [{ ...source, progress: { read: -1, total: null } }])), false);
});

test("SRB-14, SRB-15: every attribution state fits the list, and a state cannot borrow another's fields", () => {
  const suggestion = { status: "ready", project: PROJECT, alternatives: [], reason: "目录相同", evidence: [{ kind: "directory", text: "/work/app" }], created_at: "2026-11-07T00:00:00Z" };
  const states = [
    { state: "confirmed", project: PROJECT, basis: "user_chose", decided_at: "2026-11-07T00:00:00Z", later_suggestion: suggestion },
    { state: "reported", project: PROJECT, source: { kind: "runtime_binding", runtime_id: "codex" }, reported_at: "2026-11-07T00:00:00Z" },
    { state: "automatic", project: PROJECT, evidence: { kind: "repository", path: "/work/app" }, tool_reported_other: { project: { project_id: "p2", display_name: "别的" }, runtime_id: "codex" } },
    ...["no_relation", "tool_linked", "ambiguous", "relation_gone", "project_gone", "left_unfiled"].map(reason => ({ state: "unfiled", reason, candidates: [PROJECT], suggestion: null })),
    { state: "unfiled", reason: "no_relation", candidates: [], suggestion: { ...suggestion, status: "failed", project: null, evidence: [] } },
  ];
  const schema = output(sessionsActions.list);
  for (const attribution of states) assert.ok(accepts(schema, list([row(attribution)])), JSON.stringify(attribution));
  const invalid = [
    { state: "reported", project: PROJECT, evidence: { kind: "directory", path: "/work/app" } },
    { state: "reported", project: PROJECT, source: { kind: "runtime_binding", runtime_id: "codex" }, reported_at: "t", tool_reported_other: { project: PROJECT, runtime_id: "codex" } },
    { state: "automatic", project: PROJECT, evidence: { kind: "title", path: "同名" } },
    { state: "unfiled", reason: "suggested", candidates: [], suggestion: null },
    { state: "unfiled", reason: "no_relation", candidates: [], suggestion: { ...suggestion, reason: "长".repeat(121) } },
  ];
  for (const attribution of invalid) assert.equal(accepts(schema, list([row(attribution)])), false, JSON.stringify(attribution));
});

test("SRB-02, SRB-10: a history page keeps its positions and says when it stopped part way", () => {
  const schema = output(sessionsActions.historyRead);
  assert.ok(accepts(schema, history));
  assert.ok(accepts(schema, { ...history, read_state: "partial", stopped: { code: "sessions.read_failed", at: "p:1", retryable: true } }));
  assert.ok(accepts(schema, { ...history, matches: [{ position: "p:1", ranges: [[0, 2]] }], search: { scanned_all: false, next_cursor: "c" } }));
  assert.equal(accepts(schema, { ...history, trust: "trusted" }), false);
  assert.equal(accepts(schema, { ...history, entries: [{ ...history.entries[0], position: "" }] }), false);
  assert.equal(accepts(schema, { ...history, entries: [{ ...history.entries[0], role: "assistant" }] }), false);
  assert.equal(accepts(schema, { ...history, matches: [{ position: "p:1", ranges: [[0]] }] }), false);
});

test("SRB-02: a read asks for one direction at a time, and a search for real words", () => {
  const input = sessionsActions.historyRead.action.input_schema;
  for (const from of [{ before: "p:1" }, { after: "p:1" }, { around: "p:1" }]) assertActionInput(input, { session_key: KEY, from });
  assert.throws(() => assertActionInput(input, { session_key: KEY, from: { before: "p:1", after: "p:2" } }));
  assert.throws(() => assertActionInput(input, { session_key: KEY, query: "   " }));
  assert.throws(() => assertActionInput(input, { session_key: KEY, query: "词".repeat(201) }));
  assert.throws(() => assertActionInput(input, { session_key: KEY, limit: 201 }));
  assert.throws(() => assertActionInput(sessionsActions.list.action.input_schema, { view: "project", limit: 101 }));
  assert.throws(() => assertActionInput(sessionsActions.list.action.input_schema, { view: "everything" }));
});

test("SRB-16: the permit is off until the person changes it, and the counts stay out unless asked for", () => {
  const schema = output(sessionsActions.projectAiReadSet);
  assert.ok(accepts(schema, permit));
  assert.ok(accepts(schema, { ...permit, allowed: true, revision: 1, decided_at: "2026-11-07T00:00:00Z", counts: { filed: 3, ai_readable: 1, reported: 1, blocked: [{ entry_id: "cursor", display_name: "Cursor", count: 1 }] } }));
  assert.equal(accepts(schema, { ...permit, counts: { filed: 3 } }), false);
  assertActionInput(sessionsActions.scopeRead.action.input_schema, { include_counts: true });
});

test("SRB-06: a cloud entry reached by a command reads through a cli connection of its program, never through whoever is logged in", () => {
  const copilot: ExternalToolEntry = externalTool("copilot-coding-agent");
  assert.deepEqual(externalSessionConnectionRoute(copilot), { via: "cli", program: "gh" });
  const reachedCloud = (EXTERNAL_TOOLS as readonly ExternalToolEntry[]).filter(tool => externalSessionConnectionRoute(tool)).map(tool => tool.id);
  assert.deepEqual(reachedCloud, ["copilot-coding-agent"], "a new cloud way in must be checked against this rule");
  const local: ExternalToolEntry = externalTool("codex");
  assert.equal(externalSessionConnectionRoute(local), null);
  const service = { via: "service", service_id: "devin", trust: "official" } as const;
  assert.deepEqual(externalSessionConnectionRoute({ ...copilot, sessions: { ...copilot.sessions, discover: service, list: service } }), { via: "service", service_id: "devin" });
});

test("SRB-06: a cloud source with no connection chosen has no location, and the scope offers the connections it may take", () => {
  const schema = output(sessionsActions.scopeRead);
  assert.ok(accepts(schema, scope));
  const [first, cloud] = scope.sources;
  assert.equal(cloud.location_key, null);
  assert.equal(accepts(schema, { ...scope, sources: [first, { ...cloud, connections: [{ connection_id: "Not An Id", display_name: "x", account_label: null }] }] }), false);
  assertActionInput(sessionsActions.scopeSet.action.input_schema, { sources: [{ entry_id: "copilot-coding-agent", connection_id: "external-0a1b", allowed: true, directories: { mode: "all" } }], expected_revision: 3 });
});
