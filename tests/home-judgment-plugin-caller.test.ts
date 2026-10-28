import assert from "node:assert/strict";
import test from "node:test";
import { feedHomeJudgmentTrigger, HOME_JUDGMENT_EVALUATE } from "@molis-ai/molis-work-plugin-feed";
import { createPluginPlatform, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-goals";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { openTestHome } from "./fixtures/test-home.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

type FunctionsHostOptions = NonNullable<NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["functions"]>;
const WRITE_RULE = { capability_id: "home.judgment.write", version: 1 }, RECOMMENDATIONS = { capability_id: "home.recommendations.read", version: 1 };
/** What a person holds on the Home page, with what the dock's default rule recommends. */
const PERSON = ["home:read", "home:write", "feed:read", "evidence:read", "inbox:read", "model:invoke", "functions:invoke", "inbox:write", "attention:write"];

/**
 * What a plugin holds to run the dock's judgment as itself: the scene's own (home:read, model:invoke), the subject readers' (feed:read and evidence:read for the text it keeps, inbox:read),
 * the rule's (functions:invoke), and what the rule may recommend, which is the permissions of the actions it offers (the Inbox's status change).
 */
const JUDGE = ["actions:invoke", "home:read", "model:invoke", "feed:read", "evidence:read", "inbox:read", "functions:invoke"];
const OFFERED = ["inbox:write", "attention:write"];

async function fixture(t: import("node:test").TestContext) {
  // Registered before the Home's own close, so the plugins stop while the project is still open.
  let stop = async () => {}; t.after(() => stop());
  let judged = 0;
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) {
      judged++;
      return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null, model: record.model, noul: null, score: null, legend: null };
    },
  } };
  const test = await openTestHome(t, { host: { functions: options } });
  const project = await test.createProject("Home dock plugin caller", ["feed", "inbox"]), reference = project.reference, host = test.host;
  const user: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...PERSON, ...GOALS_ACTION_PERMISSIONS] };
  const runtime = await host.withProject(reference, runtime => runtime);
  const owned = new Set<string>();
  const registry = host.actionRegistry(reference);
  const client = { ...host.actionClient(reference), ...host.syncActionClient(reference) };
  const ports = { db: runtime.store.db, appendEvent: (event: Parameters<typeof runtime.store.appendEvent>[0]) => runtime.store.appendEvent(event), eventCursor: (id: string) => runtime.store.eventCursor(id) };
  const platform = createPluginPlatform({ db: runtime.store.db, project_id: reference.project_id, actor_id: "fixture-person", actions: { registry, client, project_id: reference.project_id }, home: null,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set() {}, delete: () => false }) });
  stop = async () => {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (owned.has(record.plugin_id) && record.state === "running") await platform.runtime.stop(record.install_id);
  };
  const feed = createLocalFeedApplication(runtime.store.db);
  const source = createLocalFeedSourceService(runtime.store.db, reference.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "plugin-caller" }).source;
  const item = feed.ingestItem({ source, externalId: "plugin-caller", title: "核对材料", summary: "真实首页事件", body: "原始内容", occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(reference.project_id, item.item_id, "manual").entry;
  const person = { invoke: (ref: { capability_id: string; version: number }, input: unknown) => host.actionClient(reference).invoke(user, ref, input) as Promise<{ judgments: JudgmentRecord[] }> };
  // The project's Runtime plugins (Inbox) attach as it opens; a discovery waits for them.
  await host.actionClient(reference).discover(user);
  let last: ActionExecutionContext | undefined;
  const start = async (name: string, permissions: string[]) => {
    const id = "io.molis.work.example." + name;
    owned.add(id);
    const command: ActionDefinition = { capability_id: name + ".run", version: 1, operation: "command", action: { title: name, description: "Runs a dock judgment as the plugin", kind: "operation", scope: "project",
      audiences: ["user"], permissions: [], scheduling: "concurrent", subject_kinds: [], input_schema: { type: "object" }, output_schema: {} } };
    let work: (directory: PluginActionDirectory) => Promise<unknown> = async () => null, directory: PluginActionDirectory | undefined;
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture-" + name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: permissions.map(permission => ({ permission, required: true, reason: "Run the Home dock's judgment" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [command] },
      async start(value) { directory = value.services!.actions!.dependencies; return { kind: "app", actions: [{ ...command, handle: (caller) => { last = caller; return work(directory!); } }] }; } };
    const report = await platform.start([{ definition, trust: { level: "host" } }]); assert.deepEqual(report.failed, []);
    return { directory: () => directory!, run: (body: typeof work) => { work = body; return client.invoke({ ...user, actor_id: "person-with-extra-rights", permissions: ["unrelated:admin"] }, command, {}); } };
  };
  return { reference, scenes: host.sceneClient(reference), person, feed, item, entry, start, judged: () => judged, caller: () => last! };
}

