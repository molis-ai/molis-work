import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import { createFeedSourceRuntime, createLocalFeedSourceService, createPluginPlatform, listFeedSourceCatalog } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { RepositoryReadRequest, SourcePullRequest } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { createEvidenceContentStore, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";
import { publishLibrary, RESEARCH_REVISION as REVISION } from "./fixtures/research-library.js";

// FI-4 step 4c (S-99 provisional, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §10): a plugin's `services.sourcePull` pulls public
// feeds through the platform's own transports, tells the plugin each evidence body's reference before the body is written, reads bodies back
// and forgets search records. RAC-1016 (hold before write), RAC-1017 (what it refuses), RAC-1018 (evidence), RAC-1019 (forget, and the research
// library read of step 4c-2).

const FEED = "sources:pull_feed", QUERY = "sources:pull_query", EVIDENCE = "evidence:read", REPOSITORY = "sources:read_repository";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const rss = (title: string, entries: Array<{ id: string; title: string; text: string }>) => `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>${title}</title><link>https://example.com/</link>${entries.map(entry => `
  <item><guid>https://example.com/posts/${entry.id}</guid><title>${entry.title}</title><link>https://example.com/posts/${entry.id}</link>
  <description>${entry.text}</description><pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate></item>`).join("")}
</channel></rss>`;

async function fixture(t: TestContext) {
  // Registered before the Home's own close, so the plugins stop while the project is still open.
  let stop = async () => {}; t.after(() => stop());
  const test = await openTestHome(t);
  const project = await test.createProject("Source pull", ["feed"]), reference = project.reference, host = test.host;
  const runtime = await host.withProject(reference, runtime => runtime);
  const feeds = new Map<string, string>(), fetched: string[] = [];
  const sourcePullFetch = async (input: string | URL) => {
    fetched.push(String(input));
    const body = feeds.get(String(input));
    return body ? new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } }) : new Response("missing", { status: 404 });
  };
  // The `git` of the research library read: a map of files at one revision, and what was asked of it.
  const library = new Map<string, string>(), gitCalls: Array<readonly string[]> = [], gitHooks: { onShow?: () => void } = {};
  const sourcePullGit = async (_directory: string, args: readonly string[]) => {
    gitCalls.push([...args]);
    if (args[0] === "ls-tree") return [...library.keys()].join("\n") + "\n";
    if (args[0] === "rev-parse") return REVISION + "\n";
    if (args[0] === "show") {
      gitHooks.onShow?.();
      const name = String(args[1]).slice(REVISION.length + 1), text = library.get(name);
      if (text === undefined) throw new Error(`fatal: path '${name}' does not exist`);
      return text;
    }
    return "";
  };
  const owned = new Set<string>();
  const registry = host.actionRegistry(reference);
  const client = { ...host.actionClient(reference), ...host.syncActionClient(reference) };
  const ports = { db: runtime.store.db, appendEvent: (event: Parameters<typeof runtime.store.appendEvent>[0]) => runtime.store.appendEvent(event), eventCursor: (id: string) => runtime.store.eventCursor(id) };
  const platform = createPluginPlatform({ db: runtime.store.db, project_id: reference.project_id, actor_id: "fixture-person", actions: { registry, client, project_id: reference.project_id }, home: null,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set() {}, delete: () => false }), sourcePullFetch, sourcePullGit });
  stop = async () => {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (owned.has(record.plugin_id) && record.state === "running") await platform.runtime.stop(record.install_id);
  };
  const start = async (name: string, permissions: string[]) => {
    const id = "io.molis.work.example." + name;
    owned.add(id);
    const action = (suffix: string, needed: string[], shape: { concurrent?: boolean; query?: boolean } = {}): ActionDefinition<Record<string, never>, unknown> => ({
      capability_id: `${name}.${suffix}`, version: 1, operation: shape.query ? "query" : "command", action: { title: suffix, description: "Pulls sources as the plugin", scope: "project",
        kind: shape.query ? "query" : "operation", subject_kinds: [], audiences: ["user"], permissions: needed,
        ...(shape.concurrent === false ? {} : { scheduling: "concurrent" as const }), input_schema: { type: "object", additionalProperties: false }, output_schema: {} },
    });
    const run = action("run", permissions), serial = action("serial", permissions, { concurrent: false }), plain = action("plain", []), query = action("query", permissions, { query: true });
    const contexts: Array<{ services: PluginHostServices | undefined }> = [];
    let work: (services: PluginHostServices, caller: ActionExecutionContext) => Promise<unknown> = async () => null;
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture-" + name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: permissions.map(permission => ({ permission, required: true, reason: "Pull sources" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [run, serial, plain, query] },
    async start(value) {
      contexts.push({ services: value.services });
      return { kind: "app", actions: [run, serial, plain, query].map(item => ({ ...item, handle: (caller: ActionExecutionContext) => work(value.services!, caller) })) };
    } };
    const report = await platform.start([{ definition, trust: { level: "host" } }]); assert.deepEqual(report.failed, []);
    const user = (held: string[], extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: held, ...extra });
    return { services: () => contexts.at(-1)!.services!,
      in: (body: typeof work, action: ActionDefinition<Record<string, never>, unknown> = run, held: string[] = permissions, extra?: Partial<ActionCallContext>) => { work = body; return client.invoke(user(held, extra), action, {}); },
      run, serial, plain, query };
  };
  return { reference, runtime, feeds, fetched, start, host, catalog: listFeedSourceCatalog(), library, gitCalls, gitHooks };
}
const evidence = () => createEvidenceContentStore();

