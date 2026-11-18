import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationOverviewAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { actionCardView, draftActionCard, runActionCard, type ActionCard, type ActionCardPorts } from "@molis-ai/molis-work-plugin-sdk";
import { createTextReader } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ASSISTANT_STORE_BASELINE, PROJECT_DATABASE_BASELINE, assistantCardHtml, pluginSyncDatabaseDeclaration, upgradePluginLibrary } from "@molis-ai/molis-work-app-local-host";
import { runSqliteUpgrade } from "@molis-ai/molis-work-storage";
import { registration as workBrief } from "@molis-ai/molis-work-plugin-work-brief/registration";
import { registration as codingRegistration } from "@molis-ai/molis-work-plugin-coding/registration";
import { workBriefActions, type BriefRefreshed } from "@molis-ai/molis-work-plugin-work-brief";
import { pagePack, pageText, pluginIdOf, withPageText } from "./fixtures/page-text.js";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { takeBackGoals } from "./fixtures/goals-agreement.js";

// BL-action-card-outcome-text, BL-work-brief-source-name-text (user 2026-11-17): what is kept and shown later is a key with its raw values, or
// the owner's own words as a `literal`, never a sentence made in the language of the day; what older versions stored as sentences is
// upgraded to `literal`, and nothing reads the old shape.

const reader = (locale: "zh" | "en", ...plugins: string[]) => createTextReader({ locale, packs: [pagePack("workbench", "zh"), pagePack("workbench", "en"),
  ...plugins.flatMap(plugin => [pagePack(plugin, "zh"), pagePack(plugin, "en")])] }).text;
const zh = reader("zh"), en = reader("en");

const reference = { capability_id: "todo.items.update", version: 1, provider_id: "io.molis.work.todo" };
const view = (extra: Partial<ActionView> = {}): ActionView => ({ ...reference, operation: "command", provider: { provider_id: reference.provider_id, title: "Todo" },
  action: { title: "改待办", description: "", subject_kinds: ["todo_item"], permissions: [], audiences: ["agent"],
    input_schema: { type: "object", properties: { todo_item_id: { type: "string" }, title: { type: "string" }, due: { type: "string", format: "date" }, at: { type: "string", format: "date-time" } } } },
  availability: { available: true }, ...extra }) as never;

function keeper(now: string, subjects: Record<string, string | "missing"> = { t1: "3" }) {
  const cards = new Map<string, ActionCard>();
  let current = view(), reply: () => Promise<unknown> = async () => ({ item: { title: "写周报" } });
  const ports: ActionCardPorts = {
    store: { update: (card, expected, patch) => {
      const held = cards.get(card.card_id) ?? card;
      if (held.revision !== expected) throw new Error("conflict");
      const next = { ...held, ...patch, revision: held.revision + 1 };
      cards.set(card.card_id, next); return next;
    } },
    authority: async () => ({ discover: async () => [current], check: () => {}, invoke: async () => reply() }),
    readSubject: async subject => { const revision = subjects[subject.id]; return revision === "missing" ? "missing" : revision ? { subject, revision, title: "写周报" } as never : null; },
    now: () => new Date(now), timeZone: "Asia/Shanghai",
    refuse: (reason, message) => Object.assign(new Error(message), { reason }),
  };
  const draft = async (input: unknown, created_at?: string) => {
    const card = await draftActionCard(`card-${cards.size + 1}`, { title: "改待办", summary: "把「写周报」改一下", reference, input }, [current], { ...ports, check: () => {} });
    if (created_at) card.created_at = created_at;
    cards.set(card.card_id, card); return card;
  };
  return { ports, draft, set view(next: ActionView) { current = next; }, set reply(next: () => Promise<unknown>) { reply = next; } };
}
const run = (k: ReturnType<typeof keeper>, card: ActionCard) => runActionCard(card, { revision: card.revision, values: {} }, k.ports);

