import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { openFormStore } from "@molis-ai/molis-work-plugin-form";
import { projectActionAvailability } from "../apps/local-host/dist/project-action-availability.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/archive/work-placement AC6 through the whole stack: where things are, how they relate, what was copied or moved, and a
// failed move are all still true after the Host stops and starts again on the same Home; nothing depends on the page.
test("placement survives a restart: relations, a removed relation, a copy, a move, a failed move and collected answers", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-placement-restart-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const q4 = await catalog.createProject({ display_name: "Q4 新版发布", actor_id: "placement-test" });
  const interviews = await catalog.createProject({ display_name: "客户访谈计划", actor_id: "placement-test" });
  for (const project of [q4, interviews]) for (const plugin_id of ["pages", "form"] as const) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "placement-test" });
  catalog.close();
  const token = "placement-restart-control-token-0123456789";
  const start = async () => {
    const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) });
    const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const call = async <T = Record<string, unknown>>(path: string, body?: unknown, expected = 200): Promise<T> => {
      const response = await fetch(origin + path, body === undefined ? { headers: { origin } } : { method: "POST", body: JSON.stringify(body),
        headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() } });
      const value = await response.json() as T;
      assert.equal(response.status, expected, `${path}: ${JSON.stringify(value)}`);
      return value;
    };
    const stop = async () => {
      await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
      await host.close();
    };
    return { call, stop };
  };
  type Placed = { kind: string; id: string; project_id: string | null };
  type Description = { state: string; title: string; location: { title: string } | null; moved_from: { title: string } | null;
    associations: { key: string; type: string; label: string; target: { project_id: string | null } }[] };
  const q4Title = "项目「Q4 新版发布」", interviewsTitle = "项目「客户访谈计划」";

  // Before: a checklist captured in the personal space, used in two projects, then taken out of one; a copy for the interviews;
  // a brief moved into Q4; a move to a project that does not exist, refused; a form in Q4 with two answers in.
  const before = await start();
  const created = async (title: string) => (await before.call<{ object: Placed; location: { title: string } }>("/api/placement/create", { station: "pages", project_id: "personal", request_id: randomUUID(), title }));
  const checklist = await created("上线前检查清单");
  assert.equal(checklist.location.title, "个人空间");
  for (const project of [q4, interviews]) await before.call("/api/placement/link", { object: checklist.object, project_id: project.project_id });
  const linked = await before.call<Description>("/api/placement/describe", { object: checklist.object });
  const intoInterviews = linked.associations.find(link => link.type === "used_in" && link.target.project_id === interviews.project_id)!;
  await before.call("/api/placement/unlink", { key: intoInterviews.key });
  const copy = await before.call<{ object: Placed }>("/api/placement/copy", { object: checklist.object, to_project_id: interviews.project_id, request_id: "copy-once" });
  const brief = await created("发布简报");
  await before.call("/api/placement/move", { object: brief.object, to_project_id: q4.project_id });
  const refused = await before.call<{ error: string }>("/api/placement/move", { object: { ...brief.object, project_id: q4.project_id }, to_project_id: "project-that-does-not-exist" }, 409);
  assert.ok(refused.error, "a failed move says why");
  const forms = openFormStore(home);
  let formId: string;
  try {
    const form = forms.receive(q4.project_id, "restart-form", "发布日满意度", [{ id: "score", title: "满意度" }]);
    formId = form.id;
    forms.submit(form.id, { score: "5" }, q4.project_id, { source: "preview", requestId: "one" });
    forms.submit(form.id, { score: "4" }, q4.project_id, { source: "preview", requestId: "two" });
  } finally { forms.close(); }
  await before.stop();

  // After: a new Host on the same Home tells the same story.
  const after = await start();
  const again = await after.call<Description>("/api/placement/describe", { object: checklist.object });
  assert.deepEqual([again.state, again.title, again.location?.title], ["ok", "上线前检查清单", "个人空间"]);
  const uses = again.associations.filter(link => link.type === "used_in").map(link => link.target.project_id);
  assert.deepEqual(uses, [q4.project_id], "still used in Q4, and the relation taken out of the interviews stays out");
  assert.ok(again.associations.some(link => link.label.includes("复制到《上线前检查清单》")), "the original knows it was copied");
  const q4Related = await after.call<{ items: { object: Placed; title: string }[] }>(`/api/placement/related?project_id=${q4.project_id}`);
  assert.deepEqual(q4Related.items.map(item => item.object.id), [checklist.object.id], "Q4's home lists the checklist it uses");
  const interviewsRelated = await after.call<{ items: unknown[] }>(`/api/placement/related?project_id=${interviews.project_id}`);
  assert.equal(interviewsRelated.items.length, 0, "the interviews project lists nothing it no longer uses");
  const copied = await after.call<Description>("/api/placement/describe", { object: copy.object });
  assert.deepEqual([copied.location?.title, copied.associations.some(link => link.label.includes("复制自《上线前检查清单》"))], [interviewsTitle, true]);
  // The old reference (from before the move) still finds the brief, where it now is, and says where it came from.
  const moved = await after.call<Description>("/api/placement/describe", { object: brief.object });
  assert.deepEqual([moved.state, moved.location?.title, moved.moved_from?.title], ["ok", q4Title, "个人空间"], "the refused move changed nothing");
  const reopened = openFormStore(home);
  try { assert.equal(reopened.listSubmissions(formId, q4.project_id).length, 2, "collected answers are still there"); }
  finally { reopened.close(); }
  const form = await after.call<Description>("/api/placement/describe", { object: { kind: "form", id: formId, project_id: q4.project_id } });
  assert.deepEqual([form.state, form.location?.title], ["ok", q4Title]);
  await after.stop();
});