test("S-99 RAC-1016: every body's reference is told to the plugin, and the write waits for it", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[0]!, probe = await f.start("pullorder", [FEED, EVIDENCE]);
  f.feeds.set(entry.feed_url, rss("Order feed", [{ id: "order-1", title: "Order one", text: "First body of the order test." }, { id: "order-2", title: "Order two", text: "Second body of the order test." }]));
  const request: SourcePullRequest = { kind: "rss", operation_id: "pull-order-1", source_name: entry.name, definition_id: entry.id };
  const told: string[] = [], existedWhenTold: boolean[] = [];
  const result = await probe.in(services => services.sourcePull!.pull!(request, {
    async hold(refs) { for (const ref of refs) { told.push(ref); existedWhenTold.push(evidence().has(ref)); } },
  })) as Awaited<ReturnType<NonNullable<PluginHostServices["sourcePull"]>["pull"] & object>>;
  assert.equal(result.materials.length, 2);
  assert.deepEqual(existedWhenTold, [false, false], "when the plugin is told, the body is not on disk yet");
  assert.deepEqual([...told].sort(), result.materials.map(material => material.content_ref).sort(), "every body that was written was told first");
  for (const material of result.materials) assert.equal(material.content_available, true);
  assert.equal(result.http_receipt?.status, 200);
  assert.match(String(await probe.in(services => services.sourcePull!.evidence!.read(result.materials[0]!.content_ref))), /body of the order test/u);
});

test("S-99 RAC-1016: a plugin that cannot hold a body stops the pull before the body is written", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[0]!, probe = await f.start("pullhold", [FEED]);
  f.feeds.set(entry.feed_url, rss("Hold feed", [{ id: "hold-1", title: "Hold one", text: "A body that is never written because nobody could hold it." }]));
  const told: string[] = [];
  await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "rss", operation_id: "pull-hold-1", source_name: entry.name, definition_id: entry.id }, {
    async hold(refs) { told.push(...refs); throw new Error("ledger unavailable"); },
  })), /ledger unavailable/u, "the plugin's own failure is the pull's failure, not a partial result");
  assert.equal(told.length > 0, true, "the plugin was asked");
  for (const ref of told) assert.equal(evidence().has(ref), false, "and the body was not written");
  // A call cancelled while the plugin holds a body does not write it, nor any body after it.
  f.feeds.set(entry.feed_url, rss("Cancel feed", [{ id: "cancel-1", title: "Cancel one", text: "A body whose pull is cancelled while it is held." }, { id: "cancel-2", title: "Cancel two", text: "A second body that must not follow." }]));
  const controller = new AbortController(), cancelled: string[] = [];
  await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "rss", operation_id: "pull-hold-cancel", source_name: entry.name, definition_id: entry.id }, {
    signal: controller.signal, async hold(refs) { cancelled.push(...refs); controller.abort(); },
  })));
  assert.equal(cancelled.length, 1, "the pull stopped after the first body");
  for (const ref of cancelled) assert.equal(evidence().has(ref), false);
  // A call that is already cancelled never reaches the transport.
  const before = f.fetched.length, aborted = AbortSignal.abort();
  await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "rss", operation_id: "pull-hold-2", source_name: entry.name, definition_id: entry.id }, { hold: async () => {}, signal: aborted })));
  assert.equal(f.fetched.length, before);
});

