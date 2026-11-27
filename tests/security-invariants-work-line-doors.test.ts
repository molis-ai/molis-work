import assert from "node:assert/strict";
import test from "node:test";
import type { AcceptanceReadResult, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-work-line-person-doors: the workbench's own doors to the work line, the task table and the requirement column answer the
// person's own page and nobody else. A plugin's page — its own frame's request or one made under its page's name — is refused
// before any action is called, so it reads nothing through them and nothing is written.

const SUBJECT = { provider_id: "com.example.things", subject: { kind: "thing", id: "t1" } };
const ASKED = [{ id: "r1", statement: "三档并排", requires_person: true }];

test("S-work-line-person-doors WLN-39 PWA-144: a plugin's page gets nothing through the person's own doors — the line, the task table, a command, an answer, a placement, an event's card, a requirement's reading, acceptance or change — and nothing is written; the person's own page gets through", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Person doors"), prefix = `/projects/${project.project_id}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => f.request(prefix + path, { method: "POST", body, headers });
  const now = Date.now(), window = { from: new Date(now - 86_400_000).toISOString(), to: new Date(now + 86_400_000).toISOString(), now: new Date(now).toISOString() };

  // The person's own page: the line and the table answer, and what is asked of an object is recorded.
  for (const [path, body] of [["/api/mainline/line", window], ["/api/mainline/tasks", {}], ["/api/acceptance/requirements", { subject: SUBJECT, requirements: ASKED }]] as const) {
    const answered = await post(path, body);
    assert.equal(answered.status, 200, `${path}: ${await answered.clone().text()}`);
  }
  const before = (await (await post("/api/acceptance/read", { subjects: [SUBJECT] })).json() as AcceptanceReadResult).views[0]!;
  assert.deepEqual(before.requirements.map(one => [one.id, one.version, one.statement]), [["r1", 1, "三档并排"]]);

  const pluginsRes = await f.request("/api/settings/project-plugins");
  const { projects: listedProjects } = await pluginsRes.json() as { projects: Array<{ project_id: string; revision: string }> };
  const revision = listedProjects.find(item => item.project_id === project.project_id)?.revision;
  assert.ok(revision);
  assert.equal((await f.request(`/api/settings/projects/${project.project_id}/plugins`, { method: "POST", body: { plugin_id: "goals", expected_revision: revision } })).status, 200);
  const opened = await post("/api/host/plugin-pages", { plugin_id: "io.molis.work.goals" });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json() as { page_id: string };
  const task = { source: { capability_id: "x.background.tasks", version: 1, provider_id: "com.example.things" }, subject: SUBJECT.subject };
  const doors: Array<[string, unknown]> = [
    ["/api/mainline/line", window], ["/api/mainline/waiting", {}], ["/api/mainline/tasks", {}],
    ["/api/mainline/tasks/command", { ...task, command: { capability_id: "x.stop", version: 1, provider_id: "com.example.things" } }],
    ["/api/mainline/tasks/decide", { ...task, decision: "q1", role: "approve" }],
    ["/api/mainline/place", { task: SUBJECT.subject, to: { kind: "none" } }],
    ["/api/mainline/open", { subject: SUBJECT.subject }],
    ["/api/mainline/receive", { title: "x", text: "x" }],
    ["/api/mainline/receive/targets", {}],
    ["/api/mainline/event/surfaces", { subject: SUBJECT.subject }],
    ["/api/acceptance/read", { subjects: [SUBJECT] }],
    ["/api/acceptance/decide", { subject: SUBJECT, version: "v1", accepts: [{ id: "r1", version: 1 }], returns: [] }],
    ["/api/acceptance/requirements", { subject: SUBJECT, requirements: [{ ...ASKED[0], statement: "插件页面改的" }, { id: "r2", statement: "多出来的一项", requires_person: false }] }],
  ];
  for (const header of ["x-molis-plugin-page", "x-molis-context-page"]) {
    for (const [path, body] of doors) {
      const refused = await post(path, body, { [header]: page_id });
      const answer = await refused.json().catch(() => ({})) as { error?: { code?: string }; requirements?: unknown; views?: unknown; events?: unknown; tasks?: unknown };
      assert.ok(refused.status >= 400, `${header} ${path} answered ${refused.status}`);
      assert.ok(answer.requirements === undefined && answer.views === undefined && answer.events === undefined && answer.tasks === undefined, `${header} ${path} read nothing`);
    }
  }
  // The same page's attention read has no line and no tasks in it.
  const attention = await f.request(prefix + "/api/attention", { headers: { "x-molis-plugin-page": page_id } });
  if (attention.status === 200) {
    const parts = await attention.json() as { line: unknown; tasks: unknown };
    assert.deepEqual([parts.line, parts.tasks], [null, null], "a plugin's page is given no line and no task table");
  } else assert.ok(attention.status >= 400);

  // Nothing a refused request carried was written.
  const after = (await (await post("/api/acceptance/read", { subjects: [SUBJECT] })).json() as AcceptanceReadResult).views[0]!;
  assert.deepEqual(after, before);
});

