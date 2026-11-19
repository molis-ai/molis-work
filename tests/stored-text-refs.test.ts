import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationOverviewAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { actionCardView, draftActionCard, runActionCard, type ActionCard, type ActionCardPorts } from "@molis-ai/molis-work-plugin-sdk";
import { createTextReader } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantCardHtml } from "@molis-ai/molis-work-app-local-host";
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

// QEA-182 exercises persisted card results, the three upgrades and both display languages through their owners.
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
