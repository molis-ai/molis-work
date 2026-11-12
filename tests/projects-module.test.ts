import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
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
    outputs_directory: join(directory, "outputs"),
    plugins: { has: id => id === "goals", companions: () => [] },
    now: () => `2026-09-02T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
    plugins: { has: id => id === "pages", companions: () => [] },
  });
}

test("Projects Module owns canonical project identity and workspace membership", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-projects-module-")));
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
    mkdirSync(workspacePath);
    const workspace = projects.commands.addWorkspaceProject({
      canonical_path: workspacePath,
      project_id: first.project_id,
      actor_id: "user-1",
      user_confirmed: true,
    });
    assert.deepEqual(workspace.project_ids, [first.project_id]);
    // A linked folder is an input; what names no folder goes to the project's output, its default output directory (SSC-17, SSC-20).
    assert.deepEqual(projects.query.projectDirectories(first.project_id).directories.map(item => [item.canonical_path, item.roles]),
      [[join(directory, "outputs", first.project_id), ["output"]], [workspacePath, ["input"]]]);
    assert.equal(projects.query.outputDirectory(first.project_id).canonical_path, join(directory, "outputs", first.project_id));
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
function withTwoProjects(run: (env: { db: SqliteDatabase; projects: ProjectsModule; first: string; second: string; link: (projectId: string, path: string) => string; output: (projectId: string) => string }) => void): void {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-projects-module-")));
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
    const link = (projectId: string, path: string) => {
      mkdirSync(join(directory, path), { recursive: true });
      return projects.commands.addWorkspaceProject({
        canonical_path: join(directory, path), project_id: projectId, actor_id: "user-1", user_confirmed: true,
      }).workspace_id;
    };
    const output = (projectId: string) => projects.query.outputDirectory(projectId).workspace_id;
    run({ db, projects, first: ids[0]!, second: ids[1]!, link, output });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
const rows = (db: SqliteDatabase, table: "workspaces" | "workspace_project_memberships"): number =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

test("RAC-2453 deleting a project's memberships removes the directory records that no project belongs to any more", () => {
  withTwoProjects(({ db, projects, first, second, link, output }) => {
    link(first, "alone");
    // Each project also has its default output directory: one row and one membership of its own (SSC-20).
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [3, 3]);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2, "the count is still the memberships removed: the folder and the default output");
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [1, 1]);
    assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces").all(), [{ workspace_id: output(second) }]);
  });
});

test("RAC-2454 a directory two projects share stays, with the other project's membership, until the last one goes", () => {
  withTwoProjects(({ db, projects, first, second, link }) => {
    const shared = link(first, "shared");
    assert.equal(link(second, "shared"), shared);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2, "the shared folder and the first project's default output");
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [2, 2]);
    assert.deepEqual(projects.query.workspaceProjectSelections(shared).map(selection => selection.project_id), [second]);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(second), 2);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [0, 0]);
  });
});

test("RAC-2455 of a project's two directories, the one only it belongs to goes and the shared one stays", () => {
  withTwoProjects(({ db, projects, first, second, link, output }) => {
    const alone = link(first, "alone"), shared = link(first, "shared");
    link(second, "shared");
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 3, "two folders and the default output");
    assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id").all(),
      [shared, output(second)].sort().map(workspace_id => ({ workspace_id })));
    assert.notEqual(alone, shared);
  });
});

test("RAC-2456 a deletion that fails after the memberships go puts the directory records back, and records this deletion did not empty are not touched", () => {
  withTwoProjects(({ db, projects, first, second, link, output }) => {
    link(first, "alone");
    // A directory with no member at all was there before this deletion: it is not this deletion's to remove.
    db.prepare("INSERT INTO workspaces (workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at) VALUES ('stale', '/stale', 0, 'stale', 'x', 'x')").run();
    assert.throws(() => projects.lifecycle.transaction(() => {
      assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2);
      assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id").all(),
        ["stale", output(second)].sort().map(workspace_id => ({ workspace_id })));
      throw new Error("the deletion failed after the directory step");
    }), /deletion failed/u);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [4, 3], "rolled back: the directory, the default output and their memberships are back");
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(second), 1, "a project with no folder of its own removes only its default output");
    assert.equal(rows(db, "workspaces"), 3);
    assert.ok(db.prepare("SELECT 1 FROM workspaces WHERE workspace_id = 'stale'").get(), "the record this deletion did not empty stays");
  });
});

/** Two projects a non-person registered, and real folders under one temporary root: a link needs a folder that resolves. */
function withSourceProjects(run: (env: { db: SqliteDatabase; projects: ProjectsModule; first: string; second: string; folder: (name: string) => string }) => void): void {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-directory-source-")));
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
    const folder = (name: string) => { const path = join(directory, "folders", name); mkdirSync(path, { recursive: true }); return path; };
    run({ db, projects, first: ids[0]!, second: ids[1]!, folder });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
const personLinks = (projects: ProjectsModule, projectId: string, canonicalPath: string) => projects.commands.addWorkspaceProject({
  canonical_path: canonicalPath, project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true }).workspace_id;
const toolBinds = (projects: ProjectsModule, projectId: string, canonicalPath: string, actorId: string, realpathVerified = false) =>
  projects.lifecycle.upsertWorkspaceMembership({ canonical_path: canonicalPath, realpath_verified: realpathVerified }, projectId, actorId);
const directoryAt = (projects: ProjectsModule, canonicalPath: string) =>
  projects.query.listWorkspaceDirectory().find(record => record.canonical_path === canonicalPath);
const boundBy = (db: SqliteDatabase, workspaceId: string, projectId: string) =>
  (db.prepare("SELECT bound_by FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?").get(workspaceId, projectId) as { bound_by: string } | undefined)?.bound_by;
const setBoundBy = (db: SqliteDatabase, workspaceId: string, projectId: string, value: string | null) =>
  db.prepare("UPDATE workspace_project_memberships SET bound_by = ? WHERE workspace_id = ? AND project_id = ?").run(value, workspaceId, projectId);
const storedVerified = (db: SqliteDatabase, workspaceId: string) =>
  (db.prepare("SELECT realpath_verified FROM workspaces WHERE workspace_id = ?").get(workspaceId) as { realpath_verified: number }).realpath_verified;
const eventActors = (db: SqliteDatabase, projectId: string, type: string) =>
  (db.prepare("SELECT actor_id FROM project_events WHERE project_id = ? AND type = ? ORDER BY created_at, event_id").all(projectId, type) as { actor_id: string }[]).map(row => row.actor_id);
const changeDirectories = (projects: ProjectsModule, projectId: string, change: Parameters<ProjectsModule["commands"]["changeDirectories"]>[0]["change"]) =>
  projects.commands.changeDirectories({ project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, change, expected_revision: projects.query.projectDirectories(projectId).revision });

test("SRB-14 only the person's id makes a relation the person's: a tool's, an empty value and another actor's are refused", () => {
  withSourceProjects(({ db, projects, first, second, folder }) => {
    const path = folder("shared");
    const shared = personLinks(projects, first, path);
    assert.deepEqual(directoryAt(projects, path)?.person_project_ids, [first]);
    // A tool binding that carries the person's id, as a terminal the person opened does, is still a tool's.
    toolBinds(projects, second, path, LOCAL_PERSON_ACTOR_ID);
    assert.equal(boundBy(db, shared, second), `binding:${LOCAL_PERSON_ACTOR_ID}`);
    assert.deepEqual(directoryAt(projects, path)?.project_ids.slice().sort(), [first, second].sort());
    assert.deepEqual(directoryAt(projects, path)?.person_project_ids, [first]);
    // An allow-list, not "no prefix means the person": nothing but the exact id counts, whoever or whatever wrote the row.
    for (const value of ["", " ", `${LOCAL_PERSON_ACTOR_ID} `, LOCAL_PERSON_ACTOR_ID.toUpperCase(), `binding:${LOCAL_PERSON_ACTOR_ID}`, "codex:session-1", "user-1", "molis-work-upgrade"]) {
      setBoundBy(db, shared, first, value);
      assert.deepEqual(directoryAt(projects, path)?.person_project_ids, [], JSON.stringify(value));
    }
    assert.throws(() => setBoundBy(db, shared, first, null), /NOT NULL/u, "a row cannot be without a value at all");
    // The relations themselves stay: only who made them is judged.
    assert.deepEqual(directoryAt(projects, path)?.project_ids.slice().sort(), [first, second].sort());
  });
});

test("SRB-14 both roles are judged the same: an output the person chose is theirs, a project's default output follows who registered it", () => {
  withSourceProjects(({ projects, first, folder }) => {
    // The default output was written when a non-person registered the project: not the person's.
    const defaultOutput = projects.query.outputDirectory(first);
    assert.deepEqual(projects.query.listWorkspaceDirectory().find(record => record.workspace_id === defaultOutput.workspace_id)?.person_project_ids, []);
    // The person choosing a new folder as the output links it as theirs: a relation in the output role alone counts like an input.
    const path = folder("chosen-output");
    changeDirectories(projects, first, { kind: "set_output", target: { workspace_path: path } });
    assert.deepEqual(projects.query.projectDirectories(first).directories.find(item => item.canonical_path === path)?.roles, ["output"]);
    assert.deepEqual(directoryAt(projects, path)?.person_project_ids, [first]);
  });
});

test("SRB-14 the mark is Projects' own: events keep the plain actor, and an empty actor is refused rather than hidden behind the prefix", () => {
  withSourceProjects(({ db, projects, first, folder }) => {
    const path = folder("events");
    toolBinds(projects, first, path, "codex:session-1");
    assert.equal(boundBy(db, projects.query.workspaceIdAt(path)!, first), "binding:codex:session-1");
    assert.deepEqual(eventActors(db, first, "project.workspace_member_bound"), ["codex:session-1"]);
    const before = (db.prepare("SELECT COUNT(*) AS n FROM workspace_project_memberships").get() as { n: number }).n;
    assert.throws(() => toolBinds(projects, first, folder("blank"), "  "), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "catalog.context.user_confirmation_required");
      return true;
    });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM workspace_project_memberships").get() as { n: number }).n, before);
  });
});

test("SRB-14 writing a relation again never takes it from the person; the person linking it again makes it theirs", () => {
  withSourceProjects(({ db, projects, first, second, folder }) => {
    const keptPath = folder("kept");
    const kept = personLinks(projects, first, keptPath);
    toolBinds(projects, first, keptPath, "codex:session-1");
    assert.equal(boundBy(db, kept, first), LOCAL_PERSON_ACTOR_ID, "a tool does not overwrite the person's value");
    projects.commands.addWorkspaceProject({ canonical_path: keptPath, project_id: first, actor_id: "user-1", user_confirmed: true });
    assert.equal(boundBy(db, kept, first), LOCAL_PERSON_ACTOR_ID, "nor does any other actor");

    // A tool's relation, in the current mark and in the shape older rows have, becomes the person's once they link it.
    const broughtPath = folder("brought");
    toolBinds(projects, second, broughtPath, "codex:session-1");
    const brought = projects.query.workspaceIdAt(broughtPath)!;
    assert.deepEqual(directoryAt(projects, broughtPath)?.person_project_ids, []);
    toolBinds(projects, second, broughtPath, "claude:session-2");
    assert.equal(boundBy(db, brought, second), "binding:codex:session-1", "an existing link is left as it is by a tool");
    const relationOf = () => db.prepare("SELECT membership_id, role_input, role_output, created_at, updated_at FROM workspace_project_memberships WHERE workspace_id = ? AND project_id = ?").get(brought, second);
    const beforeClaim = relationOf();
    personLinks(projects, second, broughtPath);
    assert.deepEqual(directoryAt(projects, broughtPath)?.person_project_ids, [second]);
    assert.deepEqual(relationOf(), beforeClaim, "claiming changes who made it and nothing else: the id, roles and times stay");
    const olderPath = folder("older");
    toolBinds(projects, first, olderPath, "codex:session-1");
    setBoundBy(db, projects.query.workspaceIdAt(olderPath)!, first, "codex:session-1");
    changeDirectories(projects, first, { kind: "add_input", workspace_path: olderPath });
    assert.deepEqual(directoryAt(projects, olderPath)?.person_project_ids, [first], "the person's add_input claims it too");
    const pickedPath = folder("picked");
    toolBinds(projects, first, pickedPath, "codex:session-1");
    changeDirectories(projects, first, { kind: "set_output", target: { workspace_id: projects.query.workspaceIdAt(pickedPath)! } });
    assert.deepEqual(directoryAt(projects, pickedPath)?.person_project_ids, [first], "so does the person picking it as the output");
  });
});

test("SRB-16 a tool's unlink is refused on the person's relation and takes back only what a tool brought in", () => {
  withSourceProjects(({ db, projects, first, second, folder }) => {
    const ownPath = folder("own");
    const own = personLinks(projects, first, ownPath);
    for (const actor of ["codex:session-1", LOCAL_PERSON_ACTOR_ID]) {
      assert.equal(projects.lifecycle.unlinkWorkspaceMembership(own, first, actor), "person_kept", actor);
    }
    assert.deepEqual(directoryAt(projects, ownPath)?.person_project_ids, [first]);
    assert.deepEqual(eventActors(db, first, "project.workspace_unlinked"), [], "nothing happened, so nothing is recorded");
    // The output stays for its own reason, whoever made it (SSC-17).
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(projects.query.outputDirectory(first).workspace_id, first, "codex:session-1"), "output_kept");

    const broughtPath = folder("brought");
    toolBinds(projects, second, broughtPath, "codex:session-1");
    const brought = projects.query.workspaceIdAt(broughtPath)!;
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(brought, second, "claude:session-2"), "unlinked");
    assert.equal(directoryAt(projects, broughtPath), undefined, "the record goes with its last member");

    // The same allow-list: a row that is not the person's by exact id is one a tool can take back.
    const olderPath = folder("older");
    toolBinds(projects, second, olderPath, "codex:session-1");
    const older = projects.query.workspaceIdAt(olderPath)!;
    setBoundBy(db, older, second, "codex:session-1");
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(older, second, "codex:session-1"), "unlinked");
    assert.equal(projects.lifecycle.unlinkWorkspaceMembership(older, second, "codex:session-1"), "absent", "nothing left to remove");

    // Control: the person's own command does remove it.
    changeDirectories(projects, first, { kind: "remove_input", workspace_id: own });
    assert.equal(directoryAt(projects, ownPath), undefined);
  });
});

// 用户 2026-11-09 定 A：工具绑定只在新建目录行时写 realpath_verified，已有的行不改，本人的和工具的都一样。
test("SRB-16 a tool binding never changes whether an existing folder is verified (用户 2026-11-09 定 A)", () => {
  withSourceProjects(({ db, projects, first, second, folder }) => {
    // (1) The person's folder was verified; it is gone when a tool binds there, claiming it verified or not: it stays verified, nothing is written.
    const gonePath = folder("gone");
    const gone = personLinks(projects, first, gonePath);
    assert.equal(storedVerified(db, gone), 1);
    rmSync(gonePath, { recursive: true });
    const memberships = () => (db.prepare("SELECT COUNT(*) AS n FROM workspace_project_memberships").get() as { n: number }).n;
    const before = memberships();
    for (const claimed of [false, true]) {
      toolBinds(projects, first, gonePath, "codex:session-1", claimed);
      toolBinds(projects, second, gonePath, "codex:session-1", claimed);
    }
    assert.equal(storedVerified(db, gone), 1);
    assert.equal(memberships(), before);
    assert.equal(boundBy(db, gone, first), LOCAL_PERSON_ACTOR_ID);
    // (2) An existing row that is not verified (as one an older catalog left) is not reported verified by a tool, for its own project or a new one.
    const unverifiedPath = folder("unverified");
    const unverified = personLinks(projects, first, unverifiedPath);
    db.prepare("UPDATE workspaces SET realpath_verified = 0 WHERE workspace_id = ?").run(unverified);
    for (const projectId of [first, second]) toolBinds(projects, projectId, unverifiedPath, "codex:session-1", true);
    assert.equal(storedVerified(db, unverified), 0);
    assert.equal(directoryAt(projects, unverifiedPath)?.realpath_verified, false);
    assert.deepEqual(directoryAt(projects, unverifiedPath)?.project_ids.slice().sort(), [first, second].sort(), "the new link is written, the row is not");
    // Control: a folder no row names yet gets a row a tool may write, verified because it resolves.
    const freshPath = folder("fresh");
    toolBinds(projects, first, freshPath, "codex:session-1");
    assert.equal(storedVerified(db, projects.query.workspaceIdAt(freshPath)!), 1);
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
