import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { feedQueryActions } from "@molis-ai/molis-work-plugin-feed";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { inboxActions, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

/**
 * Optional areas (Feed, Inbox, Schedule, Artifacts) are looked for on every page of a project; a project without them must not be
 * told "no" in its call log by its own pages, or the rows a person asked for are lost among rows nobody asked for.
 */
interface Fixture { home: string; base: string; host: MolisWorkLocalHost; catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>; projectId: string; reference: ReturnType<typeof molisWorkHostProjectReference> }
type HostOptions = NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>;
const withProject = async (plugins: string[], run: (fixture: Fixture) => Promise<void>, hostOptions: Partial<HostOptions> = {}) => {
  const home = await mkdtemp(join(tmpdir(), "optional-areas-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "只有目标", actor_id: "test" });
  // SYS-15-S7: new projects enable Schedule by default; this fixture explicitly tests the person's disabled state.
  catalog.removeProjectPlugin({ project_id: created.project_id, plugin_id: "schedule", actor_id: "test" });
  for (const plugin_id of plugins) catalog.addProjectPlugin({ project_id: created.project_id, plugin_id, actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  // The policy the desktop gives its Host: a plugin a project has not installed answers "not enabled".
  const host = new MolisWorkLocalHost({ ...hostOptions, homeDirectory: home, actionAvailability: projectActionAvailability(async (_, run) => run(catalog), home) });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: "optional-areas-test-control-token" });
  try {
    assert.deepEqual(catalog.listProjectPlugins(created.project_id).filter(id => ["feed", "inbox", "schedule", "artifacts"].includes(id)).sort(), [...plugins].sort());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    await run({ home, base: `http://127.0.0.1:${address.port}`, host, catalog, projectId: project.project_id, reference });
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
};
const get = async (url: string) => { const response = await fetch(url); const text = await response.text(); return { status: response.status, text }; };
const rowsOf = (host: MolisWorkLocalHost, projectId: string) => host.callLog!.list(projectId).map(row => [row.capability_id, row.code ?? "ok", row.refused === true]);

test("OPTAREA-01 loading the pages of a project that has no Feed, Inbox or Schedule leaves nothing in the call log", { timeout: 90_000 }, async () => {
  await withProject([], async ({ base, host, projectId, reference }) => {
    const goals = bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: projectId, audience: "user" as const, permissions: ["goals:read", "goals:write"] }));
    await goals.invoke(goalsActions.create, { goal_id: "G1", title: "一个目标", idempotency_key: "create" });
    const before = rowsOf(host, projectId);
    assert.deepEqual(before, [[goalsActions.create.capability_id, "ok", false]], "only the person's own command so far");
    // The workbench, a Goal, the archive and the trash, the settings, the board view, and again: a page is not a person asking.
    for (const path of ["/", "/", "/goals/G1", "/goals/G1", "/archive", "/trash", "/settings", "/api/board"]) {
      const { status } = await get(`${base}/projects/${projectId}${path}`);
      assert.equal(status, 200, path);
    }
    assert.deepEqual(rowsOf(host, projectId), before, "a page that looks for an optional area is not a person asking for it, so the area's refusal is not a record");
    assert.deepEqual(host.callLog!.recent(50, { failedOnly: true }), []);
  });
});

test("OPTAREA-02 a person's own call to a plugin the project does not have is still recorded as not run, so its number can be found", { timeout: 60_000 }, async () => {
  await withProject([], async ({ base, host, projectId, reference }) => {
    await get(`${base}/projects/${projectId}/`);
    const caller = { actor_id: "web-user", project_id: projectId, audience: "user" as const, permissions: ["feed:read"] };
    // Feed is a Runtime plugin (FI-7): where the project lacks it, its Runtime is not started and its actions are not in the project's
    // directory, so the call is refused as missing, and still recorded as not run.
    await assert.rejects(bindActionClient(host.actionClient(reference), () => caller).invoke(feedQueryActions.snapshot, {}), { code: "actions.missing" });
    assert.deepEqual(rowsOf(host, projectId), [[feedQueryActions.snapshot.capability_id, "actions.missing", true]]);
    // The page of an area the person asks for by name, Feed's stage in a project without Feed, is refused before any call (FI-7: the
    // stage is the shell's), so the log keeps only the call above.
    assert.equal((await get(`${base}/projects/${projectId}/api/stage/feed`)).status, 403);
    assert.deepEqual([...new Set(rowsOf(host, projectId).map(row => row[0]))], [feedQueryActions.snapshot.capability_id]);
    assert.ok(rowsOf(host, projectId).every(row => row[1] === "actions.missing" && row[2]));
  });
});

test("OPTAREA-03 a project that has the optional plugins still shows them on its page, and the page load records no failure", { timeout: 60_000 }, async () => {
  await withProject(["feed", "inbox", "schedule", "artifacts"], async ({ base, host, projectId }) => {
    const { status } = await get(`${base}/projects/${projectId}/`);
    assert.equal(status, 200);
    assert.equal(((await (await fetch(`${base}/projects/${projectId}/api/board`)).json()) as { feed_source_catalog: unknown[] }).feed_source_catalog.length > 0, true, "Feed is asked for and answers");
    assert.deepEqual(host.callLog!.recent(50, { failedOnly: true }), []);
    assert.deepEqual(host.callLog!.list(projectId).filter(row => row.operation !== "command"), []);
  });
});

test("OPTAREA-04 the page follows the project's plugins as they change: enabling Feed makes its area appear without a restart, and removing it makes it go, with no row either way", { timeout: 60_000 }, async () => {
  await withProject([], async ({ base, host, catalog, projectId }) => {
    const board = async () => (await (await fetch(`${base}/projects/${projectId}/api/board`)).json()) as { feed_source_catalog: unknown[] };
    assert.equal((await board()).feed_source_catalog.length, 0);
    catalog.addProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "test" });
    assert.equal((await board()).feed_source_catalog.length > 0, true);
    catalog.removeProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "test" });
    assert.equal((await board()).feed_source_catalog.length, 0);
    assert.deepEqual(host.callLog!.recent(50, { failedOnly: true }), []);
  });
});