test("RAC-1014: Home's dock judgment is reachable by a plugin only with the grants the scene and its offers ask, and a plugin's own call reaches an Inbox entry's Feed item with its own grants", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  await f.person.invoke(WRITE_RULE, { function_key: "system_pick_home_dock" });
  const judge = await f.start("judge", [...JUDGE, ...OFFERED]), plain = await f.start("plain", JUDGE), nobody = await f.start("nobody", ["actions:invoke", "feed:read", ...OFFERED]);
  const entry = { kind: "inbox_entry", id: f.entry.entry_id };
  // Without the permission of what the rule may recommend, the dock is not available to the plugin: nothing is read, nothing judged.
  await assert.rejects(plain.run(directory => directory.invoke(HOME_JUDGMENT_EVALUATE, { subjects: [entry] })), { code: "actions.binding_invalid" });
  // Without the scene's model permission, the model is never asked.
  await assert.rejects(nobody.run(directory => directory.invoke(HOME_JUDGMENT_EVALUATE, { subjects: [entry] })));
  // The default rule covers Inbox entries; a Feed item is not its subject.
  await assert.rejects(judge.run(directory => directory.invoke(HOME_JUDGMENT_EVALUATE, { subjects: [{ kind: "feed_item", id: f.item.item_id }] })), { code: "actions.subject_incompatible" });
  // The dock reads an entry through the Inbox, which reads the Feed item behind it for the caller (S-43). The caller here is a plugin's own call;
  // the directory keeps it that (user decision 2026-10-26): the Feed item is reached with the plugin's own grants, so the judgment is made.
  const made = await judge.run(directory => directory.invoke(HOME_JUDGMENT_EVALUATE, { subjects: [entry] })) as { judgments: JudgmentRecord[] };
  assert.equal(f.judged(), 1, "the call reached the model once");
  assert.deepEqual(made.judgments.map(row => [row.outcome, row.subject.kind, row.subject.id]), [["ok", "inbox_entry", f.entry.entry_id]]);
  assert.deepEqual((await f.person.invoke(RECOMMENDATIONS, {})).judgments.map(row => row.judgment_id), made.judgments.map(row => row.judgment_id));
});

test("RAC-1015: Feed's trigger passes over a dock with nothing to judge, judges an entry the dock covers, and does not hide a refusal it cannot get past", { timeout: 120_000 }, async t => {
  const f = await fixture(t);
  const judge = await f.start("judge", [...JUDGE, ...OFFERED]), plain = await f.start("plain", JUDGE);
  const entry = { kind: "inbox_entry" as const, id: f.entry.entry_id }, item = { kind: "feed_item" as const, id: f.item.item_id };
  const trigger = (who: typeof judge, subject: { kind: "inbox_entry" | "feed_item"; id: string }, subjectProject = f.reference.project_id) => who.run(async directory => {
    await feedHomeJudgmentTrigger({ projectId: f.reference.project_id, directory: () => directory })({ ...subject, project_id: subjectProject });
    return null;
  });
  await trigger(judge, entry);
  assert.equal(f.judged(), 0, "no rule bound to the dock: nothing to judge, nothing thrown");
  await f.person.invoke(WRITE_RULE, { function_key: "system_pick_home_dock" });
  await trigger(plain, entry);
  assert.equal(f.judged(), 0, "a plugin that cannot reach what the rule recommends finds the dock unavailable and passes over it");
  await trigger(judge, item);
  assert.equal(f.judged(), 0, "an item the rule does not cover is passed over");
  await trigger(judge, entry);
  assert.equal(f.judged(), 1, "an entry the rule covers is judged as the plugin");
  await assert.rejects(trigger(judge, entry, "another-project"), { code: "actions.scope_mismatch" });
});

test("RAC-1015: the trigger passes over the codes that say the item or the rule moved, and throws any other failure while the dock is still available", async () => {
  const view = (available: boolean) => ({ capability_id: "home.judgment.evaluate", version: 1, availability: { available } });
  const run = async (failure: unknown, availableAfter: boolean) => {
    let discovered = 0;
    const directory = { discover: async () => [view(discovered++ === 0 ? true : availableAfter)] as never, invoke: async () => { throw failure; } };
    await feedHomeJudgmentTrigger({ projectId: "p", directory: () => directory as never })({ kind: "inbox_entry", id: "e", project_id: "p" });
  };
  for (const code of ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed", "actions.subject_changed", "actions.subject_unavailable", "actions.subject_incompatible"]) {
    await run(new ActionError(code, "moved"), true);
  }
  await assert.rejects(run(new ActionError("home.failed", "broken"), true), { code: "home.failed" });
  await run(new ActionError("home.failed", "broken"), false);
});
