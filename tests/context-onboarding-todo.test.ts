import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_ORGANIZE_MATERIAL_CHARS, TODO_PLUGIN_ID } from "@molis-ai/molis-work-plugin-todo/contract";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withContextJourneys } from "../apps/local-host/dist/context-onboarding-store.js";
import { TODO_PART_CHARS, adoptContextJourney, reopenContextJourney, selectContextSources, stageContextFile, startContextJourney, waitContextJourney } from "../apps/local-host/dist/context-onboarding-service.js";
import { modelPromptText, type ModelPromptInput } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const MAIL = "小王你好，请周五前发新版方案，预算等小李确认。另外，下周的团建改到周四，大家知悉。";
const TODOS = JSON.stringify({
  candidates: [
    { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true }, due: { date: null, phrase: null }, placement: "project",
      evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], depends_on: ["c2"] },
    { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, phrase: null }, placement: "personal",
      waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
    { ref: "c3", kind: "suggestion", title: "今天催小李确认预算", why: "预算影响周五交付", owner: { who: "你", stated: false }, due: { date: null, phrase: null },
      evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
  ],
  reference_only: [{ summary: "团建改到周四（通知）", material: 1 }],
});

async function fixture(t: Parameters<Parameters<typeof test>[1]>[0], todoModel: ((input: ModelPromptInput) => Promise<string>) | null) {
  const dir = await mkdtemp(join(tmpdir(), "molis-context-todo-"));
  const host = new MolisWorkLocalHost({ homeDirectory: dir, completeText: todoModel });
  t.after(async () => { await host.close(); await rm(dir, { recursive: true, force: true }); });
  const withCatalog = withMolisWorkProjectCatalog;
  const ports = {
    withCatalog,
    model: async () => ({ completeText: async () => "# 新版方案\n张总要求周五前发新版方案，预算等小李确认。[S1]" }),
    actions: async (_home: string, projectId: string, original_file?: { path: string; install_id: string }) => {
      const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      return bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["pages:read", "pages:write", "artifacts:read", "artifacts:write", "todo:read", "todo:write"], ...original_file ? { original_file } : {} }));
    },
    homeActions: (_home: string, signal: AbortSignal) => bindActionClient(host.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: ["todo:read", "todo:write", "model:invoke"], signal })),
  };
  const id = randomUUID();
  withContextJourneys(dir, store => store.create(id));
  selectContextSources(dir, id, { sources: [{ kind: "browser", selected: true, text: MAIL }] });
  return { dir, id, ports };
}

// PG031-F03: real organizer regression after moving its limit import; tracked-consumer search and build check the export wiring.
test("onboarding gives an overview and todo drafts; the kept drafts become the new project's todos, once; the rest wait in Todo", async t => {
  let calls = 0;
  const { dir, id, ports } = await fixture(t, async () => { calls += 1; return TODOS; });
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id);
  assert.equal(ready.phase, "review", ready.error ?? "");
  assert.equal(ready.todo?.status, "ready");
  const candidates = ready.todo!.batches[0]!.candidates;
  assert.deepEqual(candidates.map(candidate => [candidate.title, candidate.selected]), [["发送新版方案", true], ["等待小李确认预算", true], ["今天催小李确认预算", false]]);
  assert.equal(ready.todo!.batches[0]!.origin, "onboarding");
  const kept = candidates.filter(candidate => candidate.selected).map(candidate => candidate.candidate_id);
  const adopted = await adoptContextJourney(dir, id, { title: "新版方案", body: ready.summary!.body, todo_selected: kept }, ports);
  assert.equal(adopted.phase, "complete", adopted.error ?? "");
  assert.equal(adopted.todo?.added?.length, 2);
  const store = openTodoStore(dir);
  try {
    const items = store.list({ projectId: adopted.project_id, projectIds: [], actor: "user", actorId: "test" });
    const send = items.find(item => item.title === "发送新版方案")!, wait = items.find(item => item.title === "等待小李确认预算")!;
    assert.deepEqual([send.placement, send.project_id], ["project", adopted.project_id], "建议放进项目的进了新项目");
    assert.deepEqual([wait.placement, wait.status], ["personal", "waiting"]);
    assert.equal(send.sources[0]!.kind, "onboarding");
    assert.deepEqual(send.links.map(link => link.subject.id), [wait.id]);
  } finally { store.close(); }
  await adoptContextJourney(dir, id, { title: "重复请求" }, ports);
  const again = openTodoStore(dir);
  try { assert.equal(again.list({ projectId: null, projectIds: adopted.project_id ? [adopted.project_id] : [], actor: "user", actorId: "test" }).length, 2, "重试不重复加入"); } finally { again.close(); }
  assert.equal(calls, 1, "草稿只整理一次");
  const actions = await ports.actions(dir, adopted.project_id);
  const { batches } = await actions.invoke((await import("@molis-ai/molis-work-plugin-todo")).todoOrganizeActions.list, {});
  assert.deepEqual(batches.map(batch => batch.candidates.filter(candidate => !candidate.decision).map(candidate => candidate.title)), [["今天催小李确认预算"]]);
});

