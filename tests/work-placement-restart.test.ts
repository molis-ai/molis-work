import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { ActionError, defineSubjectContextAction, subjectContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLACEMENT_PROVIDER_ID, placementActions } from "@molis-ai/molis-work-contracts/services/placement";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost, MolisWorkLocalHost, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { openFormStore, openPagesStore } from "./fixtures/plugin-home-stores.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/archive/work-placement AC6 through the whole stack: where things are, how they relate, what was copied or moved, and a
// failed move are all still true after the Host stops and starts again on the same Home; nothing depends on the page.
test("placement survives a restart: relations, a removed relation, a copy, a move, a failed move and collected answers", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-placement-restart-"));
  const stops = new Set<() => Promise<void>>();
  t.after(async () => { try { for (const stop of stops) await stop(); } finally { await rm(home, { recursive: true, force: true }); } });
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
      if (!stops.delete(stop)) return;
      try { await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); }
      finally { await host.close(); }
    };
    stops.add(stop);
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
  // W3-02-G1-03: the shared error exit preserves the current default for a code without a declared kind.
  const refused = await before.call<{ error: string; code: string }>("/api/placement/move", { object: { ...brief.object, project_id: q4.project_id }, to_project_id: "project-that-does-not-exist" }, 400);
  assert.equal(refused.code, "placement.project_missing");
  assert.equal(refused.error, "找不到要移到的位置");
  const unchanged = await before.call<Description>("/api/placement/describe", { object: brief.object });
  assert.deepEqual([unchanged.state, unchanged.location?.title, unchanged.moved_from?.title], ["ok", q4Title, "个人空间"], "the rejected move leaves the persisted placement unchanged before restart");
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

// W2-18-PLACEMENT-01 / -02: actual Host registration and SQLite, including an invocation in another owner partition.
for (const operation of ["link", "convert"] as const) for (const stop of ["cancel", "revoke", "replace"] as const)
  test(`placement ${operation} retains its original ${stop} control while the owner reader waits`, { timeout: 30_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "placement-effects-"));
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const project = await catalog.createProject({ display_name: "Target", actor_id: "web-user" });
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "pages", actor_id: "web-user" }); catalog.close();
    const finished = Promise.withResolvers<void>(), originalRegistry = LocalHost.prototype.actionRegistry;
    // The placement provider's own registration is kept so a replacement can withdraw it first (the kernel refuses a second
    // registration of the same action).
    let withdrawPlacement: (() => void) | undefined;
    t.mock.method(LocalHost.prototype, "actionRegistry", function (this: LocalHost<unknown>, ...args) {
      const registry = originalRegistry.apply(this, args);
      return { ...registry, registerProvider: registration => {
        const remove = registry.registerProvider({ ...registration, handlers: registration.handlers?.map(binding =>
          binding.capability_id !== placementActions[operation].capability_id ? binding : { ...binding, handle: async (caller, input) => {
            try { return await binding.handle(caller, input); } finally { finished.resolve(); }
          } }) });
        if (registration.provider.provider_id === PLACEMENT_PROVIDER_ID && registration.provider.title !== "Replacement") withdrawPlacement = remove;
        return remove;
      } };
    });
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let valid = true, holding = true;
    // A failing step must not leave the owner reader held: closing the Host waits for it.
    t.after(async () => { holding = false; release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); });
    const reader = defineSubjectContextAction("fixture.clip.read", "fixture-clip", "Fixture", [], "home");
    host.actionRegistry().registerProvider({ provider: { provider_id: "fixture-clip", title: "Fixture", kind: "system" }, definitions: [reader],
      handlers: [{ ...reader, handle: async () => { if (holding) { entered.resolve(); await release.promise; }
        return subjectContext({ subject: { kind: "fixture-clip", id: "original" }, revision: "1", title: "Fixed source", content: "original body", goal_ids: [] }); } }] });
    const controller = new AbortController(), definition = placementActions[operation];
    const caller: ActionCallContext = { actor_id: "web-user", audience: "user", project_id: null, permissions: [...definition.action.permissions], signal: controller.signal,
      validate_authority: reference => { if (!valid && reference.capability_id === definition.capability_id) throw new ActionError("actions.forbidden", "fixture grant revoked"); } };
    const object = { kind: "fixture-clip", id: "original", project_id: null };
    const input = operation === "link" ? { object, project_id: project.project_id } : { source: object, to: { station: "pages" }, to_project_id: project.project_id, request_id: randomUUID() };
    const pending = host.homeActionClient().invoke(caller, definition, input), rejected = assert.rejects(pending);
    await entered.promise;
    if (stop === "cancel") controller.abort(); else if (stop === "revoke") valid = false;
    else {
      assert.ok(withdrawPlacement, "the Host registered the placement provider through its action registry");
      withdrawPlacement!();
      host.actionRegistry().registerProvider({ provider: { provider_id: PLACEMENT_PROVIDER_ID, title: "Replacement", kind: "system" }, definitions: [definition], handlers: [{ ...definition, handle: () => ({ key: "replacement" }) }] });
    }
    holding = false; release.resolve(); await Promise.all([rejected, finished.promise]);
    const database = new DatabaseSync(homeSqlitePath(home, "placement"));
    try {
      assert.equal((database.prepare("SELECT count(*) AS count FROM context_edges").get() as { count: number }).count, 0);
      assert.equal((database.prepare("SELECT count(*) AS count FROM placement_titles").get() as { count: number }).count, 0);
    } finally { database.close(); }
    // Pages keeps its documents in the Home's Pages store (openPagesStore), not in the project's database: no document was made.
    const pages = openPagesStore(home);
    try { assert.deepEqual(pages.list(project.project_id), []); } finally { pages.close(); }
  });