test("BL-action-card-outcome-text: a card keeps its outcome as a platform key with the raw values, never a sentence", async () => {
  const k = keeper("2026-10-20T09:00:00Z", { t1: "3", gone: "missing" });
  const passed = await run(k, await k.draft({ todo_item_id: "x", title: "写周报", at: "2026-10-19T08:30:00Z" }));
  assert.deepEqual(passed.outcome, { owner: "workbench", key: "common.action-card.time-passed",
    args: [{ name: "time", kind: "date", at: "2026-10-19T08:30:00Z", style: "datetime", time_zone: "Asia/Shanghai" }] }, "the moment is kept as it was, formatted only when shown");
  const day = await run(k, await k.draft({ todo_item_id: "x", title: "写周报", due: "2026-10-18" }, "2026-10-15T09:00:00Z"));
  assert.deepEqual(day.outcome, { owner: "workbench", key: "common.action-card.date-passed", args: [{ name: "date", kind: "date", at: "2026-10-18", style: "date" }] });
  const deleted = await k.draft({ todo_item_id: "gone", title: "写周报" });
  deleted.target = { kind: "todo_item", id: "gone", revision: "3", title: "写周报" };
  assert.deepEqual((await run(k, deleted)).outcome, { owner: "workbench", key: "common.action-card.target-deleted", args: [{ name: "title", kind: "text", text: "写周报" }] });

  k.reply = async () => { throw new ActionError("actions.outcome_unknown", "The owner has no receipt"); };
  assert.deepEqual((await run(k, await k.draft({ todo_item_id: "x", title: "a" }))).outcome,
    { owner: "workbench", key: "common.action-card.unknown", args: [{ name: "message", kind: "text", text: "The owner has no receipt" }] });
  k.reply = async () => { throw new ActionError("todo.invalid", "标题太长"); };
  assert.deepEqual((await run(k, await k.draft({ todo_item_id: "x", title: "a" }))).outcome, { literal: "标题太长" }, "the owner's own message is its words");
  k.reply = async () => ({ item: { title: "写周报" } });
  assert.deepEqual((await run(k, await k.draft({ todo_item_id: "x", title: "a" }))).outcome,
    { owner: "workbench", key: "common.punctuation.quoted", args: [{ name: "value", kind: "text", text: "写周报" }] });
  k.reply = async () => "";
  assert.deepEqual((await run(k, await k.draft({ todo_item_id: "x", title: "a" }))).outcome, { owner: "workbench", key: "common.presentation.done" });
  k.view = view({ action: { ...view().action, result_view: { summary: "接入方案已准备" } } });
  assert.deepEqual((await run(k, await k.draft({ todo_item_id: "x", title: "a" }))).outcome, { literal: "接入方案已准备" }, "a declared summary is the owner's words");
  const offered = await k.draft({ todo_item_id: "x", title: "a" });
  k.view = view({ availability: { available: false, code: "x", reason: "已对助理关闭" } } as Partial<ActionView>);
  assert.deepEqual((await run(k, offered)).outcome, { literal: "已对助理关闭" }, "the owner's reason is its words");
});

test("BL-action-card-outcome-text: the same stored card reads in the language shown, on the Host's card too", async () => {
  const k = keeper("2026-10-20T09:00:00Z");
  k.reply = async () => { throw new ActionError("todo.conflict", "version moved", { kind: "conflict" }); };
  const stale = await run(k, await k.draft({ todo_item_id: "x", title: "a" }));
  assert.equal(stale.status, "stale");
  assert.equal(zh(stale.outcome!), "数据在建议之后变化了，这张卡没有执行（version moved）");
  assert.equal(en(stale.outcome!), "The data changed after this was suggested, so the card didn’t run (version moved).");
  const late = await run(k, await k.draft({ todo_item_id: "x", title: "写周报", due: "2026-10-18" }, "2026-10-15T09:00:00Z"));
  assert.match(en(late.outcome!), /^The date on the card \(.*2026.*\) has passed/);
  assert.doesNotMatch(en(late.outcome!), /2026-10-18/, "the date is formatted when shown, in that language");
  const drawn = withPageText("en", [], () => assistantCardHtml({ ...actionCardView(stale), run_id: null }, pageText("en")));
  assert.match(drawn, /The data changed after this was suggested/);
  assert.doesNotMatch(drawn, /数据在建议之后/, "no Chinese sentence on an English page");
});