test("S-99 RAC-1016: a call that loses its authority once a body is held writes no body and no search record after that", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[0]!, probe = await f.start("pullrevoke", [FEED]);
  f.feeds.set(entry.feed_url, rss("Revoke feed", [{ id: "revoke-1", title: "Revoke one", text: "A body whose caller loses its authority while it is held." }, { id: "revoke-2", title: "Revoke two", text: "A second body that must not follow." }]));
  const records = () => (f.runtime.store.db.prepare("SELECT count(*) AS n FROM feed_runtime_blobs").get() as { n: number }).n;
  let revoked = false, recordsWhenRevoked = -1;
  const told: string[] = [];
  await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "rss", operation_id: "pull-revoke-1", source_name: entry.name, definition_id: entry.id }, {
    async hold(refs) { told.push(...refs); if (!revoked) { revoked = true; recordsWhenRevoked = records(); } },
  }), probe.run, [FEED], { assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "the caller was revoked"); } }), { code: "actions.forbidden" });
  assert.equal(told.length, 1, "the pull stopped at the body that was held when the caller lost its authority");
  for (const ref of told) assert.equal(evidence().has(ref), false, "that body was not written");
  assert.equal(records(), recordsWhenRevoked, "and no search record was written after the authority went");
});

test("S-99 RAC-1016: the platform's fingerprint of a pull is the one the Feed records for the same source", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[1]!, probe = await f.start("pullplan", [FEED]);
  f.feeds.set(entry.feed_url, rss("Plan feed", [{ id: "plan-1", title: "Plan one", text: "A body for the fingerprint comparison." }]));
  const service = createLocalFeedSourceService(f.runtime.store.db, f.reference.project_id, (db, source) => createFeedSourceRuntime({ db, sourceCursor: source?.cursor,
    async fetch(input) { return new Response(f.feeds.get(String(input)) ?? "", { status: 200, headers: { "content-type": "application/rss+xml" } }); } }));
  const source = service.register({ kind: "rss", definition_id: entry.id }).source;
  const synced = await service.sync(source.source_id, { idempotencyKey: "plan-parity" });
  const planned = await probe.in(services => services.sourcePull!.plan!({ kind: "rss", operation_id: synced.run.operation_id, source_name: source.name, definition_id: entry.id })) as { intent_fingerprint: string };
  assert.equal(planned.intent_fingerprint, synced.run.receipt?.intent_fingerprint, "the same source and key make the same intent through either door");
  assert.equal(f.fetched.length, 0, "planning fetches nothing");
});

