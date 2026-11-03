import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, createChosen, intakeKey, molisWorkHostProjectReference, undoCreated, type DraftPorts } from "@molis-ai/molis-work-app-local-host";
import { FRAGMENT_ANY_OBJECT, defineFragmentOffersAction, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { screenModelMaterial } from "@molis-ai/molis-work-service-agent-host";
import { contextualCandidates, fragmentCandidates } from "@molis-ai/molis-work-kernel/contextual";

/**
 * W4-1 (specs/context-program §21, quick-create §8 point 3, AC Q02/Q04/Q08): a creation entry chosen on the bar is drafted and,
 * when its owner declared how it is undone, made at once; 「撤销」 is the owner's own undo, spent once, refused by the owner
 * when the Item changed since. Without an undo, as a proposal or with a field left to fill, it is a draft for a card.
 */
const OWNER = { project: "s1", actor: "user" };
const ports: DraftPorts = { instruction: () => "DRAFT-INSTRUCTION", screen: screenModelMaterial, today: () => "2026-10-18" };
const PASSAGE = "下周三前完成新手引导改版，周五发给二十个老用户试用并收集反馈。";
const focus = (context_id: string, text = PASSAGE): SurfaceFocus => ({ context_id, plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
  object: { kind: "pages_document", id: "doc-1", version: 3, title: "留存计划" }, targets: [{ kind: "text_range", role: "paragraph", text }] });

test("W4-1 Q02/Q04/Q08: 记成待办 and 记下灵光 are creation entries, made at once and taken back only while unchanged", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "contextual-create-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Create", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["lingguang:read", "lingguang:write", "todo:read", "todo:write"] };
  const client = host.actionClient(ref);
  const actions = { discover: () => client.discover(caller), invoke: (reference: ActionReference, input: unknown) => client.invoke(caller, reference, input) };
  const invoke = <O>(capability_id: string, input: unknown) => actions.invoke({ capability_id, version: 1 }, input) as Promise<O>;
  try {
    const directory = await actions.discover();
    // The offers queries only prepare now: the bar shows each entry once, as a creation entry.
    const fragmentTitles = fragmentCandidates(directory, focus("c0")).map(item => item.title);
    assert.ok(!fragmentTitles.includes("记成待办") && !fragmentTitles.includes("记下灵光"), fragmentTitles.join(" / "));
    const entries = contextualCandidates(directory, focus("c0")).filter(item => item.origin === "intake");
    const keyOf = (verb: string, at: SurfaceFocus) => contextualCandidates(directory, at).find(item => item.origin === "intake" && item.title === verb)!.key;
    assert.ok(entries.some(item => item.title === "记成待办") && entries.some(item => item.title === "记下灵光"), entries.map(item => item.title).join(" / "));
    const create = (verb: string, at: SurfaceFocus, request: string) => createChosen(OWNER, directory, at, undefined, keyOf(verb, at), request, { actions, ports });

    // 记下灵光: made at once from the provider's own prepare, once per request, the source named in its body.
    const spark = await create("记下灵光", focus("c1"), "req-spark");
    assert.deepEqual([spark.created, spark.draft.basis, spark.subject?.kind], [true, "prepared", "lingguang_spark"]);
    const again = await create("记下灵光", focus("c1"), "req-spark");
    assert.equal(again.subject?.id, spark.subject?.id, "the same request makes it once");
    const listed = () => invoke<{ sparks: { id: string; body: string; title: string; updated_at: string }[] }>("lingguang.list", {});
    assert.equal((await listed()).sparks.filter(item => item.body.includes("出自：留存计划")).length, 1);

    // Changed since it was made: 撤销 is refused by the owner and neither discards nor changes it; the token is spent.
    const before = (await listed()).sparks.find(item => item.id === spark.subject!.id)!;
    await invoke("lingguang.update", { id: before.id, title: "改过的标题", expected_updated_at: before.updated_at });
    await assert.rejects(undoCreated(OWNER, spark.undo_token!, actions), /别处修改/u);
    const edited = (await listed()).sparks.find(item => item.id === before.id);
    assert.equal(edited?.title, "改过的标题", "still there, as edited");
    // W4-2-11: a replay returns the current record but its undo still names the first revision.
    const replayed = await create("记下灵光", focus("c1"), "req-spark");
    assert.equal(replayed.subject?.id, before.id); assert.ok(replayed.undo_token);
    await assert.rejects(undoCreated(OWNER, replayed.undo_token, actions), (error: { code?: string }) => error.code === "lingguang.conflict");
    assert.deepEqual((await listed()).sparks.find(item => item.id === before.id), edited, "the replayed undo preserves every field of the edited spark");
    await assert.rejects(undoCreated(OWNER, spark.undo_token!, actions), (error: Error & { code?: string }) => error.code === "contextual.stale", "spent once");

    // Unchanged: 撤销 takes it out of the list (the owner keeps the record).
    const second = await create("记下灵光", focus("c2", "也许可以让新人先看一遍历史讨论"), "req-spark-2");
    assert.deepEqual(await undoCreated(OWNER, second.undo_token!, actions), { undone: true });
    assert.equal((await listed()).sparks.some(item => item.id === second.subject!.id), false);
    const unchanged = await create("记下灵光", focus("c2-replay", "先画出这条路"), "req-spark-replay");
    const unchangedReplay = await create("记下灵光", focus("c2-replay", "先画出这条路"), "req-spark-replay");
    assert.equal(unchangedReplay.subject?.id, unchanged.subject?.id);
    assert.deepEqual(await undoCreated(OWNER, unchangedReplay.undo_token!, actions), { undone: true });
    assert.equal((await listed()).sparks.some(item => item.id === unchanged.subject!.id), false, "an unedited replay still undoes its original creation");

    // 记成待办: the same, by Todo's own revert.
    const todo = await create("记成待办", focus("c3"), "req-todo");
    assert.deepEqual([todo.created, todo.draft.basis, todo.subject?.kind], [true, "prepared", "todo_item"]);
    const read = (id: string) => invoke<{ item: { id: string; title: string; revision: number; archived?: boolean; sources: { kind: string; subject: { kind: string; id: string } | null }[] } }>("todo.items.get", { id }).then(out => out.item);
    const made = await read(todo.subject!.id);
    assert.equal(made.title, "下周三前完成新手引导改版，周五发给二十个老用户试用并收集反馈");
    assert.deepEqual(made.sources.map(source => [source.kind, source.subject?.kind, source.subject?.id]), [["material", "pages_document", "doc-1"]]);
    assert.equal((await create("记成待办", focus("c3"), "req-todo")).subject?.id, made.id, "the same request makes it once");
    await invoke("todo.items.update", { id: made.id, title: "改过的待办", expected_revision: made.revision });
    await assert.rejects(undoCreated(OWNER, todo.undo_token!, actions));
    assert.equal((await read(made.id)).title, "改过的待办", "still there, as edited");
    const other = await create("记成待办", focus("c4", "约设计评审"), "req-todo-2");
    await undoCreated(OWNER, other.undo_token!, actions);
    await assert.rejects(read(other.subject!.id), "Todo's revert of a creation removes the todo");
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

// ---- what decides between made at once and a card ---------------------------------------------------------------
const provider = { provider_id: "io.example.notes", title: "Notes", plugin_id: "io.example.notes" } as ActionView["provider"];
const view = (capability_id: string, action: Partial<ActionView["action"]> = {}, operation: ActionView["operation"] = "command"): ActionView => ({
  capability_id, version: 1, provider_id: provider.provider_id, operation, provider, availability: { available: true },
  action: { title: capability_id, description: capability_id, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user"], permissions: [],
    subject_kinds: ["note"], input_schema: { type: "object", required: ["title"], properties: { title: { type: "string" }, request_id: { type: "string" } } }, ...action },
} as ActionView);
const intake = (over: Record<string, unknown> = {}) => ({ intake_id: "note", item_kind: "note", title: "笔记", verb: "记成笔记", describe: "一条笔记", examples: ["一句话"],
  prepare: { capability_id: "notes.offers", version: 1 }, ...over });
const offers = view("notes.offers", defineFragmentOffersAction("notes.offers", [FRAGMENT_ANY_OBJECT], "n", [], []).action, "query");
const undo = { capability_id: "notes.remove", version: 1, input: { id: "note.id" } };

for (const [name, entry, prepared] of [
  ["no undo declared", view("notes.create", { intake: intake() }), { title: "一条" }],
  ["a proposal", view("notes.create", { intake: intake({ effect: "proposes" }), undo }), { title: "一条" }],
  ["several Items", view("notes.create", { intake: intake({ multiple: true }), undo }), { title: "一条" }],
  ["a required field left to fill", view("notes.create", { intake: intake(), undo }), {}],
] as const) {
  test(`W4-1 Q08: ${name} comes back as a draft for a card, and nothing is called but the provider's prepare`, async () => {
    const directory = [entry, offers, view("notes.remove")];
    const called: string[] = [];
    const actions = { discover: async () => directory, invoke: async (reference: ActionReference) => {
      called.push(reference.capability_id);
      return { offers: [{ offer_id: "note", title: "记成笔记", action: { capability_id: "notes.create", version: 1 }, input: prepared }] };
    } };
    const at = focus("n1");
    const key = contextualCandidates(directory, at).find(item => item.origin === "intake")!.key;
    const out = await createChosen(OWNER, directory, at, undefined, key, "r1", { actions, ports });
    assert.deepEqual([out.created, out.undo_token, called], [false, undefined, ["notes.offers"]]);
  });
}

test("RAC-137 R11: a page names a creation entry by the id its owner declared; one match is its key, none or two is refused", () => {
  const entry = view("notes.create", { intake: intake() }), twin = view("tasks.create", { intake: intake({ title: "任务", verb: "记成任务" }) });
  const at = focus("n2"), key = contextualCandidates([entry, offers], at).find(item => item.origin === "intake")!.key;
  assert.equal(intakeKey([entry, offers], at, undefined, "note"), key);
  assert.throws(() => intakeKey([entry, offers], at, undefined, "nobody-declares-this"), /已不在当前内容的候选里/u);
  assert.throws(() => intakeKey([entry, twin, offers], at, undefined, "note"), /已不在当前内容的候选里/u);
});

test("W4-1 Q08: with an undo offered now, the entry is made at once and the undo kept behind a token", async () => {
  const directory = [view("notes.create", { intake: intake(), undo, result_subject: { id: "note.id" } }), offers, view("notes.remove")];
  const called: { capability_id: string; input: unknown }[] = [];
  const actions = { discover: async () => directory, invoke: async (reference: ActionReference, input: unknown) => {
    called.push({ capability_id: reference.capability_id, input });
    return reference.capability_id === "notes.offers" ? { offers: [{ offer_id: "note", title: "记成笔记", action: { capability_id: "notes.create", version: 1 }, input: { title: "一条" } }] }
      : reference.capability_id === "notes.create" ? { note: { id: "n-7" } } : { ok: true };
  } };
  const at = focus("n2");
  const out = await createChosen(OWNER, directory, at, undefined, contextualCandidates(directory, at).find(item => item.origin === "intake")!.key, "r2", { actions, ports });
  assert.deepEqual([out.created, out.subject], [true, { kind: "note", id: "n-7" }]);
  await undoCreated(OWNER, out.undo_token!, actions);
  assert.deepEqual(called.map(call => [call.capability_id, call.input]).slice(1), [["notes.create", { title: "一条", request_id: "r2" }], ["notes.remove", { id: "n-7" }]]);
  // Without the undo offered now (switched off, not granted), nothing runs without a card.
  const without = [directory[0]!, offers];
  const card = await createChosen(OWNER, without, at, undefined, contextualCandidates(without, at).find(item => item.origin === "intake")!.key, "r3", { actions, ports });
  assert.equal(card.created, false);
});

// ---- W4-2 (context-program §21.10): 存为文档 is made at once by Pages; 拆成目标步骤 is always a card -----------------------------
async function openHost(permissions: string[]) {
  const home = await mkdtemp(join(tmpdir(), "contextual-create-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Create", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", project_id: project.project_id, audience: "user", permissions };
  const client = host.actionClient(ref);
  const actions = { discover: () => client.discover(caller), invoke: (reference: ActionReference, input: unknown) => client.invoke(caller, reference, input) };
  return { actions, invoke: <O>(capability_id: string, input: unknown, version = 1) => actions.invoke({ capability_id, version }, input) as Promise<O>,
    close: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}
type PagesDocument = { id: string; title: string; version: number; body: { content?: { type: string; content?: { text?: string }[] }[] } };
const paragraphs = (document: PagesDocument) => (document.body.content ?? []).map(node => (node.content ?? []).map(part => part.text ?? "").join(""));

test("W4-2-03 W4-2-04: 存为文档 is made at once by Pages, in Pages too, and taken back only while no one has changed it", { timeout: 60_000 }, async () => {
  const { actions, invoke, close } = await openHost(["pages:read", "pages:write"]);
  try {
    const directory = await actions.discover();
    const at = focus("p1");
    // The passage is in a Pages document: pulling it out into a document of its own is offered there as everywhere (decision D-2).
    const entry = contextualCandidates(directory, at).find(item => item.origin === "intake" && item.title === "存为文档");
    assert.ok(entry, "offered while selecting inside Pages");
    const create = (request: string, from = at) => createChosen(OWNER, directory, from, undefined, entry!.key, request, { actions, ports });
    const get = (id: string) => invoke<{ document: PagesDocument }>("pages.get", { id }).then(out => out.document);

    const made = await create("req-doc");
    assert.deepEqual([made.created, made.draft.basis, made.subject?.kind], [true, "prepared", "pages_document"]);
    const document = await get(made.subject!.id);
    assert.equal(document.title, PASSAGE, "no heading above it: the passage's first line");
    assert.deepEqual(paragraphs(document), [PASSAGE, "摘自『留存计划』"], "the passage as selected, then where it came from");
    const retried = await create("req-doc");
    assert.equal(retried.subject?.id, document.id, "the same request makes it once");
    assert.equal(retried.undo_token, undefined, "a retry made nothing, so it has nothing to take back");
    assert.equal((await invoke<{ documents: PagesDocument[] }>("pages.list", {})).documents.length, 1);

    // Under a heading, the heading is the title.
    const under = await create("req-doc-2", { ...focus("p2", "接口先不改，只加一层适配。"), surroundings: { heading_path: ["方案", "兼容性"], before: "", after: "" } });
    assert.equal((await get(under.subject!.id)).title, "兼容性");

    // Unchanged: 撤销 is the owner's own undo and removes it; the token is spent.
    assert.deepEqual(await undoCreated(OWNER, under.undo_token!, actions), { undone: true });
    await assert.rejects(get(under.subject!.id), "gone");
    await assert.rejects(undoCreated(OWNER, under.undo_token!, actions), (error: Error & { code?: string }) => error.code === "contextual.stale", "spent once");

    // Changed since it was made: the owner refuses, says so, and the document is still there as it was edited.
    await invoke("pages.update", { id: document.id, title: "改过的标题", expected_version: document.version });
    await assert.rejects(undoCreated(OWNER, made.undo_token!, actions), /改过/u);
    assert.equal((await get(document.id)).title, "改过的标题");

    // The same request again after the edit (the page keeps its request id for the same selection): Pages answers with the document as it is
    // now, and that answer carries no undo, so no card can offer to delete what the person has since written in it.
    const again = await create("req-doc");
    assert.deepEqual([again.created, again.subject?.id, again.undo_token], [true, document.id, undefined]);
    assert.equal((await get(document.id)).title, "改过的标题", "still there, as it was edited");
    assert.equal((await invoke<{ documents: PagesDocument[] }>("pages.list", {})).documents.some(item => item.id === document.id), true);
    // The call that made it says so (`created_version`, which the undo reads); a retry does not.
    const fields = { title: "直接调用", markdown: "正文", request_id: "req-direct" };
    assert.equal((await invoke<{ created_version?: number }>("pages.create", fields, 2)).created_version, 1);
    assert.equal((await invoke<{ created_version?: number }>("pages.create", fields, 2)).created_version, undefined);
  } finally { await close(); }
});

test("W4-2-05: 拆成目标步骤 always comes back as a draft for a card, and nothing is filed until the person submits it", { timeout: 60_000 }, async () => {
  const { actions, invoke, close } = await openHost(["goals:read", "goals:write", "attention:write"]);
  try {
    const directory = await actions.discover();
    const at = focus("g1");
    // One entry by `goals.tree.submit`'s own declaration: no longer a choice of the fragment offers, and not undoable.
    assert.equal(fragmentCandidates(directory, at).some(item => item.title === "拆成目标步骤"), false);
    const entry = contextualCandidates(directory, at).find(item => item.origin === "intake" && item.title === "拆成目标步骤")!;
    assert.equal(entry.always_card, true);
    const submit = directory.find(item => item.capability_id === "goals.tree.submit")!;
    assert.equal(submit.action.undo, undefined, "withdrawing a proposal is the approval decision, not an undo");
    assert.deepEqual(submit.action.result_view?.link, { label: "去 Goals 确认", href_template: "/projects/{project_id}/?openPlugin=goals#{/proposal/proposal_id}" });
    assert.match(submit.action.result_view!.summary, /要在 Goals 里确认才生效/u);

    const proposals = () => invoke<{ proposals: unknown[] }>("goals.tree.read", {}).then(out => out.proposals.length);
    const before = await proposals();
    const out = await createChosen(OWNER, directory, at, undefined, entry.key, "req-goal", { actions, ports });
    assert.deepEqual([out.created, out.undo_token, out.draft.basis, out.draft.missing], [false, undefined, "prepared", []]);
    const input = out.draft.input as { items: { kind: string; payload: { title?: string } }[]; idempotency_key: string; summary: string };
    assert.equal(input.idempotency_key, "req-goal");
    assert.deepEqual(input.items.filter(item => item.kind === "goal").map(item => item.payload.title), ["下周三前完成新手引导改版", "周五发给二十个老用户试用并收集反馈"]);
    assert.match(out.draft.summary ?? "", /提交后要在 Goals 里确认才会生效/u);
    assert.equal(await proposals(), before, "choosing it files nothing: only the card's submit does");
  } finally { await close(); }
});
