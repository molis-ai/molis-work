import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_ORGANIZE_MATERIAL_CHARS, TODO_PLUGIN_ID } from "@molis-ai/molis-work-plugin-todo/contract";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openPagesStore, openTodoStore } from "./fixtures/plugin-home-stores.js";
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

// The text of each part as runs ("🟢×60000 \n×1 x×39999"), so a part of 60,000 characters is read at a glance and a cut inside a 🟢 shows as a run of its own.
const runs = (text: string) => [...text].reduce<[string, number][]>((all, character) => {
  if (all.at(-1)?.[0] === character) all.at(-1)![1]++; else all.push([character, 1]);
  return all;
}, []).map(([character, count]) => `${character === "\n" ? "\\n" : character}×${count}`).join(" ");
const described = (sent: { title: string; text: string }[]) => sent.map(material => `${material.title}: ${runs(material.text)}`);

// A journey over files named and filled as given: the parts the Host sends Todo's organizer, and the finished journey.
async function journeyOver(t: Parameters<Parameters<typeof test>[1]>[0], files: [name: string, text: string][]) {
  const { dir, id, ports } = await fixture(t, async () => TODOS);
  const staged: { path: string; staged: string }[] = [];
  for (const [name, text] of files) { const file = await stageContextFile(dir, id, name, Buffer.from(text)); staged.push({ path: file.path, staged: file.staged }); }
  selectContextSources(dir, id, { sources: [{ kind: "files", selected: true, files: staged }] });
  const sent: { title: string; text: string }[] = [];
  const summarize = async (input: ModelPromptInput) => `# 新版方案\n要点 [${/"labels":\["(S\d+)"/u.exec(modelPromptText(input))?.[1] ?? "S1"}]`;
  const run = { ...ports, model: async () => ({ completeText: summarize }), homeActions: (home: string, signal: AbortSignal): BoundActionClient => {
    const client = ports.homeActions(home, signal);
    return {
      discover: () => client.discover(),
      invoke: (definition, input, control) => {
        if (definition.capability_id === "todo.organize.extract") sent.push(...(input as { materials: { title: string; text: string }[] }).materials);
        return client.invoke(definition, input, control);
      },
    };
  } };
  startContextJourney(dir, id, run);
  const ready = await waitContextJourney(dir, id);
  assert.equal(ready.phase, "review", ready.error ?? "");
  return { dir, id, run, ready, sent };
}

test("RAC-1853 todo parts of a long material hold 60,000 characters, a 🟢 counted as one, and none ends inside one", { timeout: 120_000 }, async t => {
  // A 🟢 (U+1F7E2) is one character and two UTF-16 units: 90,000 of them are parts of 60,000 and 30,000 characters, not three of 30,000. After one
  // "a", the first part is that "a" and 59,999 🟢, not 60,000, which would end inside a pair; the rest is 10,001.
  const { sent } = await journeyOver(t, [["emoji.md", "🟢".repeat(90_000)], ["odd.md", "a" + "🟢".repeat(70_000)]]);
  assert.deepEqual(described(sent), [
    "emoji · 第 1 / 2 部分: 🟢×60000", "emoji · 第 2 / 2 部分: 🟢×30000",
    "odd · 第 1 / 2 部分: a×1 🟢×59999", "odd · 第 2 / 2 部分: 🟢×10001",
  ]);
});

test("RAC-1854 todo parts end after a line end in the second half of 60,000 characters, the half counted in characters, and a last part is left whole", { timeout: 120_000 }, async t => {
  // The second half starts at 30,000 characters. late: the line end is after 40,000 🟢, which is 80,000 units, past the 60,000 a part may hold in units, so
  //   only a cut by characters finds it. early: after 20,000 🟢, which is 40,000 units, in the second half by units but not by characters (20,000 < 30,000).
  // half: after exactly 30,000 characters, which is in the second half. below: after 29,999, which is not. last: 55,001 characters are one part, so the line end
  //   in it is not a cut.
  const { sent } = await journeyOver(t, [
    ["late.md", "🟢".repeat(40_000) + "\n" + "x".repeat(30_000)],
    ["early.md", "🟢".repeat(20_000) + "\n" + "x".repeat(50_000)],
    ["half.md", "x".repeat(30_000) + "\n" + "y".repeat(40_000)],
    ["below.md", "x".repeat(29_999) + "\n" + "y".repeat(40_001)],
    ["last.md", "x".repeat(50_000) + "\n" + "y".repeat(5_000)],
  ]);
  assert.deepEqual(described(sent), [
    "late · 第 1 / 2 部分: 🟢×40000 \\n×1", "late · 第 2 / 2 部分: x×30000",
    "early · 第 1 / 2 部分: 🟢×20000 \\n×1 x×39999", "early · 第 2 / 2 部分: x×10001",
    "half · 第 1 / 2 部分: x×30000 \\n×1", "half · 第 2 / 2 部分: y×40000",
    "below · 第 1 / 2 部分: x×29999 \\n×1 y×30000", "below · 第 2 / 2 部分: y×10001",
    "last: x×50000 \\n×1 y×5000",
  ]);
});