test("S-99 RAC-1017: the service exists only for what the Manifest declares, and only inside the plugin's own concurrent action", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[0]!, none = await f.start("pullnone", ["storage:private"]), feedOnly = await f.start("pullfeed", [FEED]), readOnly = await f.start("pullread", [EVIDENCE]);
  assert.equal(none.services().sourcePull, undefined);
  assert.deepEqual(Object.keys(feedOnly.services().sourcePull!).sort(), ["forget", "plan", "pull", "vocabulary"]);
  assert.deepEqual(Object.keys(readOnly.services().sourcePull!), ["evidence"]);
  const request: SourcePullRequest = { kind: "rss", operation_id: "pull-gate-1", source_name: entry.name, definition_id: entry.id };
  const options = { hold: async () => {} };
  // Outside every call: `start`, a timer.
  await assert.rejects(feedOnly.services().sourcePull!.pull!(request, options), code("plugin.source_pull_call_required"));
  await assert.rejects(readOnly.services().sourcePull!.evidence!.read(`molis-work-feed/sha256/${"a".repeat(64)}`), code("plugin.source_pull_call_required"));
  // The action must declare the permission, and be concurrent to pull; a read-only call does not pull or forget.
  await assert.rejects(feedOnly.in(services => services.sourcePull!.pull!(request, options), feedOnly.plain, []), code("plugin.source_pull_permission_undeclared"));
  await assert.rejects(feedOnly.in(services => services.sourcePull!.pull!(request, options), feedOnly.serial), code("plugin.source_pull_action_not_concurrent"));
  await assert.rejects(feedOnly.in(services => services.sourcePull!.pull!(request, options), feedOnly.query), code("plugin.source_pull_read_only"));
  await assert.rejects(feedOnly.in(services => services.sourcePull!.forget!(["pull-gate-1"]), feedOnly.query), code("plugin.source_pull_read_only"));
  // Another installation's call cannot use this one's service.
  await assert.rejects(none.in(() => feedOnly.services().sourcePull!.pull!(request, options), none.run, ["storage:private"]), code("plugin.source_pull_call_required"));
  // A pull kept past the end of its action is refused.
  let late: Promise<unknown> | undefined;
  await feedOnly.in(async services => { late = Promise.resolve().then(() => new Promise(resolve => setTimeout(resolve, 20))).then(() => services.sourcePull!.pull!(request, options)); return "finished"; });
  await assert.rejects(late!);
  assert.deepEqual(f.fetched, [], "none of these reached the transport");
});

test("S-99 RAC-1017: the source vocabulary is pure data, needs sources:pull_feed, and reaches nothing", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const probe = await f.start("vocab", [FEED]), queryOnly = await f.start("vocabquery", [QUERY]), none = await f.start("vocabnone", ["storage:private"]);
  assert.equal(queryOnly.services().sourcePull!.vocabulary, undefined, "another permission does not bring it");
  assert.equal(none.services().sourcePull, undefined);
  const vocabulary = () => probe.services().sourcePull!.vocabulary!;
  // Outside every call, without the permission on the calling action, from another installation: refused.
  assert.throws(() => vocabulary().catalog(), code("plugin.source_pull_call_required"));
  await assert.rejects(probe.in(services => Promise.resolve(services.sourcePull!.vocabulary!.catalog()), probe.plain, []), code("plugin.source_pull_permission_undeclared"));
  await assert.rejects(none.in(() => Promise.resolve(vocabulary().catalog()), none.run, ["storage:private"]), code("plugin.source_pull_call_required"));
  // In a call that holds it, a read-only one included: data, the same each time, and a copy a plugin cannot use to change the next answer.
  const answers = await probe.in(async services => {
    const v = services.sourcePull!.vocabulary!;
    const first = v.catalog(), again = v.catalog();
    first[0]!.limitations.push?.("tampered");
    return { first: v.catalog(), again, custom: v.normalizeCustomRssUrl("https://Example.com/feed.xml#top"), channel: v.normalizeYouTubeChannel("UCabcdefghijklmnopqrstuv"),
      feedUrl: v.youTubeChannelFeedUrl("UCabcdefghijklmnopqrstuv"), kinds: [v.isRssSourceKind("rss"), v.isRssSourceKind("research_library")],
      failure: v.rssCursorAfterFailure({}), success: v.rssCursorAfterSuccess({}, { status: 200, etag: "\"a\"" } as never, "2026-10-26T00:00:00.000Z"), failures: v.rssFailureCount(v.rssCursorAfterFailure({}).cursor) };
  }) as { first: Array<{ source_id: string; limitations: string[] }>; again: unknown[]; custom: string; channel: string; feedUrl: string; kinds: boolean[]; failure: { failures: number }; success: { rss_http: { etag?: string } }; failures: number };
  assert.deepEqual(answers.first, answers.again, "the same call, the same catalog");
  assert.ok(answers.first.length > 0 && answers.first.every(entry => !entry.limitations.includes("tampered")), "an answer is a copy");
  assert.deepEqual(answers.kinds, [true, false]);
  assert.equal(answers.failure.failures, 1);
  assert.equal(answers.failures, 1);
  assert.equal(answers.success.rss_http.etag, "\"a\"");
  assert.match(answers.feedUrl, /^https:\/\/www\.youtube\.com\//u);
  const readOnly = await probe.in(services => Promise.resolve(services.sourcePull!.vocabulary!.catalog().length), probe.query);
  assert.equal(readOnly, answers.first.length, "a read-only call may ask");
  // Arguments are bounded text or plain data; what the integration refuses is refused.
  await assert.rejects(probe.in(services => Promise.resolve(services.sourcePull!.vocabulary!.normalizeCustomRssUrl("x".repeat(3_000)))), code("plugin.source_pull_request_invalid"));
  await assert.rejects(probe.in(services => Promise.resolve(services.sourcePull!.vocabulary!.normalizeCustomRssUrl(42 as never))), code("plugin.source_pull_request_invalid"));
  await assert.rejects(probe.in(services => Promise.resolve(services.sourcePull!.vocabulary!.rssFailureCount((() => 1) as never))), code("plugin.source_pull_request_invalid"));
  await assert.rejects(probe.in(services => Promise.resolve(services.sourcePull!.vocabulary!.normalizeCustomRssUrl("http://127.0.0.1/feed.xml"))));
  assert.deepEqual(f.fetched, [], "the vocabulary never reached a transport");
});

