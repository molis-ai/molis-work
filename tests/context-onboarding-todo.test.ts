import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openTodoStore } from "@molis-ai/molis-work-plugin-todo";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { withContextJourneys } from "../apps/local-host/src/context-onboarding-store.js";
import { adoptContextJourney, selectContextSources, startContextJourney, waitContextJourney } from "../apps/local-host/src/context-onboarding-service.js";

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

async function fixture(t: Parameters<Parameters<typeof test>[1]>[0], todoModel: (() => Promise<string>) | null) {
  const dir = await mkdtemp(join(tmpdir(), "molis-context-todo-"));
  const host = new MolisWorkLocalHost({ homeDirectory: dir, completeText: todoModel });
  t.after(async () => { await host.close(); await rm(dir, { recursive: true, force: true }); });
  const withCatalog = withMolisWorkProjectCatalog;
  const ports = {
    withCatalog,
    model: async () => ({ completeText: async () => "# 新版方案\n张总要求周五前发新版方案，预算等小李确认。[S1]" }),
    actions: async (_home: string, projectId: string) => {
      const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      return bindActionClient(host.actionClient(reference), () => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["pages:write", "artifacts:read", "artifacts:write", "todo:read", "todo:write"] }));
    },
    homeActions: (_home: string, signal: AbortSignal) => bindActionClient(host.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: ["todo:read", "todo:write", "model:invoke"], signal })),
  };
  const id = randomUUID();
  withContextJourneys(dir, store => store.create(id));
  selectContextSources(dir, id, { sources: [{ kind: "browser", selected: true, text: MAIL }] });
  return { dir, id, ports };
}

test("onboarding gives an overview and todo drafts; the kept drafts become the new project's todos, once; the rest wait in Todo", async t => {
  let calls = 0;
  const { dir, id, ports } = await fixture(t, async () => { calls += 1; return TODOS; });
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id);
  assert.equal(ready.phase, "review", ready.error ?? "");
  assert.equal(ready.todo?.status, "ready");
  const candidates = ready.todo!.batch!.candidates;
  assert.deepEqual(candidates.map(candidate => [candidate.title, candidate.selected]), [["发送新版方案", true], ["等待小李确认预算", true], ["今天催小李确认预算", false]]);
  assert.equal(ready.todo!.batch!.origin, "onboarding");
  const kept = candidates.filter(candidate => candidate.selected).map(candidate => candidate.candidate_id);
  const adopted = await adoptContextJourney(dir, id, { title: "新版方案", body: ready.summary!.body, todo_selected: kept }, ports);
  assert.equal(adopted.phase, "complete", adopted.error ?? "");
  assert.equal(adopted.todo?.added?.length, 2);
  const store = openTodoStore(dir);
  try {
    const items = store.list({ projectId: adopted.project_id, everything: true, actor: "user", actorId: "test" });
    const send = items.find(item => item.title === "发送新版方案")!, wait = items.find(item => item.title === "等待小李确认预算")!;
    assert.deepEqual([send.placement, send.project_id], ["project", adopted.project_id], "建议放进项目的进了新项目");
    assert.deepEqual([wait.placement, wait.status], ["personal", "waiting"]);
    assert.equal(send.sources[0]!.kind, "onboarding");
    assert.deepEqual(send.links.map(link => link.subject.id), [wait.id]);
  } finally { store.close(); }
  await adoptContextJourney(dir, id, { title: "重复请求" }, ports);
  const again = openTodoStore(dir);
  try { assert.equal(again.list({ projectId: null, everything: true, actor: "user", actorId: "test" }).length, 2, "重试不重复加入"); } finally { again.close(); }
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