test("RAC-1855 pages parts stay counted in UTF-16 units and back off a pair the cut would split", { timeout: 180_000 }, async t => {
  // Pages limits what a body encodes to, so its parts are 400,000 units, not characters. The text Pages gets is a 29-unit lead (原标题：long, 来源：long.md ·
  // 版本 1, and their blank lines) and 250,000 🟢: 500,029 units, 250,014 characters. Unit 400,000 is half of a 🟢, so the first part ends one unit before it.
  // Counted in characters it would be one part of 500,029 units.
  const { dir, id, run, ready } = await journeyOver(t, [["long.md", "🟢".repeat(250_000)]]);
  const adopted = await adoptContextJourney(dir, id, { title: "Pages parts", body: ready.summary!.body, todo_selected: [] }, run);
  assert.equal(adopted.phase, "complete", adopted.error ?? "");
  const pages = openPagesStore(dir);
  try {
    const parts = pages.list(adopted.project_id).filter(document => document.id !== adopted.document_id).sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
    assert.deepEqual(parts.map(part => part.title.replace(/^\[S\d+\] /u, "")), ["long · 第 1 / 2 部分", "long · 第 2 / 2 部分"]);
    const body = parts.map(part => JSON.stringify(pages.get(part.id).body)).join("");
    assert.equal(body.split("🟢").length - 1, 250_000, "no 🟢 is split between the parts");
  } finally { pages.close(); }
});

// A Todo part's title is the material's name cut to the 200 whole characters Todo keeps (a 😀 is one character, though two UTF-16 units).
const TODO_TITLES = [
  { name: "150 😀 are 150 characters: kept whole", heading: "😀".repeat(150), title: "😀".repeat(150) },
  { name: "the 199th character is a 😀: kept, then …", heading: "a".repeat(198) + "😀" + "b".repeat(50), title: "a".repeat(198) + "😀…" },
  { name: "250 😀 are cut to 199, then …", heading: "😀".repeat(250), title: "😀".repeat(199) + "…" },
  { name: "200 one-unit characters: kept whole", heading: "题".repeat(200), title: "题".repeat(200) },
  { name: "201 one-unit characters are cut to 199, then …", heading: "题".repeat(201), title: "题".repeat(199) + "…" },
];

test("RAC-2105 a single-part material's title for Todo is counted and cut in whole characters, 200 at most", async t => {
  const { ready, sent } = await journeyOver(t, TODO_TITLES.map((c, index) => [`t-${index + 1}.md`, `# ${c.heading}\n\n预算等小李确认。`] as [string, string]));
  assert.equal(ready.todo?.status, "ready", ready.todo?.error ?? "");
  assert.equal(sent.length, TODO_TITLES.length);
  for (const [index, c] of TODO_TITLES.entries()) await t.test(c.name, () => assert.equal(sent[index]!.title, c.title));
});

// The number of a part, " · 第 k / 2 部分", is 13 characters, each one UTF-16 unit.
const partOf2 = (k: number) => ` · 第 ${k} / 2 部分`;

test("RAC-2106 the parts of a long material keep their number: the title is cut to leave room for it, in whole characters", { timeout: 120_000 }, async t => {
  // A heading and 61,000 more characters are over the 60,000 a part holds, whatever the characters are: two parts each.
  const body = "x".repeat(61_000);
  const { ready, sent } = await journeyOver(t, [["fit.md", `# ${"😀".repeat(187)}\n\n${body}`], ["cut.md", `# ${"😀".repeat(188)}\n\n${body}`]]);
  assert.equal(ready.todo?.status, "ready", ready.todo?.error ?? "");
  const cases = [
    { name: "187 😀 and the number are exactly 200 characters: part 1 kept whole", title: "😀".repeat(187) + partOf2(1) },
    { name: "187 😀 and the number are exactly 200 characters: part 2 kept whole", title: "😀".repeat(187) + partOf2(2) },
    { name: "188 😀 are one too many: cut to 186, then …, then the number: part 1", title: "😀".repeat(186) + "…" + partOf2(1) },
    { name: "188 😀 are one too many: cut to 186, then …, then the number: part 2", title: "😀".repeat(186) + "…" + partOf2(2) },
  ];
  assert.equal(sent.length, cases.length);
  for (const [index, c] of cases.entries()) await t.test(c.name, () => assert.equal(sent[index]!.title, c.title));
});