test("S-99 RAC-1017: a request is the kind's own fields and nothing else, and a kind needs its own permission", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[0]!, probe = await f.start("pullclosed", [FEED]);
  const base = { operation_id: "pull-closed-1", source_name: entry.name };
  const options = { hold: async () => {} };
  const refused = async (request: unknown, expected: string) => assert.rejects(probe.in(services => services.sourcePull!.pull!(request as SourcePullRequest, options)), code(expected), JSON.stringify(request));
  for (const extra of [{ headers: { Authorization: "Bearer x" } }, { method: "POST" }, { redirect: "follow" }, { proxy: "http://127.0.0.1:8080" }, { url: "https://example.com/feed.xml" }, { provider: "anysearch" }, { budget: { maxBytes: 1e9 } }]) {
    await refused({ kind: "rss", ...base, definition_id: entry.id, ...extra }, "plugin.source_pull_request_invalid");
  }
  await refused({ kind: "rss", ...base }, "plugin.source_pull_request_invalid");
  await refused({ kind: "rss", ...base, definition_id: "" }, "plugin.source_pull_request_invalid");
  await refused({ kind: "ftp", ...base, definition_id: entry.id }, "plugin.source_pull_request_invalid");
  await refused({ kind: "rss", operation_id: "has space", source_name: "n", definition_id: entry.id }, "plugin.source_pull_request_invalid");
  await refused({ kind: "web_query", ...base, query: "weather" }, "plugin.source_pull_permission_undeclared");
  await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "rss", ...base, definition_id: entry.id }, {} as never)), code("plugin.source_pull_hold_invalid"));
  // Addresses the platform will not fetch are refused before anything leaves (S-10), and a catalog entry that does not exist is not a source.
  for (const feed_url of ["https://127.0.0.1/feed.xml", "http://example.com/feed.xml", "https://10.0.0.5/feed.xml", "https://user:pw@example.com/feed.xml"]) {
    await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "custom_rss", ...base, feed_url }, options)), feed_url);
  }
  await assert.rejects(probe.in(services => services.sourcePull!.pull!({ kind: "rss", ...base, definition_id: "no-such-source" }, options)));
  assert.deepEqual(f.fetched, [], "no refused request reached the transport");
});

test("S-99 RAC-1018: evidence is read back only by an installation that holds evidence:read, only for the Home's evidence references", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const probe = await f.start("pullevidence", [EVIDENCE]);
  const stored = evidence().write("# Evidence\n\nA body written for the read test.").contentRef;
  assert.equal(await probe.in(services => services.sourcePull!.evidence!.read(stored)), "# Evidence\n\nA body written for the read test.");
  assert.equal(await probe.in(services => services.sourcePull!.evidence!.read(`molis-work-feed/sha256/${"0".repeat(64)}`)), null, "a reference with no body is null, not an error");
  for (const bad of ["research:pkg", "../../etc/passwd", `molis-work-feed/sha256/${"A".repeat(64)}`, "", `molis-work-feed/sha256/${"a".repeat(63)}`, 5]) {
    await assert.rejects(probe.in(services => services.sourcePull!.evidence!.read(bad as string)), code("plugin.source_pull_request_invalid"), String(bad));
  }
  await assert.rejects(probe.in(services => services.sourcePull!.evidence!.read(stored), probe.plain, []), code("plugin.source_pull_permission_undeclared"));
  const feedOnly = await f.start("pullnoevidence", [FEED]);
  assert.equal(feedOnly.services().sourcePull!.evidence, undefined, "a plugin that only pulls cannot read bodies");
});