function scratch(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "molis-stored-text-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const cardBody = (card_id: string, outcome?: string) => JSON.stringify({ card_id, work_id: "w1", revision: 2, run_id: null, title: "t", summary: "s", provider: "Todo", capability_title: "c",
  effect: "write", reference, input: {}, input_schema: {}, editable: [], missing: [], status: "failed", ...(outcome === undefined ? {} : { outcome }), created_at: "2026-11-01", updated_at: "2026-11-01" });

test("BL-action-card-outcome-text: the Assistant store 1 → 2 keeps an outcome already written as its words", t => {
  const path = join(scratch(t), "assistant.db"), db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec(ASSISTANT_STORE_BASELINE.schema);
  const insert = db.prepare("INSERT INTO assistant_cards(card_id, work_id, revision, status, created_at, body) VALUES (?, 'w1', 2, 'failed', '2026-11-01', ?)");
  insert.run("said", cardBody("said", "结果未确认：连接中断。请到原处核对，不会自动重试"));
  insert.run("empty", cardBody("empty", ""));
  insert.run("none", cardBody("none"));
  insert.run("long", cardBody("long", "长".repeat(2100)));
  db.exec("PRAGMA user_version = 1");
  runSqliteUpgrade(db, path, ASSISTANT_STORE_BASELINE);
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  const body = (id: string) => JSON.parse(String((db.prepare("SELECT body FROM assistant_cards WHERE card_id = ?").get(id) as { body: string }).body)) as { outcome?: OwnedTextRef; title: string };
  assert.deepEqual(body("said").outcome, { literal: "结果未确认：连接中断。请到原处核对，不会自动重试" });
  assert.equal(body("said").title, "t", "the rest of the card is as it was");
  assert.equal("outcome" in body("empty"), false, "an empty sentence was no outcome");
  assert.equal("outcome" in body("none"), false);
  const long = body("long").outcome as { literal: string };
  assert.equal(long.literal.length, 2000);
  assert.ok(long.literal.endsWith("…"));
});

test("BL-action-card-outcome-text: the project library 4 → 5 rewrites only Coding's stored cards", t => {
  const path = join(scratch(t), "molis-work.db"), db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec(PROJECT_DATABASE_BASELINE.schema);
  const install = db.prepare("INSERT INTO plugin_runtime_installs(install_id, record_json, publisher_trust) VALUES (?, ?, 'host')");
  const official = { plugin_id: codingRegistration.manifest.plugin_id, publisher_signature: codingRegistration.manifest.publisher.signature, publisher_trust: "host" };
  install.run("install-coding", JSON.stringify({ install_id: "install-coding", ...official }));
  install.run("install-copy", JSON.stringify({ install_id: "install-copy", ...official, publisher_signature: "another-signature" }));
  install.run("install-other", JSON.stringify({ install_id: "install-other", plugin_id: "io.example.other", publisher_trust: "host" }));
  const value = (outcomes: Array<string | undefined>) => JSON.stringify({ cards: outcomes.map((outcome, index) => ({ card_id: `c${index}`, offer_id: "o", run_id: "r", status: "failed", ...(outcome === undefined ? {} : { outcome }) })) });
  const put = db.prepare("INSERT INTO plugin_private_values(install_id, item_key, item_value) VALUES (?, ?, ?)");
  put.run("install-coding", "cards:s1", value(["后台没有完成", undefined, ""]));
  put.run("install-coding", "cards:s2", value([undefined]));
  put.run("install-coding", "session:s1", JSON.stringify({ outcome: "不是卡" }));
  put.run("install-other", "cards:s1", value(["别人的数据"]));
  put.run("install-copy", "cards:s1", value(["不是官方安装"]));
  db.exec("PRAGMA user_version = 4");
  runSqliteUpgrade(db, path, PROJECT_DATABASE_BASELINE);
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 5);
  const read = (install_id: string, key: string) => JSON.parse(String((db.prepare("SELECT item_value FROM plugin_private_values WHERE install_id = ? AND item_key = ?").get(install_id, key) as { item_value: string }).item_value));
  assert.deepEqual(read("install-coding", "cards:s1").cards.map((card: { outcome?: unknown }) => card.outcome), [{ literal: "后台没有完成" }, undefined, undefined]);
  assert.equal("outcome" in read("install-coding", "cards:s1").cards[2], false, "an empty sentence was no outcome");
  assert.deepEqual(read("install-coding", "cards:s2"), JSON.parse(value([undefined])));
  assert.deepEqual(read("install-coding", "session:s1"), { outcome: "不是卡" }, "a value that is not a session's cards is left");
  assert.deepEqual(read("install-other", "cards:s1"), JSON.parse(value(["别人的数据"])), "another plugin's value is left");
  assert.deepEqual(read("install-copy", "cards:s1"), JSON.parse(value(["不是官方安装"])), "only the exact official install's values are Coding's");
});

