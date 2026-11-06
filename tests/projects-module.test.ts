import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as projectsExports from "@molis-ai/molis-work-module-projects";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";

import {
  createProjectsSchema,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
import { openTestSqlite, type SqliteDatabase } from "@molis-ai/molis-work-test-kit/sqlite";

function createModule(db: SqliteDatabase, directory: string): ProjectsModule {
  let sequence = 0;
  return new ProjectsModule({
    db,
    projects_directory: directory,
    plugins: { has: id => id === "goals", companions: () => [] },
    now: () => `2026-09-02T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
    plugins: { has: id => id === "pages", companions: () => [] },
  });
}

test("Projects Module owns canonical project identity and workspace membership", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-projects-module-"));
  const db = openTestSqlite(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    createProjectsSchema(db);
    const projects = createModule(db, directory);
    // W5-08-MOD-01/02: records stay behind business services; the complete identity/membership path below remains public.
    assert.equal("ProjectsRepository" in projectsExports, false);
    assert.equal("repository" in projects, false);

    const first = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      data_class: "user",
    });
    const second = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      data_class: "user",
    });
    projects.lifecycle.register(first, "project.created", "user-1");
    projects.lifecycle.register(second, "project.created", "user-1");

    assert.equal(projects.query.listProjects().length, 2, "duplicate display names do not change identity");
    // PERSAF-05: a never-installed plugin and an explicit user removal are different facts.
    assert.equal(projects.query.wasProjectPluginRemoved(first.project_id, "pages"), false);
    projects.commands.addProjectPlugin({ project_id: first.project_id, plugin_id: "pages", actor_id: "user-1" });
    projects.commands.removeProjectPlugin({ project_id: first.project_id, plugin_id: "pages", actor_id: "user-1" });
    assert.equal(projects.query.wasProjectPluginRemoved(first.project_id, "pages"), true);
    assert.equal(projects.query.wasProjectPluginRemoved(second.project_id, "pages"), false);
    assert.deepEqual(projects.query.selections().map((project) => project.project_id), [first.project_id, second.project_id]);
    // I4-01: the Host's existing missing-project classification is preserved by the owner.
    assert.throws(() => projects.query.getProject("absent-project"), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "catalog.project_not_found");
      assert.equal(error.message, "找不到 Molis Work 项目: absent-project");
      assert.equal(error.kind, "not_found");
      assert.equal(actionHttpStatus(error), 404);
      return true;
    });

    const workspacePath = join(directory, "workspace");
    const workspace = projects.commands.addWorkspaceProject({
      canonical_path: workspacePath,
      project_id: first.project_id,
      actor_id: "user-1",
      user_confirmed: true,
    });
    assert.deepEqual(workspace.project_ids, [first.project_id]);
    assert.equal(projects.query.preferredWorkspacePath(first.project_id), workspacePath);
    assert.deepEqual(
      projects.query.workspaceProjectSelections(workspace.workspace_id),
      [{ project_id: first.project_id, display_name: first.display_name }],
    );

    assert.throws(
      () => projects.commands.addWorkspaceProject({
        canonical_path: workspacePath,
        project_id: second.project_id,
        actor_id: "user-1",
        user_confirmed: false,
      }),
      // R4A2-01: project membership owns this separate confirmation refusal.
      (error: unknown) => {
        // I4-01: a missing user confirmation stays a Catalog input refusal, before facts change.
        assert.ok(error instanceof ActionError);
        assert.equal(error.code, "catalog.context.user_confirmation_required");
        assert.equal(error.message, "只有用户明确确认后才能关联工作目录");
        assert.equal(error.kind, "invalid");
        assert.equal(actionHttpStatus(error), 400);
        assert.equal(Object.hasOwn(error, "details"), false);
        return true;
      },
    );
    assert.deepEqual(projects.query.workspaceProjectSelections(workspace.workspace_id),
      [{ project_id: first.project_id, display_name: first.display_name }]);
    assert.throws(
      () => projects.lifecycle.prepareRecord({
        display_name: " ",
        data_class: "user",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ActionError);
        assert.equal(error.code, "catalog.invalid_name");
        assert.equal(error.message, "项目显示名称不能为空");
        assert.equal(actionHttpStatus(error), 400);
        return true;
      },
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A catalog with two projects, so that a directory can belong to one or to both. */
function withTwoProjects(run: (env: { db: SqliteDatabase; projects: ProjectsModule; first: string; second: string; link: (projectId: string, path: string) => string }) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-projects-module-"));
  const db = openTestSqlite(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    createProjectsSchema(db);
    const projects = createModule(db, directory);
    const ids = ["甲", "乙"].map(name => {
      const record = projects.lifecycle.prepareRecord({ display_name: name, data_class: "user" });
      projects.lifecycle.register(record, "project.created", "user-1");
      return record.project_id;
    });
    const link = (projectId: string, path: string) => projects.commands.addWorkspaceProject({
      canonical_path: join(directory, path), project_id: projectId, actor_id: "user-1", user_confirmed: true,
    }).workspace_id;
    run({ db, projects, first: ids[0]!, second: ids[1]!, link });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
const rows = (db: SqliteDatabase, table: "workspaces" | "workspace_project_memberships"): number =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

test("RAC-2453 deleting a project's memberships removes the directory records that no project belongs to any more", () => {
  withTwoProjects(({ db, projects, first, link }) => {
    link(first, "alone");
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [1, 1]);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 1, "the count is still the memberships removed");
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [0, 0]);
  });
});

test("RAC-2454 a directory two projects share stays, with the other project's membership, until the last one goes", () => {
  withTwoProjects(({ db, projects, first, second, link }) => {
    const shared = link(first, "shared");
    assert.equal(link(second, "shared"), shared);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 1);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [1, 1]);
    assert.deepEqual(projects.query.workspaceProjectSelections(shared).map(selection => selection.project_id), [second]);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(second), 1);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [0, 0]);
  });
});

test("RAC-2455 of a project's two directories, the one only it belongs to goes and the shared one stays", () => {
  withTwoProjects(({ db, projects, first, second, link }) => {
    const alone = link(first, "alone"), shared = link(first, "shared");
    link(second, "shared");
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2);
    assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces").all(), [{ workspace_id: shared }]);
    assert.notEqual(alone, shared);
  });
});

test("RAC-2456 a deletion that fails after the memberships go puts the directory records back, and records this deletion did not empty are not touched", () => {
  withTwoProjects(({ db, projects, first, second, link }) => {
    link(first, "alone");
    // A directory with no member at all was there before this deletion: it is not this deletion's to remove.
    db.prepare("INSERT INTO workspaces (workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at) VALUES ('stale', '/stale', 0, 'stale', 'x', 'x')").run();
    assert.throws(() => projects.lifecycle.transaction(() => {
      assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 1);
      assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces").all(), [{ workspace_id: "stale" }]);
      throw new Error("the deletion failed after the directory step");
    }), /deletion failed/u);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [2, 1], "rolled back: the directory and its membership are back");
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(second), 0, "a project with no directory removes nothing");
    assert.equal(rows(db, "workspaces"), 2);
  });
});

const personLinks = (projects: ProjectsModule, projectId: string, canonicalPath: string) => projects.commands.addWorkspaceProject({
  canonical_path: canonicalPath, project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
const toolBinds = (projects: ProjectsModule, projectId: string, canonicalPath: string, actorId: string) => {
  const workspace = projects.lifecycle.normalizeWorkspace({ canonical_path: canonicalPath, realpath_verified: false })!;
  projects.lifecycle.upsertWorkspaceMembership(workspace, projectId, actorId);
  return workspace.workspace_id;
};
const directoryRecord = (projects: ProjectsModule, workspaceId: string) =>
  projects.query.listWorkspaceDirectory().find(record => record.workspace_id === workspaceId);
const boundBy = (db: SqliteDatabase, workspaceId: string, projectId: string) =>
  (db.prepare("SELECT bound_by FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?").get(workspaceId, projectId) as { bound_by: string } | undefined)?.bound_by;
const setBoundBy = (db: SqliteDatabase, workspaceId: string, projectId: string, value: string | null) =>
  db.prepare("UPDATE workspace_project_memberships SET bound_by = ? WHERE workspace_id = ? AND project_id = ?").run(value, workspaceId, projectId);
const eventActors = (db: SqliteDatabase, projectId: string, type: string) =>
  (db.prepare("SELECT actor_id FROM project_events WHERE project_id = ? AND type = ? ORDER BY created_at, event_id").all(projectId, type) as { actor_id: string }[]).map(row => row.actor_id);

test("SRB-14 only the person's id makes a relation the person's: a tool's, an empty value and another actor's are refused", () => {
  withTwoProjects(({ db, projects, first, second }) => {
    const shared = personLinks(projects, first, "/p1/shared").workspace_id;
    assert.deepEqual(directoryRecord(projects, shared)?.person_project_ids, [first]);
    // A tool binding that carries the person's id, as a terminal the person opened does, is still a tool's.
    assert.equal(toolBinds(projects, second, "/p1/shared", LOCAL_PERSON_ACTOR_ID), shared);
    assert.equal(boundBy(db, shared, second), `binding:${LOCAL_PERSON_ACTOR_ID}`);
    assert.deepEqual(directoryRecord(projects, shared)?.project_ids.slice().sort(), [first, second].sort());
    assert.deepEqual(directoryRecord(projects, shared)?.person_project_ids, [first]);
    // An allow-list, not "no prefix means the person": nothing but the exact id counts, whoever or whatever wrote the row.
    for (const value of ["", " ", `${LOCAL_PERSON_ACTOR_ID} `, LOCAL_PERSON_ACTOR_ID.toUpperCase(), `binding:${LOCAL_PERSON_ACTOR_ID}`, "codex:session-1", "user-1"]) {
      setBoundBy(db, shared, first, value);
      assert.deepEqual(directoryRecord(projects, shared)?.person_project_ids, [], JSON.stringify(value));
    }
    assert.throws(() => setBoundBy(db, shared, first, null), /NOT NULL/u, "a row cannot be without a value at all");
    // The relations themselves stay: only who made them is judged.
    assert.deepEqual(directoryRecord(projects, shared)?.project_ids.slice().sort(), [first, second].sort());
  });
});

test("SRB-14 the mark is Projects' own: events keep the plain actor, and an empty actor is refused rather than hidden behind the prefix", () => {
  withTwoProjects(({ db, projects, first }) => {
    toolBinds(projects, first, "/p1/events", "codex:session-1");
    assert.deepEqual(eventActors(db, first, "project.workspace_member_bound"), ["codex:session-1"]);
    assert.throws(() => toolBinds(projects, first, "/p1/blank", "  "), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "catalog.context.user_confirmation_required");
      return true;
    });
    assert.equal(rows(db, "workspace_project_memberships"), 1);
  });
});

test("SRB-14 writing a relation again never takes it from the person; the person linking it again makes it theirs", () => {
  withTwoProjects(({ db, projects, first, second }) => {
    const kept = personLinks(projects, first, "/p1/kept").workspace_id;
    toolBinds(projects, first, "/p1/kept", "codex:session-1");
    assert.equal(boundBy(db, kept, first), LOCAL_PERSON_ACTOR_ID, "a tool does not overwrite the person's value");
    projects.commands.addWorkspaceProject({ canonical_path: "/p1/kept", project_id: first, actor_id: "user-1", user_confirmed: true });
    assert.equal(boundBy(db, kept, first), LOCAL_PERSON_ACTOR_ID, "nor does any other actor");
    assert.deepEqual(directoryRecord(projects, kept)?.person_project_ids, [first]);

    // A tool's relation, in the current mark and in the shape older rows have, becomes the person's once they link it.
    const brought = toolBinds(projects, second, "/p1/brought", "codex:session-1");
    assert.deepEqual(directoryRecord(projects, brought)?.person_project_ids, []);
    toolBinds(projects, second, "/p1/brought", "claude:session-2");
    assert.equal(boundBy(db, brought, second), "binding:claude:session-2", "between tools the last one is recorded");
    personLinks(projects, second, "/p1/brought");
    assert.deepEqual(directoryRecord(projects, brought)?.person_project_ids, [second]);
    const older = toolBinds(projects, first, "/p1/older", "codex:session-1");
    setBoundBy(db, older, first, "codex:session-1");
    personLinks(projects, first, "/p1/older");
    assert.deepEqual(directoryRecord(projects, older)?.person_project_ids, [first]);

    // Repairing a relation is the person pointing it at a directory, so the new path is theirs.
    const moved = toolBinds(projects, first, "/p1/moved-from", "codex:session-1");
    const repaired = projects.commands.repairWorkspaceProject({ workspace_id: moved, canonical_path: "/p1/moved-to", project_id: first,
      actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
    assert.deepEqual(repaired.person_project_ids, [first]);
    assert.equal(directoryRecord(projects, moved), undefined);
  });
});

test("SRB-16 a tool's unlink is refused on the person's relation and takes back only what a tool brought in", () => {
  withTwoProjects(({ db, projects, first, second }) => {
    const own = personLinks(projects, first, "/p1/own").workspace_id;
    for (const actor of ["codex:session-1", LOCAL_PERSON_ACTOR_ID]) {
      assert.equal(projects.lifecycle.unlinkWorkspaceMembership(own, first, actor), false, actor);
    }
    assert.deepEqual(directoryRecord(projects, own)?.person_project_ids, [first]);
    assert.deepEqual(eventActors(db, first, "project.workspace_unlinked"), [], "nothing happened, so nothing is recorded");

    const brought = toolBinds(projects, second, "/p1/brought", "codex:session-1");
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(brought, second, "claude:session-2"), true);
    assert.equal(directoryRecord(projects, brought), undefined, "the record goes with its last member");
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(brought, second, "claude:session-2"), false, "nothing left to remove");

    // The same allow-list: a row that is not the person's by exact id is one a tool can take back.
    const older = toolBinds(projects, second, "/p1/older", "codex:session-1");
    setBoundBy(db, older, second, "codex:session-1");
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(older, second, "codex:session-1"), true);

    // Control: the person's own command does remove it.
    projects.commands.removeWorkspaceMembership({ workspace_id: own, project_id: first, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
    assert.equal(directoryRecord(projects, own), undefined);
  });
});

test("Host Catalog reaches Projects only through the public module entrypoint", () => {
  const source = readFileSync(new URL("../apps/local-host/src/project-catalog.ts", import.meta.url), "utf8");
  assert.match(source, /from "@molis-ai\/molis-work-module-projects"/u);
  assert.doesNotMatch(source, /@molis-ai\/molis-work-module-projects\//u, "deep imports are forbidden");
  assert.doesNotMatch(
    source,
    /\b(?:SELECT\b[^;`]*\bFROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(?:projects|project_events|workspaces|workspace_project_memberships|project_deletions)\b/iu,
    "Project-owned tables must not be queried or mutated by the Host Catalog",
  );
});