test("S-work-line-person-doors PWA-144: the person's doors take who is asking from the request, never from its body — an actor, an audience or a project written into the input changes nothing, and another project reads none of it", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Person doors"), other = await f.project("Elsewhere");
  const post = (projectId: string, path: string, body: unknown) => f.request(`/projects/${projectId}${path}`, { method: "POST", body });
  assert.equal((await post(project.project_id, "/api/acceptance/requirements", { subject: SUBJECT, requirements: ASKED })).status, 200);
  // Extra fields that claim an identity are not part of the contract: the input is refused as invalid, nothing is read for them.
  for (const claim of [{ actor_id: "agent:assistant" }, { audience: "agent" }, { project_id: other.project_id }, { person: true }]) {
    const refused = await post(project.project_id, "/api/acceptance/read", { subjects: [SUBJECT], ...claim });
    assert.ok(refused.status >= 400, `a claim of ${Object.keys(claim)[0]} in the body is refused (${refused.status})`);
  }
  const elsewhere = (await (await post(other.project_id, "/api/acceptance/read", { subjects: [SUBJECT] })).json() as AcceptanceReadResult).views[0]!;
  assert.deepEqual(elsewhere.requirements, [], "the other project has nothing on that object");
  // Without the page's control token there is no door at all.
  const anonymous = await f.request(`/projects/${project.project_id}/api/acceptance/read`, { method: "POST", body: { subjects: [SUBJECT] }, authorized: false });
  assert.ok(anonymous.status >= 400);
});

test("S-work-line-person-doors WLN-08 N42 every event card operation rechecks the registrant without reading background tasks", { timeout: 120_000 }, async t => {
  const source = { surface: "example", title: "示例", icon: "list" }, subject = { kind: "homebg_item", id: "on-line" };
  const plugin = backgroundPlugin(() => ({ source, tasks: [] }));
  plugin.state.events = () => ({ source, events: [{ event_id: "card", subject, title: "事件", summary: "", content: "", facts: [],
    category: "personal", placement: "active", occurred_at: new Date().toISOString(), needs_attention: false, open: null }] });
  let readable = true;
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [plugin.definition] },
    actionAvailability: (_caller, view) => !readable && view.capability_id === "homebg.events"
      ? { available: false, code: "actions.forbidden", reason: "没有读取权限" } : { available: true } });
  const project = await f.project("Event card");
  const post = (body: object) => f.request(`/projects/${project.project_id}/api/mainline/event/surfaces`, { method: "POST", body });
  const offer = { intent: "cancel", prepared: "00000000-0000-0000-0000-000000000000" };
  const taskReads = plugin.state.calls.length;
  const present = await post({ subject, expanded: true });
  assert.equal(present.status, 200, await present.clone().text());
  assert.ok(Array.isArray((await present.json()).groups));
  const before = plugin.state.eventCalls.length;
  assert.ok(before > 0);
  readable = false;
  const denied = await post({ subject });
  assert.equal((await denied.json()).code, "actions.subject_unavailable");
  assert.equal(plugin.state.eventCalls.length, before);
  readable = true;
  plugin.state.events = () => ({ source, events: [] });
  for (const operation of [{ expanded: true }, { click: { owner_plugin_id: "com.example.homebg", target: { kind: "open", subject } } }, { correct: { correction: "remove", expected_revision: "0", subject } }, { recovery: subject }, { offer }]) {
    const absent = await post({ subject, ...operation });
    assert.ok(absent.status >= 400);
    assert.equal((await absent.json()).code, "actions.subject_unavailable");
  }
  assert.equal(plugin.state.eventCalls.length, before + 5);
  const unknown = await post({ subject: { kind: "other", id: subject.id } });
  assert.equal((await unknown.json()).code, "actions.subject_unavailable");
  assert.equal(plugin.state.eventCalls.length, before + 5, "the registrant does not declare that kind");
  assert.equal(plugin.state.calls.length, taskReads, "these HTTP requests never ask the task provider");
});