test("BL-work-brief-source-name-text: the Work Brief library 1 → 2 keeps names and outcomes already written as their words", t => {
  const path = join(scratch(t), "work-brief.db"), db = new DatabaseSync(path);
  t.after(() => db.close());
  const manifest = workBrief.manifest, declaration = manifest.databases!.home!;
  db.exec(pluginSyncDatabaseDeclaration(manifest, declaration).schema);
  const source = (plugin_id: string, name: string) => ({ plugin_id, name, read: "ok", subjects: [], turn: "idle" });
  const card = (outcome?: string) => ({ card_id: "c", status: "failed", ...(outcome === undefined ? {} : { outcome }) });
  const body = { sources: [source("io.molis.work.risk", "风险"), source("io.example.blank", "")], claims: [], attention: [],
    next: [{ option_id: "n1", text: "t", why: "w", act: { kind: "card", card: card("后台没有完成") } }, { option_id: "n2", text: "t", why: "w", act: { kind: "assistant" } }] };
  db.prepare("INSERT INTO briefs(id, scope, title, current_version, created_at, updated_at) VALUES ('b1', 'home', '', 1, 'x', 'x')").run();
  db.prepare("INSERT INTO brief_versions(brief_id, version, as_of, created_at, produced_by_json, body_json) VALUES ('b1', 1, 'x', 'x', '{}', ?)").run(JSON.stringify(body));
  db.prepare("INSERT INTO brief_proposals(id, brief_id, base_version, created_at, produced_by_json, body_json, conflicts_json) VALUES ('p1', 'b1', 1, 'x', '{}', ?, '[]')").run(JSON.stringify(body));
  db.prepare("INSERT INTO brief_requests(project_id, actor_id, request_id, request_hash, result_json, at) VALUES ('', 'a', 'r1', 'h', ?, 'x')").run(JSON.stringify({ brief: {}, version: body, proposal: { body } }));
  db.prepare("INSERT INTO brief_requests(project_id, actor_id, request_id, request_hash, result_json, at) VALUES ('', 'a', 'r2', 'h', ?, 'x')").run(JSON.stringify({ brief: {}, version: null, proposal: null }));
  const mark = db.prepare("INSERT INTO brief_next_marks(brief_id, option_id, state, card_json, actor_id, at) VALUES ('b1', ?, ?, ?, 'a', 'x')");
  mark.run("n1", "failed", JSON.stringify(card("标题太长")));
  mark.run("n2", "done", JSON.stringify(card("")));
  mark.run("n3", "later", null);
  db.exec("PRAGMA user_version = 1");
  upgradePluginLibrary(db as never, path, manifest);
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  const json = (sql: string) => JSON.parse(String(Object.values(db.prepare(sql).get() as Record<string, string>)[0]));
  const upgraded = { ...body, sources: [{ ...source("io.molis.work.risk", ""), name: { literal: "风险" } }, { ...source("io.example.blank", ""), name: { literal: "io.example.blank" } }],
    next: [{ ...body.next[0], act: { kind: "card", card: { ...card(), outcome: { literal: "后台没有完成" } } } }, body.next[1]] };
  assert.deepEqual(json("SELECT body_json FROM brief_versions"), upgraded, "names and outcomes become words; order and everything else stay");
  assert.deepEqual(json("SELECT body_json FROM brief_proposals"), upgraded);
  assert.deepEqual(json("SELECT result_json FROM brief_requests WHERE request_id = 'r1'"), { brief: {}, version: upgraded, proposal: { body: upgraded } }, "a repeated request answers in the current shape");
  assert.deepEqual(json("SELECT result_json FROM brief_requests WHERE request_id = 'r2'"), { brief: {}, version: null, proposal: null });
  assert.deepEqual(json("SELECT card_json FROM brief_next_marks WHERE option_id = 'n1'"), { ...card(), outcome: { literal: "标题太长" } });
  assert.deepEqual(json("SELECT card_json FROM brief_next_marks WHERE option_id = 'n2'"), card(), "an empty sentence was no outcome");
  assert.equal((db.prepare("SELECT card_json FROM brief_next_marks WHERE option_id = 'n3'").get() as { card_json: unknown }).card_json, null);
});