test("OPTAREA-05 a Goal reads the platform Artifacts with or without its project shell, without a refusal in the call log", { timeout: 90_000 }, async () => {
  await withProject([], async ({ base, host, catalog, projectId, reference }) => {
    const goals = bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: projectId, audience: "user" as const, permissions: ["goals:read", "goals:write"] }));
    await goals.invoke(goalsActions.create, { goal_id: "G1", title: "一个目标", idempotency_key: "create" });
    const without = await get(`${base}/projects/${projectId}/goals/G1`);
    assert.equal(without.status, 200);
    assert.doesNotMatch(without.text, /data-artifact-unavailable/);
    assert.deepEqual(rowsOf(host, projectId), [[goalsActions.create.capability_id, "ok", false]]);
    catalog.addProjectPlugin({ project_id: projectId, plugin_id: "artifacts", actor_id: "test" });
    const withShell = await get(`${base}/projects/${projectId}/goals/G1`);
    assert.equal(withShell.status, 200);
    assert.doesNotMatch(withShell.text, /data-artifact-unavailable/);
    assert.deepEqual(rowsOf(host, projectId), [[goalsActions.create.capability_id, "ok", false]]);
  });
});

test("OPTAREA-06 advancing a Goal in a project without Feed leaves no row about the Feed context it looked for", { timeout: 60_000 }, async () => {
  await withProject([], async ({ base, host, projectId, reference }) => {
    const goals = bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: projectId, audience: "user" as const, permissions: ["goals:read", "goals:write"] }));
    await goals.invoke(goalsActions.create, { goal_id: "G1", title: "一个目标", idempotency_key: "create" });
    const advanced = await get(`${base}/projects/${projectId}/api/goals/G1/advance-prompt`);
    assert.equal(advanced.status, 200, advanced.text);
    assert.deepEqual(rowsOf(host, projectId).map(row => row[0]), [goalsActions.create.capability_id]);
  });
});