test("S-99 RAC-1019: forgetting search records takes the pull's own, in this project, and nothing else", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const entry = f.catalog[0]!, probe = await f.start("pullforget", [FEED]);
  f.feeds.set(entry.feed_url, rss("Forget feed", [{ id: "forget-1", title: "Forget one", text: "A body whose search record is forgotten." }]));
  const records = () => (f.runtime.store.db.prepare("SELECT key FROM feed_runtime_blobs WHERE namespace LIKE '%/data/operation/v1'").all() as Array<{ key: string }>).length;
  const result = await probe.in(services => services.sourcePull!.pull!({ kind: "rss", operation_id: "pull-forget-1", source_name: entry.name, definition_id: entry.id }, { hold: async () => {} })) as { operation_id: string };
  assert.equal(records(), 1, "the pull left one search record in the project's library");
  assert.deepEqual(await probe.in(services => services.sourcePull!.forget!(["some-other-pull"])), { records_deleted: 0 });
  assert.equal(records(), 1);
  for (const bad of [["has space"], ["a".repeat(201)], "pull-forget-1", Array.from({ length: 1_001 }, (_, at) => `p${at}`)]) {
    await assert.rejects(probe.in(services => services.sourcePull!.forget!(bad as string[])), code("plugin.source_pull_request_invalid"));
  }
  assert.deepEqual(await probe.in(services => services.sourcePull!.forget!([result.operation_id])), { records_deleted: 1 });
  assert.equal(records(), 0);
});

test("S-99 RAC-1016: a web query is planned without leaving, and a query that is too short is refused", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const probe = await f.start("pullquery", [QUERY]);
  const request: SourcePullRequest = { kind: "web_query", operation_id: "pull-query-1", source_name: "Weather", query: "  weather   in   Oslo " };
  const planned = await probe.in(services => services.sourcePull!.plan!(request)) as { intent_fingerprint: string };
  const again = await probe.in(services => services.sourcePull!.plan!({ ...request, query: "weather in Oslo" })) as { intent_fingerprint: string };
  assert.match(planned.intent_fingerprint, /^sha256:/u);
  assert.equal(planned.intent_fingerprint, again.intent_fingerprint, "the query is normalized the way the Feed normalizes it");
  await assert.rejects(probe.in(services => services.sourcePull!.plan!({ ...request, query: "x" })), code("feed.source_query_invalid"));
  await assert.rejects(probe.in(services => services.sourcePull!.plan!({ kind: "rss", operation_id: "pull-query-2", source_name: "n", definition_id: f.catalog[0]!.id })), code("plugin.source_pull_permission_undeclared"));
  assert.deepEqual(f.fetched, []);
});

const LIBRARY: RepositoryReadRequest = { repository: "fixture/research", source_id: "observations" };