test("when the drafts cannot be made, the overview still comes and the project is still adopted", async t => {
  const { dir, id, ports } = await fixture(t, null);
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id);
  assert.equal(ready.phase, "review");
  assert.equal(ready.todo?.status, "failed");
  assert.match(ready.todo!.error!, /文字模型/);
  const adopted = await adoptContextJourney(dir, id, { title: "新版方案", body: ready.summary!.body, todo_selected: [] }, ports);
  assert.equal(adopted.phase, "complete");
});

for (const mode of ["missing", "cancelled"] as const) {
  test(`PG031-F01 ${mode} Todo extraction stays visible beside the overview and writes no drafts or items`, async t => {
    let calls = 0;
    const { dir, id, ports } = await fixture(t, async () => { calls++; return TODOS; });
    const cancelled = new AbortController();
    startContextJourney(dir, id, { ...ports, homeActions: (home, signal): BoundActionClient => {
      const client = ports.homeActions(home, AbortSignal.any([signal, cancelled.signal]));
      return {
        discover: async () => (await client.discover()).filter(view => mode !== "missing" || view.capability_id !== "todo.organize.extract"),
        invoke: (definition, input, control) => { cancelled.abort(); return client.invoke(definition, input, control); },
      };
    } });
    const ready = await waitContextJourney(dir, id);
    assert.equal(ready.phase, "review", ready.error ?? "");
    assert.equal(ready.todo?.status, "failed");
    assert.match(ready.todo!.error!, mode === "missing" ? /todo\.organize\.extract@1 未在当前项目登记或未获授权/ : /取消|abort/iu);
    assert.equal(calls, 0, "the rejected action never invokes the model");
    assert.equal(ready.todo!.batches.length, 0);
    const { batches } = await ports.homeActions(dir, AbortSignal.timeout(10_000)).invoke(todoOrganizeActions.list, {});
    assert.equal(batches.length, 0);
    const store = openTodoStore(dir);
    try {
      const access = { projectId: null, everything: true, actor: "user" as const, actorId: "test" };
      assert.equal(store.list(access).length, 0);
    } finally { store.close(); }
  });
}

test("PG031-F01 a retry with every Todo batch checkpointed needs no discovery or new cancellation window", async t => {
  let calls = 0;
  const { dir, id, ports } = await fixture(t, async () => { calls++; return TODOS; });
  startContextJourney(dir, id, ports);
  const first = await waitContextJourney(dir, id);
  assert.equal(first.todo?.status, "ready", first.todo?.error ?? "");
  withContextJourneys(dir, store => {
    const journey = store.get(id);
    journey.phase = "failed"; journey.todo!.status = "pending";
    store.save(journey);
  });
  let bindings = 0;
  startContextJourney(dir, id, { ...ports, homeActions: () => { bindings++; throw new Error("No new batch needs an action client"); } });
  const resumed = await waitContextJourney(dir, id);
  assert.equal(resumed.phase, "review", resumed.error ?? "");
  assert.equal(resumed.todo?.status, "ready", resumed.todo?.error ?? "");
  assert.deepEqual(resumed.todo!.batches, first.todo!.batches);
  assert.equal(bindings, 0); assert.equal(calls, 1);
});

