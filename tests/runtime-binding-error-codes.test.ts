import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import type { MolisWorkProjectCatalog, RuntimeWorkContext } from "@molis-ai/molis-work-app-local-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// T-057: five of the private work context's declared refusal codes had no test at all. Each one is reached through the catalog's public
// API only; the code (never the Chinese sentence nor an HTTP status) is what these cases pin.
const refused = (code: string) => (error: unknown) => {
  assert.ok(error instanceof ActionError, String(error));
  assert.equal(error.code, code);
  return true;
};

const scope = { kind: "personal", id: "private-work-context" } as const;
const access = { actor_id: "binding-code-test", scope };

const session = (id: string): RuntimeWorkContext => ({ runtime_id: "codex", stable_work_context_id: id, host_declares_stable: true });

async function withCatalog<T>(run: (catalog: MolisWorkProjectCatalog, directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-binding-errors-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: join(directory, "home", ".molis-work") });
  try {
    return await run(catalog, directory);
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("RAC-1520 a binding whose Ledger relation is gone or points outside projects is refused, never guessed", async () => {
  await withCatalog(async (catalog) => {
    const project = await catalog.createProject({ display_name: "Alpha", actor_id: "owner" });
    catalog.bindRuntimeContext({ context: session("relation-missing"), project_id: project.project_id, actor_id: "runtime-codex", user_confirmed: true });
    const bindingId = catalog.listRuntimeContextBindings()[0]!.binding_id;
    const db = new Database(catalog.databasePath);
    try {
      const ledger = createContextLedger(db, { authorize: () => true });
      const key = `work.binding_project:${bindingId}`;
      const source = { module: "private-work-context", object_type: "runtime-context", id: bindingId, version: null, scope };
      const projectTarget = { module: "projects", object_type: "project", id: project.project_id, version: null, scope, project_id: project.project_id };
      // (a) control: while the edge is there, the binding resolves to its project.
      assert.equal(catalog.resolveRuntimeContext(session("relation-missing")).project?.project_id, project.project_id);
      ledger.commands.remove(access, key, "test.relation_removed", new Date().toISOString());
      // (b)(c) the edge is gone: reading the binding refuses instead of guessing a project.
      assert.throws(() => catalog.resolveRuntimeContext(session("relation-missing")), refused("work.context.project_relation_missing"));
      assert.throws(() => catalog.listRuntimeContextBindings(), refused("work.context.project_relation_missing"));
      // (d)(e) the edge now points into another module: still not a project relation.
      ledger.commands.put(access, { key, type: "work.binding_project", source,
        target: { module: "goals", object_type: "goal", id: "goal-1", version: null, scope, project_id: project.project_id },
        cause: "test.relation_retargeted", recorded_at: new Date().toISOString() });
      assert.throws(() => catalog.resolveRuntimeContext(session("relation-missing")), refused("work.context.project_relation_missing"));
      assert.throws(() => catalog.listRuntimeContextBindings(), refused("work.context.project_relation_missing"));
      // (f) putting the project relation back restores the binding.
      ledger.commands.put(access, { key, type: "work.binding_project", source, target: projectTarget,
        cause: "test.relation_restored", recorded_at: new Date().toISOString() });
      assert.equal(catalog.resolveRuntimeContext(session("relation-missing")).project?.project_id, project.project_id);
      assert.equal(catalog.listRuntimeContextBindings()[0]!.binding_id, bindingId);
    } finally { db.close(); }
  });
});

test("RAC-1521 rejecting a candidate project is refused for a not-candidate and for an already bound Session; a real candidate is rejected", async () => {
  await withCatalog(async (catalog) => {
    const alpha = await catalog.createProject({ display_name: "Alpha", actor_id: "owner" });
    const beta = await catalog.createProject({ display_name: "Beta", actor_id: "owner" });
    const clues = [{ kind: "project_name", value: "Alpha" }];
    const reject = (context: RuntimeWorkContext, projectId: string) => catalog.rejectRuntimeContextSuggestion({
      context, project_id: projectId, actor_id: "runtime-codex", user_confirmed: true, suggestion_clues: clues });
    // (a) Beta is not one of this Session's candidates.
    assert.throws(() => reject(session("reject-open"), beta.project_id), refused("work.context.suggestion_not_available"));
    // (b) control: Alpha is the candidate the clue names; rejecting it is a real decision.
    assert.equal(reject(session("reject-open"), alpha.project_id).changed, true);
    // (c) a Session already bound to Alpha cannot reject Alpha again, even though the clue matches it.
    catalog.bindRuntimeContext({ context: session("reject-bound"), project_id: alpha.project_id, actor_id: "runtime-codex", user_confirmed: true });
    assert.throws(() => reject(session("reject-bound"), alpha.project_id), refused("work.context.suggestion_not_available"));
    // (d) the refusal did not move the existing binding.
    assert.equal(catalog.resolveRuntimeContext(session("reject-bound")).project?.project_id, alpha.project_id);
  });
});

test("RAC-1522 a workspace-default binding is refused before any effect, from both the bind and the create-and-bind entry", async () => {
  await withCatalog(async (catalog) => {
    const alpha = await catalog.createProject({ display_name: "Alpha", actor_id: "owner" });
    let effects = 0;
    // (a)(b) binding a workspace default: refused, nothing recorded.
    assert.throws(() => catalog.bindRuntimeContext({ context: session("workspace-default-bind"), project_id: alpha.project_id,
      actor_id: "runtime-codex", user_confirmed: true, binding_scope: "workspace_default" }), refused("work.context.workspace_default_unsupported"));
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    // (c)(d)(e) creating and binding one: refused before the project files' beforeEffect ever runs.
    await assert.rejects(catalog.createProjectAndBindRuntimeContext({ context: session("workspace-default-create"), display_name: "Beta",
      actor_id: "runtime-codex", user_confirmed: true, binding_scope: "workspace_default", idempotency_key: "workspace-default" }, () => { effects += 1; }),
    refused("work.context.workspace_default_unsupported"));
    assert.equal(effects, 0, "refused before creating or registering anything");
    assert.equal(catalog.listProjects().length, 1);
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    // (f) control: a session-scoped create-and-bind succeeds and does run beforeEffect.
    const bound = await catalog.createProjectAndBindRuntimeContext({ context: session("session-scope-create"), display_name: "Gamma",
      actor_id: "runtime-codex", user_confirmed: true, binding_scope: "session", idempotency_key: "session-scope" }, () => { effects += 1; });
    assert.equal(bound.status, "bound");
    assert.ok(effects > 0);
    assert.equal(catalog.listProjects().length, 2);
  });
});

test("RAC-1523 removing a workspace membership without a workspace is refused; with one the Session binding stays", async () => {
  await withCatalog(async (catalog, directory) => {
    const alpha = await catalog.createProject({ display_name: "Alpha", actor_id: "owner" });
    catalog.bindRuntimeContext({ context: session("no-workspace"), project_id: alpha.project_id, actor_id: "runtime-codex", user_confirmed: true });
    const unbind = (context: RuntimeWorkContext) => catalog.unbindRuntimeContext({ context, actor_id: "runtime-codex",
      user_confirmed: true, binding_scope: "workspace", project_id: alpha.project_id });
    // (a)(b) no workspace on the context: refused, and the Session binding is untouched.
    assert.throws(() => unbind(session("no-workspace")), refused("work.context.workspace_required"));
    assert.equal(catalog.resolveRuntimeContext(session("no-workspace")).project?.project_id, alpha.project_id);
    assert.equal(catalog.listRuntimeContextBindings().length, 1);
    // (c)(d) a real workspace that is not a member of this project: nothing to remove, nothing changed.
    const workspace = join(directory, "workspace");
    await mkdir(workspace, { recursive: true });
    const result = unbind({ ...session("no-workspace"), workspace: { canonical_path: workspace, realpath_verified: false } });
    assert.equal(result.changed, false);
    assert.equal(result.unbound_project, null);
    assert.equal(catalog.listRuntimeContextBindings().length, 1);
  });
});

test("RAC-1524 a blank idempotency key is refused before any effect; a real key creates and binds", async () => {
  await withCatalog(async (catalog) => {
    let effects = 0;
    const create = (key: string) => catalog.createProjectAndBindRuntimeContext({ context: session("no-key"), display_name: "Alpha",
      actor_id: "runtime-codex", user_confirmed: true, idempotency_key: key }, () => { effects += 1; });
    // (a)(b) empty and whitespace-only keys: refused, nothing created, nothing bound.
    await assert.rejects(create(""), refused("work.context.idempotency_key_required"));
    await assert.rejects(create("   "), refused("work.context.idempotency_key_required"));
    assert.equal(effects, 0);
    assert.equal(catalog.listProjects().length, 0);
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    // (c) control: a real key creates the project and binds it.
    const bound = await create("no-key-1");
    assert.equal(bound.status, "bound");
    assert.equal(catalog.listProjects().length, 1);
  });
});

test("RAC-1650 removing a membership the workspace really has: the membership goes; the Session binding, the project and its database stay", async () => {
  await withCatalog(async (catalog, directory) => {
    const alpha = await catalog.createProject({ display_name: "Alpha", actor_id: "owner" });
    const workspacePath = join(directory, "member-workspace");
    await mkdir(workspacePath, { recursive: true });
    const workspace = { canonical_path: workspacePath, realpath_verified: false };
    const member: RuntimeWorkContext = { ...session("workspace-member"), workspace };
    const noSession: RuntimeWorkContext = { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false, workspace };
    // Binding a Session that carries a workspace also records the workspace as Alpha's member (bindRuntimeContextInTransaction).
    const bound = catalog.bindRuntimeContext({ context: member, project_id: alpha.project_id, actor_id: "runtime-codex", user_confirmed: true });
    const workspaceId = bound.context.workspace!.workspace_id;
    const members = () => catalog.listWorkspaceMemberships().filter((membership) => membership.workspace_id === workspaceId)
      .map((membership) => membership.project_id);
    const directoryRecord = () => catalog.listWorkspaceDirectory().find((record) => record.workspace_id === workspaceId);
    const unbind = () => catalog.unbindRuntimeContext({ context: member, actor_id: "runtime-codex",
      user_confirmed: true, binding_scope: "workspace", project_id: alpha.project_id });
    // (a) control: the workspace is Alpha's member, so a Runtime there with no Session is offered Alpha.
    assert.deepEqual(members(), [alpha.project_id]);
    assert.deepEqual(directoryRecord()?.project_ids, [alpha.project_id]);
    assert.deepEqual(catalog.resolveRuntimeContext(noSession).suggested_projects.map((project) => project.project_id), [alpha.project_id]);
    // (b) removing the membership reports Alpha, and the workspace no longer offers it.
    const removed = unbind();
    assert.equal(removed.changed, true);
    assert.deepEqual(removed.unbound_project, { project_id: alpha.project_id, display_name: "Alpha" });
    assert.deepEqual(members(), []);
    assert.equal(catalog.resolveRuntimeContext(noSession).status, "unbound");
    // (c) the Session binding is another fact: it still resolves to Alpha, and no unbind was recorded for it.
    assert.equal(removed.resolution.project?.project_id, alpha.project_id);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(member).map((event) => event.type), ["context.bound"]);
    // (d) the project and its database stay; the workspace record stays with no member (unlinkWorkspaceMembership(…, false)).
    assert.equal(catalog.getProject(alpha.project_id).display_name, "Alpha");
    assert.equal((await stat(alpha.database_path)).isFile(), true);
    assert.deepEqual(directoryRecord()?.project_ids, []);
    // (e) removing it again finds no membership: nothing changes, nothing is reported.
    const again = unbind();
    assert.equal(again.changed, false);
    assert.equal(again.unbound_project, null);
    assert.equal(catalog.resolveRuntimeContext(member).project?.project_id, alpha.project_id);
  });
});
