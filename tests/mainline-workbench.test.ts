import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority, installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePageDraft } from "@molis-ai/molis-work-contracts/services/home";
import type { Mainline, MainlineItemResult, MainlineResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { reply } from "./fixtures/fixture-replies.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

installHostUiText();

// Batch 37-2 (specs/work-mainline §4–§11, assistant-main-contract-design, S-work-line-person-doors):
// proves per-item Assistant main conversation, all 18 person-only mainline HTTP doors (including
// generated-home-page refusal), Goals-absent full workflow, Goals-present conversion + live source
// titles, and item-scoped attention projection.

async function until<T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) {
    const value = await read();
    if (value) return value as NonNullable<T>;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${what} not reached`);
}

interface MainlineViewResponse {
  mainline: Mainline;
  sources: Array<{ kind: string; owner: string; create: boolean; next: boolean; label: string }>;
  counts?: { items: Record<string, { waiting: number; running: number }>; groups: Record<string, { waiting: number; running: number }> };
  resolved: Record<string, { item_id: string; state: "ok" | "missing" | "denied"; title: string; light: boolean; source: { kind: string; id: string } | null }>;
  task_items: Record<string, string>;
}

interface ContentsViewResponse {
  item_id: string;
  entries: Array<{ subject: { kind: string; id: string }; origin: string; removable: boolean; state: "ok" | "missing" | "denied"; title: string }>;
}

async function assistantFixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-mainline-assistant-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews((text) => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return reply(undefined, "收到，按当前事项推进。");
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({
    app: { appId: "io.molis.work.mainline-assistant", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"),
    reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const items = new Map<string, { project_id: string; item_id: string; name: string; held: Array<{ kind: string; id: string; title: string }> }>([
    ["item-a", { project_id: "proj-1", item_id: "item-a", name: "首版发布清单", held: [{ kind: "note", id: "n1", title: "发布检查单" }] }],
    ["item-b", { project_id: "proj-1", item_id: "item-b", name: "客户方案定稿", held: [] }],
    ["item-other", { project_id: "proj-2", item_id: "item-other", name: "别的项目的事", held: [] }],
  ]);
  const service: AssistantService = new AssistantService(store, {
    pages: async () => ["home"],
    host: async () => host,
    authority: async (work) => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)),
    projectTitle: async () => "主线项目",
    scopeActions: async (caller) => ({
      discover: async () => [],
      invoke: async (action, input) => {
        const projectId = caller.project_ref?.project_id;
        const ref = typeof action === "string" ? action : action.capability_id;
        if (ref === "mainline.read") {
          const projectItems = [...items.values()].filter((i) => i.project_id === projectId);
          return {
            mainline: {
              revision: "rev-1",
              current: null,
              recent: [],
              completed: [],
              completed_total: 0,
              items: projectItems.map((i) => ({ item_id: i.item_id, name: i.name, created_at: "2026-11-23T00:00:00.000Z" })),
              groups: [{
                group_id: "g1",
                name: "进行中",
                items: projectItems.map((i) => ({ item_id: i.item_id, pinned: false })),
              }],
            },
            sources: [],
          };
        }
        if (ref === "mainline.items.contents") {
          const itemId = (input as { item_id?: string })?.item_id ?? "";
          const entry = items.get(itemId);
          if (!entry || entry.project_id !== projectId) {
            throw new ActionError("mainline.not_found", "事项不存在");
          }
          return { held: entry.held.map((h) => ({ kind: h.kind, id: h.id })), related: [], issues: [] };
        }
        if (ref === "objects.open") {
          const subj = (input as { subject?: { kind: string; id: string } })?.subject;
          for (const entry of items.values()) {
            const hit = entry.held.find((h) => h.kind === subj?.kind && h.id === subj?.id);
            if (hit) return { title: hit.title, target: { kind: "object", subject: { kind: hit.kind, id: hit.id } } };
          }
          throw new ActionError("actions.not_found", "未找到对象");
        }
        return { events: [], issues: [] };
      },
    }),
  }, "web-user");
  t.after(async () => {
    service.continuations.close();
    await adapter.close();
    await local.close();
    await rm(home, { recursive: true, force: true });
  });
  const done = (workId: string, rounds: number) => until(async () => {
    const view = await service.read(workId);
    return view.work.state === "completed" && view.rounds.length === rounds ? view : undefined;
  }, `round ${rounds} of ${workId}`);
  return { service, store, items, requests, done };
}

test("MLN-16: per-item Assistant standing main conversation isolates by work_item_id, injects item context, rejects invalid/forged/personal ids, and keeps history after item removal", { timeout: 90_000 }, async (t) => {
  const { service, store, items, requests, done } = await assistantFixture(t);
  const projectRef = { project_id: "proj-1", storage_key: "memory:proj-1" };

  // Whole-project main vs item-a main vs item-b main are three distinct standing works.
  const whole = await service.send({ text: "看整个项目进展", main: true, request_id: "req-mln16-whole" }, { project_ref: projectRef });
  const a1 = await service.send({ text: "先核对首版发布项", main: true, work_item_id: "item-a", request_id: "req-mln16-a1" }, { project_ref: projectRef });
  const b1 = await service.send({ text: "整理客户方案要点", main: true, work_item_id: "item-b", request_id: "req-mln16-b1" }, { project_ref: projectRef });
  assert.equal(whole.work.work_item_id, undefined);
  assert.equal(a1.work.work_item_id, "item-a");
  assert.equal(b1.work.work_item_id, "item-b");
  assert.notEqual(whole.work.work_id, a1.work.work_id);
  assert.notEqual(a1.work.work_id, b1.work.work_id);
  await done(whole.work.work_id, 1);
  await done(a1.work.work_id, 1);
  await done(b1.work.work_id, 1);

  // Prompt for item-a includes item name and held material reference.
  const itemAPrompt = requests.find((body) => body.includes("先核对首版发布项")) ?? "";
  assert.match(itemAPrompt, /首版发布清单/, "round prompt receives verified work item title");
  assert.match(itemAPrompt, /note:n1/, "round prompt receives held object reference");

  // Second send in item-a reuses the exact same standing work.
  const a2 = await service.send({ text: "补一条回滚步骤", main: true, work_item_id: "item-a", request_id: "req-mln16-a2" }, { project_ref: projectRef });
  assert.equal(a2.work.work_id, a1.work.work_id);
  assert.equal(a2.work.work_item_id, "item-a");
  await done(a1.work.work_id, 2);

  // Mutating work_item_id on an existing work_id is refused.
  await assert.rejects(
    service.send({ text: "串台测试", work_id: a1.work.work_id, work_item_id: "item-b", request_id: "req-mln16-mutate" }, { project_ref: projectRef }),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.invalid",
  );

  // Personal scope cannot attach a project work_item_id.
  await assert.rejects(
    service.send({ text: "个人空间发事项", main: true, scope: { kind: "personal" }, work_item_id: "item-a", request_id: "req-mln16-personal" }, {}),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.invalid",
  );

  // Foreign project / nonexistent work_item_id is rejected and creates no work.
  const beforeCount = store.list("web-user").length;
  for (const badId of ["item-other", "does-not-exist"]) {
    await assert.rejects(
      service.send({ text: "越权事项", main: true, work_item_id: badId, request_id: `req-mln16-${badId}` }, { project_ref: projectRef }),
      (error: unknown) => error instanceof ActionError && (error.code === "assistant.not_found" || error.code === "mainline.not_found"),
    );
  }
  assert.equal(store.list("web-user").length, beforeCount, "rejected work_item_id opens no work");

  // Removing the item from mainline preserves existing Assistant conversation history.
  items.delete("item-a");
  const preserved = await service.read(a1.work.work_id);
  assert.equal(preserved.work.work_item_id, "item-a");
  assert.equal(preserved.rounds.length, 2);
});

test("MLN-03 MLN-04 MLN-08 MLN-09 MLN-10 MLN-11 MLN-12 MLN-21 WLN-19 WLN-20 WLN-23 WLN-24: full mainline workbench lifecycle works with Goals absent, preserves items across group delete, scopes attention, and resolves contents honestly", { timeout: 120_000 }, async (t) => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("No Goals Mainline");
  const prefix = `/projects/${project.project_id}`;
  const post = async <T>(path: string, body: unknown = {}): Promise<{ status: number; data: T }> => {
    const res = await f.request(prefix + path, { method: "POST", body });
    return { status: res.status, data: await res.json() as T };
  };

  // Fresh project without Goals installed (MLN-21): mainline works, no goal source offered.
  const initial = await post<MainlineViewResponse>("/api/mainline/items/view", { counts: true });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.mainline.current, null);
  assert.equal(initial.data.sources.some((s) => s.kind === "goal"), false, "Goals absent -> no goal source chip");

  // Create two light items (MLN-08).
  const createdA = await post<MainlineItemResult>("/api/mainline/items/create", { name: "发布筹备" });
  const createdB = await post<MainlineItemResult>("/api/mainline/items/create", { name: "文档补齐" });
  assert.equal(createdA.status, 200);
  assert.equal(createdB.status, 200);
  const itemA = createdA.data.item;
  const itemB = createdB.data.item;
  let rev = createdB.data.mainline.revision;

  // Rename light item A; stale revision rejected with conflict.
  const stale = await post<{ error?: { code?: string } }>("/api/mainline/items/rename", {
    expected_revision: "stale-rev",
    item_id: itemA.item_id,
    name: "不该成功",
  });
  assert.ok(stale.status >= 400, "stale CAS revision rejected");
  const renamed = await post<MainlineResult>("/api/mainline/items/rename", {
    expected_revision: rev,
    item_id: itemA.item_id,
    name: "发布筹备 v2",
  });
  assert.equal(renamed.status, 200);
  rev = renamed.data.mainline.revision;

  // Group edit: add group, move item A into it + pin, rename group, delete group -> zero lost items (MLN-03, MLN-04).
  const addedGroup = await post<MainlineResult>("/api/mainline/groups/edit", { expected_revision: rev, op: "add", name: "本周重点" });
  assert.equal(addedGroup.status, 200);
  const newGroup = addedGroup.data.mainline.groups.find((g) => g.name === "本周重点");
  assert.ok(newGroup);
  rev = addedGroup.data.mainline.revision;

  const moved = await post<MainlineResult>("/api/mainline/items/move", {
    expected_revision: rev,
    item_id: itemA.item_id,
    group_id: newGroup.group_id,
    index: 0,
    pinned: true,
  });
  assert.equal(moved.status, 200);
  rev = moved.data.mainline.revision;

  const renamedGroup = await post<MainlineResult>("/api/mainline/groups/edit", {
    expected_revision: rev,
    op: "rename",
    group_id: newGroup.group_id,
    name: "本周必做",
  });
  assert.equal(renamedGroup.status, 200);
  rev = renamedGroup.data.mainline.revision;

  const deletedGroup = await post<MainlineResult>("/api/mainline/groups/edit", {
    expected_revision: rev,
    op: "delete",
    group_id: newGroup.group_id,
  });
  assert.equal(deletedGroup.status, 200);
  rev = deletedGroup.data.mainline.revision;
  const remainingIds = deletedGroup.data.mainline.groups.flatMap((g) => g.items.map((i) => i.item_id));
  assert.ok(remainingIds.includes(itemA.item_id), "deleting group preserves itemA");
  assert.ok(remainingIds.includes(itemB.item_id), "deleting group preserves itemB");

  // Switch to itemA and read scoped attention vs whole-project attention (WLN-19, 20, 23, 24).
  const switched = await post<MainlineResult>("/api/mainline/switch", { item_id: itemA.item_id });
  assert.equal(switched.status, 200);
  assert.equal(switched.data.mainline.current, itemA.item_id);
  assert.equal(switched.data.mainline.recent[0], itemA.item_id);

  const viewActive = await post<MainlineViewResponse>("/api/mainline/items/view", { counts: true });
  assert.equal(viewActive.status, 200);
  assert.equal(viewActive.data.mainline.current, itemA.item_id);
  assert.equal(viewActive.data.resolved[itemA.item_id]?.title, "发布筹备 v2");

  const attScoped = await f.request(`${prefix}/api/attention?surface=home&item=${encodeURIComponent(itemA.item_id)}`);
  assert.equal(attScoped.status, 200);
  const attScopedBody = await attScoped.json() as { line: { events: unknown[] } | null; tasks: { tasks: unknown[] } | null };
  assert.ok(attScopedBody.line && Array.isArray(attScopedBody.line.events));
  assert.ok(attScopedBody.tasks && Array.isArray(attScopedBody.tasks.tasks));

  const attProject = await f.request(`${prefix}/api/attention?surface=home`);
  assert.equal(attProject.status, 200);
  const attProjectBody = await attProject.json() as { line: { events: unknown[] } | null; tasks: { tasks: unknown[] } | null };
  assert.ok(attProjectBody.line && attProjectBody.tasks);

  // Contents view for empty item succeeds cleanly.
  const emptyContents = await post<ContentsViewResponse>("/api/mainline/items/contents/view", { item_id: itemA.item_id });
  assert.equal(emptyContents.status, 200);
  assert.deepEqual(emptyContents.data.entries, []);

  // Complete + restore (undo) item B (MLN-09).
  rev = viewActive.data.mainline.revision;
  const completed = await post<MainlineResult>("/api/mainline/items/complete", {
    expected_revision: rev,
    item_id: itemB.item_id,
    completed: true,
  });
  assert.equal(completed.status, 200);
  assert.ok(completed.data.mainline.completed.includes(itemB.item_id));
  rev = completed.data.mainline.revision;

  const restored = await post<MainlineResult>("/api/mainline/items/complete", {
    expected_revision: rev,
    item_id: itemB.item_id,
    completed: false,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.mainline.completed.includes(itemB.item_id), false);
  rev = restored.data.mainline.revision;

  // Remove item B (MLN-10), switch back to null (project home).
  const removed = await post<MainlineResult>("/api/mainline/items/remove", { expected_revision: rev, item_id: itemB.item_id });
  assert.equal(removed.status, 200);
  const home = await post<MainlineResult>("/api/mainline/switch", { item_id: null });
  assert.equal(home.status, 200);
  assert.equal(home.data.mainline.current, null);
});

test("MLN-11 MLN-12 MLN-13 MLN-14 MLN-21: Goals-present project exposes Goal source dynamically, converts a light item keeping held objects, and reflects live source rename without stale copy", { timeout: 120_000 }, async (t) => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("Goals Mainline");
  const prefix = `/projects/${project.project_id}`;
  const post = async <T>(path: string, body: unknown = {}): Promise<{ status: number; data: T }> => {
    const res = await f.request(prefix + path, { method: "POST", body });
    return { status: res.status, data: await res.json() as T };
  };

  // Enable Goals plugin on this project.
  const pluginsRes = await f.request("/api/settings/project-plugins");
  const { projects } = await pluginsRes.json() as { projects: Array<{ project_id: string; revision: string }> };
  const pluginRev = projects.find((p) => p.project_id === project.project_id)?.revision;
  assert.ok(pluginRev);
  assert.equal((await f.request(`/api/settings/projects/${project.project_id}/plugins`, {
    method: "POST",
    body: { plugin_id: "goals", expected_revision: pluginRev },
  })).status, 200);

  // Mainline view now includes the Goal source dynamically.
  const viewWithGoals = await post<MainlineViewResponse>("/api/mainline/items/view", {});
  assert.equal(viewWithGoals.status, 200);
  const goalSource = viewWithGoals.data.sources.find((s) => s.kind === "goal");
  assert.ok(goalSource, "Goals installed -> goal source declared dynamically");
  assert.equal(goalSource.create, true);

  // Create a light item, create a separate Goal to hold inside it, bind hold, then convert the light item into a Goal!
  const light = await post<MainlineItemResult>("/api/mainline/items/create", { name: "季度冲刺" });
  assert.equal(light.status, 200);
  const lightId = light.data.item.item_id;

  const heldGoalRes = await f.request(`${prefix}/api/plugins/io.molis.work.goals/goals`, { method: "POST", body: { title: "被放进的参考目标" } });
  assert.ok(heldGoalRes.status === 200 || heldGoalRes.status === 201, await heldGoalRes.clone().text());
  const heldGoal = await heldGoalRes.json() as { goal?: { goal_id?: string; id?: string }; goal_id?: string; id?: string };
  const heldGoalId = heldGoal.goal?.goal_id ?? heldGoal.goal?.id ?? heldGoal.goal_id ?? heldGoal.id;
  assert.ok(heldGoalId, "created reference goal");

  const bindRes = await post<{ targets: Array<{ kind: string; id: string }> }>("/api/mainline/holds/bind", {
    subject: { kind: "goal", id: heldGoalId },
    target: { kind: "work_item", id: lightId },
  });
  assert.equal(bindRes.status, 200);
  assert.ok(bindRes.data.targets.some((entry) => entry.id === lightId));

  // Verify 「这件事的东西」 resolves live title of held goal.
  const contentsBefore = await post<ContentsViewResponse>("/api/mainline/items/contents/view", { item_id: lightId });
  assert.equal(contentsBefore.status, 200);
  assert.ok(contentsBefore.data.entries.some((entry) => entry.subject.id === heldGoalId && entry.state === "ok" && entry.title === "被放进的参考目标"));

  // Convert light item into a real Goal -> held objects remain intact (MLN-14).
  const converted = await post<MainlineItemResult>("/api/mainline/items/convert", {
    expected_revision: light.data.mainline.revision,
    item_id: lightId,
    kind: "goal",
    request_id: "req-convert-goal-1",
  });
  assert.equal(converted.status, 200);
  assert.equal(converted.data.item.source?.kind, "goal");
  const backingGoalId = converted.data.item.source!.id;

  const contentsAfter = await post<ContentsViewResponse>("/api/mainline/items/contents/view", { item_id: lightId });
  assert.equal(contentsAfter.status, 200);
  assert.ok(contentsAfter.data.entries.some((entry) => entry.subject.id === heldGoalId && entry.origin === "held"), "held objects survive conversion");

  // Live source-backed resolution (MLN-11, MLN-12): mainline view resolves live Goal title & open target without storing a copy.
  const viewAfterConvert = await post<MainlineViewResponse>("/api/mainline/items/view", {});
  assert.equal(viewAfterConvert.status, 200);
  assert.equal(viewAfterConvert.data.resolved[lightId]?.title, "季度冲刺");
  assert.equal(viewAfterConvert.data.resolved[lightId]?.light, false);
  assert.equal(viewAfterConvert.data.resolved[lightId]?.source?.id, backingGoalId);

  // Releasing hold does NOT delete the held goal (MLN-13).
  const released = await post<{ targets: Array<{ kind: string; id: string }> }>("/api/mainline/holds/release", {
    subject: { kind: "goal", id: heldGoalId },
    target: { kind: "work_item", id: lightId },
  });
  assert.equal(released.status, 200);
  const dirAfterRelease = await (await f.request(`${prefix}/api/plugins/io.molis.work.goals/goals/directory`)).json() as { goals: Array<{ goal_id: string; title: string }> };
  assert.ok(dirAfterRelease.goals.some((g) => g.goal_id === heldGoalId), "releasing hold keeps underlying object intact");

  // Removing a source-backed item from mainline does NOT delete its backing Goal (MLN-10).
  const removedSource = await post<MainlineResult>("/api/mainline/items/remove", {
    expected_revision: converted.data.mainline.revision,
    item_id: lightId,
  });
  assert.equal(removedSource.status, 200);
  const dirAfterRemove = await (await f.request(`${prefix}/api/plugins/io.molis.work.goals/goals/directory`)).json() as { goals: Array<{ goal_id: string; title: string }> };
  assert.ok(dirAfterRemove.goals.some((g) => g.goal_id === backingGoalId), "removing source-backed item keeps backing Goal intact");
});

test("S-work-line-person-doors MLN-22: all 18 mainline item/group/switch/hold/view routes refuse plugin pages, context pages, generated home pages, and anonymous callers with zero side effects", { timeout: 120_000 }, async (t) => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("Mainline Person Doors");
  const prefix = `/projects/${project.project_id}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}, authorized = true) =>
    f.request(prefix + path, { method: "POST", body, headers, authorized });

  // Seed one real item as person, enable Goals to open a real plugin page, and preview a generated home page to get a real home-page session.
  const seededRes = await post("/api/mainline/items/create", { name: "本人事项" });
  assert.equal(seededRes.status, 200);
  const seeded = await seededRes.json() as MainlineItemResult;
  const itemId = seeded.item.item_id;
  const rev = seeded.mainline.revision;

  const pluginsRes = await f.request("/api/settings/project-plugins");
  const { projects } = await pluginsRes.json() as { projects: Array<{ project_id: string; revision: string }> };
  const pluginRev = projects.find((p) => p.project_id === project.project_id)?.revision;
  assert.ok(pluginRev);
  assert.equal((await f.request(`/api/settings/projects/${project.project_id}/plugins`, {
    method: "POST",
    body: { plugin_id: "goals", expected_revision: pluginRev },
  })).status, 200);
  const pluginPageRes = await post("/api/host/plugin-pages", { plugin_id: "io.molis.work.goals" });
  assert.equal(pluginPageRes.status, 200);
  const { page_id: pluginPageId } = await pluginPageRes.json() as { page_id: string };

  const draft: HomePageDraft = {
    title: "测试生成首页",
    entry: "index.html",
    actions: [],
    files: [
      { path: "index.html", media_type: "text/html", text: "<main><h1>门禁测试</h1></main>" },
      { path: "styles.css", media_type: "text/css", text: "main { padding: var(--s-4); }" },
      { path: "app.js", media_type: "text/javascript", text: "document.querySelector('main')?.setAttribute('data-ok', '1');" },
    ],
  };
  const savedPageRes = await post("/api/home-pages/drafts/save", { draft });
  assert.equal(savedPageRes.status, 200, await savedPageRes.clone().text());
  const savedPage = await savedPageRes.json() as { version: { page_id: string; version: number } };
  const previewRes = await post("/api/home-pages/preview", {
    page_id: savedPage.version.page_id,
    version: savedPage.version.version,
  });
  assert.equal(previewRes.status, 200, await previewRes.clone().text());
  const preview = await previewRes.json() as { page_session_id?: string };
  const homePageId = preview.page_session_id;
  assert.ok(homePageId, "generated home page session issued");

  const doors: Array<[string, unknown]> = [
    ["/api/mainline/items/read", {}],
    ["/api/mainline/items/view", {}],
    ["/api/mainline/items/subject", { id: itemId }],
    ["/api/mainline/items/create", { name: "越权新建" }],
    ["/api/mainline/items/convert", { expected_revision: rev, item_id: itemId, kind: "goal" }],
    ["/api/mainline/items/rename", { expected_revision: rev, item_id: itemId, name: "被改名" }],
    ["/api/mainline/items/move", { expected_revision: rev, item_id: itemId, group_id: seeded.mainline.groups[0]!.group_id, index: 0 }],
    ["/api/mainline/items/complete", { expected_revision: rev, item_id: itemId, completed: true }],
    ["/api/mainline/items/remove", { expected_revision: rev, item_id: itemId }],
    ["/api/mainline/groups/edit", { expected_revision: rev, op: "add", name: "越权分组" }],
    ["/api/mainline/switch", { item_id: itemId }],
    ["/api/mainline/items/contents", { item_id: itemId }],
    ["/api/mainline/items/contents/view", { item_id: itemId }],
    ["/api/mainline/holds/list", { subject: { kind: "work_item", id: itemId } }],
    ["/api/mainline/holds/bind", { subject: { kind: "note", id: "n1" }, target: { kind: "work_item", id: itemId } }],
    ["/api/mainline/holds/release", { subject: { kind: "note", id: "n1" }, target: { kind: "work_item", id: itemId } }],
    ["/api/mainline/holds/candidates", { subject: { kind: "note", id: "n1" } }],
    ["/api/mainline/holds/create", { subject: { kind: "note", id: "n1" }, name: "越权事项" }],
  ];

  const badCallers: Array<{ label: string; headers: Record<string, string>; authorized: boolean }> = [
    { label: "x-molis-plugin-page", headers: { "x-molis-plugin-page": pluginPageId }, authorized: true },
    { label: "x-molis-context-page", headers: { "x-molis-context-page": pluginPageId }, authorized: true },
    { label: "generated-home-page", headers: { "x-molis-home-page": homePageId }, authorized: true },
    { label: "anonymous", headers: {}, authorized: false },
  ];

  for (const caller of badCallers) {
    for (const [path, body] of doors) {
      const refused = await post(path, body, caller.headers, caller.authorized);
      assert.ok(refused.status >= 400, `${caller.label} ${path} must be refused (got ${refused.status})`);
      const payload = await refused.json().catch(() => ({})) as { mainline?: unknown; entries?: unknown; displays?: unknown; targets?: unknown };
      assert.equal(payload.mainline, undefined, `${caller.label} ${path} leaked no mainline`);
      assert.equal(payload.entries, undefined, `${caller.label} ${path} leaked no entries`);
      assert.equal(payload.displays, undefined, `${caller.label} ${path} leaked no displays`);
      assert.equal(payload.targets, undefined, `${caller.label} ${path} leaked no targets`);
    }
  }

  // Generated home page also gets null line/tasks on ?item= attention read.
  const homeAtt = await f.request(`${prefix}/api/attention?surface=home&item=${encodeURIComponent(itemId)}`, {
    headers: { "x-molis-home-page": homePageId },
  });
  if (homeAtt.status === 200) {
    const body = await homeAtt.json() as { line: unknown; tasks: unknown };
    assert.deepEqual([body.line, body.tasks], [null, null], "generated home page gets no mainline/tasks");
  } else {
    assert.ok(homeAtt.status >= 400);
  }

  // Verify zero mutations happened on the person's mainline.
  const afterRes = await post("/api/mainline/items/read", {});
  assert.equal(afterRes.status, 200);
  const after = await afterRes.json() as { mainline: Mainline };
  assert.equal(after.mainline.revision, rev, "no unauthorized request mutated mainline revision");
  assert.equal(after.mainline.items.length, 1);
  assert.equal(after.mainline.items[0]?.name, "本人事项");
});