// No 50-material cap (user 2026-10-22): Todo's organizer takes 50 materials a call and reads 60,000 characters of each, so the
// drafts come in batches, a long material in parts; the batches' drafts are one list, and the kept ones from every batch are added.
test("ONB-LIM-05 todo drafts come in batches of 50 materials, a long one in parts, and the kept drafts of every batch are added", { timeout: 120_000 }, async t => {
  const prompts: string[] = [];
  const { dir, id, ports } = await fixture(t, async input => { prompts.push(modelPromptText(input)); return TODOS; });
  const files = [await stageContextFile(dir, id, "long.md", Buffer.from("# Long\n" + "预算等小李确认。\n".repeat(15_000)))];
  for (let i = 0; i < 99; i++) files.push(await stageContextFile(dir, id, `m-${i}.md`, Buffer.from(`# 邮件 ${i}\n\n${MAIL}`)));
  selectContextSources(dir, id, { sources: [{ kind: "files", selected: true, files: files.map(file => ({ path: file.path, staged: file.staged })) }] });
  const summarize = async (input: ModelPromptInput) => `# 新版方案\n要点 [${/"labels":\["(S\d+)"/u.exec(modelPromptText(input))?.[1] ?? "S1"}]`;
  let discoveries = 0;
  const signals: AbortSignal[] = [];
  const run = { ...ports, model: async () => ({ completeText: summarize }), homeActions: (home: string, signal: AbortSignal): BoundActionClient => {
    signals.push(signal);
    const client = ports.homeActions(home, signal);
    return {
      discover: () => { discoveries++; return client.discover(); },
      invoke: (definition, input, control) => {
        assert.deepEqual([definition.capability_id, definition.version, definition.provider_id], ["todo.organize.extract", 1, TODO_PLUGIN_ID]);
        return client.invoke(definition, input, control);
      },
    };
  } };
  startContextJourney(dir, id, run);
  const ready = await waitContextJourney(dir, id);
  assert.equal(ready.phase, "review", ready.error ?? "");
  assert.equal(ready.todo?.status, "ready", ready.todo?.error ?? "");
  assert.equal(ready.todo!.total, 3); assert.equal(ready.todo!.batches.length, 3);
  // PG031-F01: one pinned discovery, with the original independent timeout/cancellation window for each real batch.
  assert.equal(discoveries, 1); assert.equal(signals.length, 3); assert.equal(new Set(signals).size, 3);
  assert.equal(ready.todo!.timing.calls, 3, "ONB-LIM-10 each todo batch's call is timed, so the page can say how long the rest may take");
  assert.ok(prompts.some(prompt => prompt.includes("Long · 第 3 / 3 部分")), "the long material goes in parts Todo reads whole");
  assert.deepEqual(ready.todo!.batches.map(batch => batch.title), [1, 2, 3].map(k => `开始使用时整理的待办（第 ${k} / 3 批）`));
  const kept = ready.todo!.batches.flatMap(batch => batch.candidates.filter(candidate => candidate.selected).map(candidate => candidate.candidate_id));
  assert.ok(ready.todo!.batches.every(batch => batch.candidates.some(candidate => candidate.selected)), "every batch has drafts to keep");
  const adopted = await adoptContextJourney(dir, id, { title: "新版方案", body: ready.summary!.body, todo_selected: [...kept, "not-a-draft"] }, run);
  assert.equal(adopted.phase, "complete", adopted.error ?? "");
  assert.equal(adopted.todo?.added?.length, kept.length, "the kept drafts of every batch are added");
  assert.deepEqual(adopted.adoption!.todo_selected, kept, "only this round's drafts can be kept");
});

// Drafts belong to the materials they came from (review 2026-10-22): after the person goes back and chooses other materials, the
// drafts are made again from those, not kept from the first choice nor mixed with its batches.
test("ONB-LIM-06 after the person chooses other materials, the todo drafts are made again from them", async t => {
  const prompts: string[] = [];
  const { dir, id, ports } = await fixture(t, async input => { prompts.push(modelPromptText(input)); return TODOS; });
  startContextJourney(dir, id, ports);
  const first = await waitContextJourney(dir, id);
  assert.equal(first.todo?.status, "ready", first.todo?.error ?? "");
  reopenContextJourney(dir, id);
  selectContextSources(dir, id, { sources: [{ kind: "browser", selected: true, text: "第二封：请周一前交预算表。" }] });
  startContextJourney(dir, id, ports);
  const second = await waitContextJourney(dir, id);
  assert.equal(second.todo?.status, "ready", second.todo?.error ?? "");
  assert.equal(prompts.length, 2, "the new materials are organized");
  assert.ok(prompts[1]!.includes("请周一前交预算表"), "from the materials chosen now");
  assert.equal(second.todo!.batches.length, 1);
  assert.notEqual(second.todo!.batches[0]!.batch_id, first.todo!.batches[0]!.batch_id, "not the first choice's drafts");
});

test("RAC-822 the journey sends Todo's organizer parts of the size the organizer reads", () => {
  assert.equal(TODO_PART_CHARS, TODO_ORGANIZE_MATERIAL_CHARS);
});
