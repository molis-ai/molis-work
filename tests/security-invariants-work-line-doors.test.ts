import assert from "node:assert/strict";
import test from "node:test";
import type { AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-work-line-person-doors: the workbench's own doors to the work line, the task table and the requirement column answer the
// person's own page and nobody else. A plugin's page — its own frame's request or one made under its page's name — is refused
// before any action is called, so it reads nothing through them and nothing is written.

const SUBJECT = { provider_id: "io.molis.work.example.things", subject: { kind: "thing", id: "t1" } };
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
  const before = await (await post("/api/acceptance/read", { subject: SUBJECT })).json() as AcceptanceView;
  assert.deepEqual(before.requirements.map(one => [one.id, one.version, one.statement]), [["r1", 1, "三档并排"]]);

  const opened = await post("/api/host/plugin-pages", { plugin_id: "io.molis.work.goals" });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json() as { page_id: string };
  const task = { source: { capability_id: "x.background.tasks", version: 1, provider_id: "io.molis.work.example.things" }, subject: SUBJECT.subject };
  const doors: Array<[string, unknown]> = [
    ["/api/mainline/line", window], ["/api/mainline/waiting", {}], ["/api/mainline/tasks", {}],
    ["/api/mainline/tasks/command", { ...task, command: { capability_id: "x.stop", version: 1, provider_id: "io.molis.work.example.things" } }],
    ["/api/mainline/tasks/decide", { ...task, decision: "q1", role: "approve" }],
    ["/api/mainline/place", { task: SUBJECT.subject, to: { kind: "none" } }],
    ["/api/mainline/open", { subject: SUBJECT.subject }],
    ["/api/mainline/shelve", { title: "x", text: "x" }],
    ["/api/mainline/event/surfaces", { subject: SUBJECT.subject }],
    ["/api/acceptance/read", { subject: SUBJECT }],
    ["/api/acceptance/decide", { subject: SUBJECT, version: "v1", accepts: [{ id: "r1", version: 1 }], returns: [] }],
    ["/api/acceptance/requirements", { subject: SUBJECT, requirements: [{ ...ASKED[0], statement: "插件页面改的" }, { id: "r2", statement: "多出来的一项", requires_person: false }] }],
  ];
  for (const header of ["x-molis-plugin-page", "x-molis-context-page"]) {
    for (const [path, body] of doors) {
      const refused = await post(path, body, { [header]: page_id });
      const answer = await refused.json().catch(() => ({})) as { error?: { code?: string }; requirements?: unknown; events?: unknown; tasks?: unknown };
      assert.ok(refused.status >= 400, `${header} ${path} answered ${refused.status}`);
      assert.ok(answer.requirements === undefined && answer.events === undefined && answer.tasks === undefined, `${header} ${path} read nothing`);
    }
  }
  // The same page's attention read has no line and no tasks in it.
  const attention = await f.request(prefix + "/api/attention", { headers: { "x-molis-plugin-page": page_id } });
  if (attention.status === 200) {
    const parts = await attention.json() as { line: unknown; tasks: unknown };
    assert.deepEqual([parts.line, parts.tasks], [null, null], "a plugin's page is given no line and no task table");
  } else assert.ok(attention.status >= 400);

  // Nothing a refused request carried was written.
  const after = await (await post("/api/acceptance/read", { subject: SUBJECT })).json() as AcceptanceView;
  assert.deepEqual(after, before);
});

test("S-work-line-person-doors PWA-144: the person's doors take who is asking from the request, never from its body — an actor, an audience or a project written into the input changes nothing, and another project reads none of it", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Person doors"), other = await f.project("Elsewhere");
  const post = (projectId: string, path: string, body: unknown) => f.request(`/projects/${projectId}${path}`, { method: "POST", body });
  assert.equal((await post(project.project_id, "/api/acceptance/requirements", { subject: SUBJECT, requirements: ASKED })).status, 200);
  // Extra fields that claim an identity are not part of the contract: the input is refused as invalid, nothing is read for them.
  for (const claim of [{ actor_id: "agent:assistant" }, { audience: "agent" }, { project_id: other.project_id }, { person: true }]) {
    const refused = await post(project.project_id, "/api/acceptance/read", { subject: SUBJECT, ...claim });
    assert.ok(refused.status >= 400, `a claim of ${Object.keys(claim)[0]} in the body is refused (${refused.status})`);
  }
  const elsewhere = await (await post(other.project_id, "/api/acceptance/read", { subject: SUBJECT })).json() as AcceptanceView;
  assert.deepEqual(elsewhere.requirements, [], "the other project has nothing on that object");
  // Without the page's control token there is no door at all.
  const anonymous = await f.request(`/projects/${project.project_id}/api/acceptance/read`, { method: "POST", body: { subject: SUBJECT }, authorized: false });
  assert.ok(anonymous.status >= 400);
});