test("S-99 RAC-1019: repository.read returns a research library's entries and nothing of the platform's cache, running only the Git a fixed address needs", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const probe = await f.start("pullrepo", [REPOSITORY]), published = publishLibrary(f.library);
  assert.deepEqual(Object.keys(probe.services().sourcePull!), ["repository"]);
  const result = await probe.in(services => services.sourcePull!.repository!.read(LIBRARY)) as { repository: string; revision: string; entries: Array<{ id: string; title: string; url: string; tags: string[]; provenance: Record<string, unknown> }> };
  assert.equal(result.repository, "fixture/research"); assert.equal(result.revision, REVISION);
  assert.deepEqual(result.entries.map(entry => entry.id), ["daily-v1:finding-1"]);
  assert.equal(result.entries[0]!.provenance.manifest_sha256, published.manifest_sha256);
  assert.equal(result.entries[0]!.url, `https://github.com/fixture/research/blob/${REVISION}/packages/observations/daily-v1/report.md`);
  assert.deepEqual(Object.keys(result).sort(), ["entries", "repository", "revision"], "entries and the revision, no path and no Git output");
  assert.equal(JSON.stringify(result).includes(resolveMolisWorkHome()), false, "no path of the platform's cache is in the result");
  // The only text of the plugin's in any Git argument is the repository, inside the fixed address; everything else is fixed or Git's own.
  const shapes = f.gitCalls.map(args => args[0] === "show" ? ["show", args[1]!.startsWith(`${REVISION}:`) ? "<revision>:<published file>" : args[1]] : args[0] === "ls-tree" ? [...args.slice(0, 3), "<revision>"] : [...args]);
  assert.deepEqual(shapes[0], ["init", "--bare"]);
  assert.deepEqual(shapes[1], ["fetch", "--depth=1", "https://github.com/fixture/research.git", "main"]);
  assert.deepEqual(shapes[2], ["rev-parse", "FETCH_HEAD"]);
  assert.deepEqual(shapes[3], ["ls-tree", "-r", "--name-only", "<revision>"]);
  for (const shape of shapes.slice(4)) assert.deepEqual(shape, ["show", "<revision>:<published file>"]);
  assert.equal(f.gitCalls.filter(args => args[0] === "show").length, 5, "the two indexes and the package's three files");
});

test("S-99 RAC-1019: repository.read refuses what is not a repository and a source, a call it is not offered to, an unpublished or edited library, and a cancelled call", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const probe = await f.start("pullrepo2", [REPOSITORY]), feedOnly = await f.start("pullrepo3", [FEED]);
  publishLibrary(f.library);
  assert.equal(feedOnly.services().sourcePull!.repository, undefined, "a plugin without the permission has no repository read");
  const refused = (request: unknown, expected = "plugin.source_pull_request_invalid") => assert.rejects(probe.in(services => services.sourcePull!.repository!.read(request as RepositoryReadRequest)), code(expected), JSON.stringify(request));
  for (const repository of ["../x/y", "owner/..", "owner/a..b", "-o/name", "owner/-name", "owner", "a/b/c", "owner/name;rm", "owner/na me", "https://github.com/a/b", "", " ", "o".repeat(101) + "/name"]) {
    await refused({ ...LIBRARY, repository });
  }
  for (const source_id of ["", "a/b", "../x", "x y", "a".repeat(101)]) await refused({ ...LIBRARY, source_id });
  await refused({ ...LIBRARY, branch: "dev" }); await refused({ ...LIBRARY, depth: 0 }); await refused({ repository: LIBRARY.repository }); await refused(null); await refused([LIBRARY]); await refused("fixture/research");
  assert.deepEqual(f.gitCalls, [], "no refused request reached Git");
  // Where it may be called from: not outside a call, not by another installation, not without the permission on the action, not serially, not read-only.
  await assert.rejects(probe.services().sourcePull!.repository!.read(LIBRARY), code("plugin.source_pull_call_required"));
  await assert.rejects(feedOnly.in(() => probe.services().sourcePull!.repository!.read(LIBRARY), feedOnly.run, [FEED]), code("plugin.source_pull_call_required"));
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY), probe.plain, []), code("plugin.source_pull_permission_undeclared"));
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY), probe.serial), code("plugin.source_pull_action_not_concurrent"));
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY), probe.query), code("plugin.source_pull_read_only"));
  assert.deepEqual(f.gitCalls, []);
  // A library that is not published, a source it does not list, and a file edited after the index hashed it give no entries and no raw Git text.
  publishLibrary(f.library, { enabled: false });
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY)), /未开放发布/u);
  publishLibrary(f.library);
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read({ ...LIBRARY, source_id: "unlisted" })), /未开放发布/u);
  publishLibrary(f.library, { tamper: true });
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY)), /哈希与发布索引不一致/u);
  // A call cancelled while Git runs returns nothing.
  publishLibrary(f.library);
  const controller = new AbortController();
  f.gitHooks.onShow = () => controller.abort();
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY, { signal: controller.signal })));
  f.gitHooks.onShow = undefined;
  const before = f.gitCalls.length, aborted = AbortSignal.abort();
  await assert.rejects(probe.in(services => services.sourcePull!.repository!.read(LIBRARY, { signal: aborted })));
  assert.equal(f.gitCalls.length, before, "a call that is already cancelled never reaches Git");
});