test("BL-work-brief-source-name-text: a source's name is kept as its Manifest's name_text and reads in the language shown", { timeout: 90_000 }, async t => {
  const f = await serveHomeRuntime(t);
  takeBackGoals(f.home);
  const here = await f.project("来源名字");
  const path = `/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`;
  const { projects } = await (await f.request("/api/settings/project-plugins")).json() as { projects: Array<{ project_id: string; revision: string }> };
  const added = await f.request(path, { method: "POST", body: { plugin_id: "work-brief", expected_revision: projects.find(row => row.project_id === here.project_id)!.revision } });
  assert.equal(added.status, 200, await added.clone().text());
  // A plugin source whose Manifest declares `name_text`, as the Plugin Runtime registers it (the title is the Manifest's `name` as written).
  const todo = pluginIdOf("todo"), named: OwnedTextRef = { owner: todo, key: "todo.directory.name", fallback: "待办" };
  const overview = definePresentationOverviewAction("todo.presentation.overview", 1, "概况", []);
  const remove = f.host.actionRegistry(here.reference).registerProvider({ provider: { provider_id: todo, plugin_id: todo, title: "待办", title_text: named, kind: "plugin", project_id: here.project_id },
    definitions: [overview], handlers: [{ ...overview, handle: () => ({ summary: { literal: "两件事" }, subjects: [] }) }] });
  t.after(remove);
  const caller = person(["work-brief:read", "work-brief:write"], here.project_id);
  const refreshed = await f.host.actionClient(here.reference).invoke(caller, { capability_id: workBriefActions.refresh.capability_id, version: workBriefActions.refresh.version }, {}) as BriefRefreshed;
  const row = refreshed.version.sources.find(entry => entry.plugin_id === todo)!;
  assert.deepEqual(row.name, named, "the name is kept as the reference, not the words of the day");
  const [inChinese, inEnglish] = [reader("zh", "todo")(row.name), reader("en", "todo")(row.name)];
  assert.equal(inChinese, pagePack("todo", "zh").messages["todo.directory.name"]);
  assert.equal(inEnglish, pagePack("todo", "en").messages["todo.directory.name"]);
  assert.notEqual(inChinese, inEnglish);
  const change = refreshed.changes.find(entry => entry.kind === "source" && entry.plugin_id === todo) as { name: OwnedTextRef } | undefined;
  assert.deepEqual(change?.name, named, "the change line names it the same way");
});

test("BL-work-brief-source-name-text: the Plugin Runtime names a plugin's provider by its Manifest's name_text, bound to the plugin", { timeout: 90_000 }, async t => {
  const f = await serveHomeRuntime(t);
  takeBackGoals(f.home);
  const here = await f.project("名字来源");
  const { projects } = await (await f.request("/api/settings/project-plugins")).json() as { projects: Array<{ project_id: string; revision: string }> };
  const added = await f.request(`/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`, { method: "POST",
    body: { plugin_id: "todo", expected_revision: projects.find(row => row.project_id === here.project_id)!.revision } });
  assert.equal(added.status, 200, await added.clone().text());
  // Todo runs in the Home; its actions are offered in the project to a caller who may read it.
  const todo = pluginIdOf("todo"), views = await f.host.actionClient(here.reference).discover(person(["todo:read"], here.project_id));
  const provider = views.find(view => view.provider.plugin_id === todo)?.provider;
  assert.ok(provider, "Todo offers its actions here");
  assert.deepEqual(provider.title_text, { key: "todo.directory.name", owner: todo, fallback: provider.title });
});