test("RAC-483 a project whose Feed went after Inbox judged one of its items still opens; while Feed is there, a caller that cannot read the item is told so", { timeout: 90_000 }, async () => {
  const functions: NonNullable<HostOptions["functions"]> = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: { async evaluate(_key, record) {
    return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null, model: record.model, noul: null, score: null, legend: null };
  } } };
  await withProject(["feed", "inbox"], async ({ home, base, host, catalog, projectId, reference }) => {
    const caller: ActionCallContext = { actor_id: "owner", project_id: projectId, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "evidence:read"] };
    const actions = host.actionClient(reference);
    await actions.discover(caller); // the project's plugins start, and the Inbox scene's rule is written when its scene registers
    const entry = await host.withProject(reference, runtime => {
      const feed = createLocalFeedApplication(runtime.store.db);
      const source = createLocalFeedSourceService(runtime.store.db, runtime.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "feed-absent" }).source;
      const item = feed.ingestItem({ source, externalId: "article-1", title: "核对发布说明", summary: "尚未确认", body: "原文内容", occurredAt: new Date().toISOString(), attention: false }).item;
      return feed.ensureInboxEntryForFeedItem(runtime.project_id, item.item_id, "manual").entry;
    });
    const rule = withFunctionsService(home, service => service.list().find(row => row.function_key === "system_pick_inbox_next")!, functions);
    await actions.invoke(caller, inboxActions.writeJudgment, { function_key: rule.function_key });
    const judged = (await actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }) as { judgments: JudgmentRecord[] }).judgments;
    const recommendations = async (who: ActionCallContext) => (await actions.invoke(who, inboxActions.recommendations, {}) as { judgments: JudgmentRecord[] }).judgments;
    assert.deepEqual(await recommendations(caller), judged);
    // Feed is in the project: a client granted the advice and the rule but not the item's text is refused, not shown fewer judgments.
    const narrow = { ...caller, allowed_actions: [inboxActions.recommendations, publishedFunctionAction(rule)] };
    await assert.rejects(recommendations(narrow), { code: "actions.dependency_missing" });
    // BL-800: Feed goes and Inbox stays. Attention shows only the entries of a running plugin that declares them, so Feed's entry leaves
    // Inbox with it, and its advice with the entry (as an entry that is gone); nothing reads Feed, and the project's page opens.
    const listed = async () => ((await (await fetch(`${base}/projects/${projectId}/api/plugins/io.molis.work.inbox/entries`)).json()) as { entries: Array<{ entry_id: string }> }).entries
      .some(row => row.entry_id === entry.entry_id);
    assert.equal(await listed(), true);
    catalog.removeProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "test" });
    assert.deepEqual(await recommendations(caller), []);
    assert.equal(await listed(), false);
    for (const path of ["/", "/api/board"]) assert.equal((await get(`${base}/projects/${projectId}${path}`)).status, 200, path);
    // BL-800 as a person takes it: Feed comes back and its entry and advice with it; then Inbox goes and takes Feed (Feed's companion) with
    // it, and only Inbox comes back. Feed's entry stays out of Inbox, its advice with it, and the project's page opens.
    catalog.addProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "test" });
    assert.equal(await listed(), true);
    assert.deepEqual(await recommendations(caller), judged);
    assert.equal(catalog.removeProjectPlugin({ project_id: projectId, plugin_id: "inbox", actor_id: "test" }).plugins.includes("feed"), false);
    assert.equal(catalog.addProjectPlugin({ project_id: projectId, plugin_id: "inbox", actor_id: "test" }).includes("feed"), false);
    assert.deepEqual(await recommendations(caller), []);
    assert.equal(await listed(), false);
    for (const path of ["/", "/api/board"]) assert.equal((await get(`${base}/projects/${projectId}${path}`)).status, 200, path);
  }, { functions });
});
