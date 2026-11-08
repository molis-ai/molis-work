import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";

import type { DirectoryChange, ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { resolveWorkspaceFileSubject, resolveWorkspaceId, workspaceFileSubjectId } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import {
  createProjectsSchema,
  isProjectOutputWorkspaceId,
  prepareProjectOutputDirectory,
  projectOutputHash,
  projectOutputWorkspaceId,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
import { CATALOG_UPGRADES, createGitWorktreePort, hostWriterId } from "@molis-ai/molis-work-app-local-host";
import { openTestSqlite, type SqliteDatabase } from "@molis-ai/molis-work-test-kit/sqlite";

/** A Home in a temporary directory, with `projects/` and an `outputs/` that is not made yet, and folders outside it to link. */
interface Env { home: string; outputs: string; outside: string; db: SqliteDatabase; projects: ProjectsModule; create(name: string): string }

function withHome(run: (env: Env) => void, { sameMillisecond = false } = {}): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-directories-")));
  const home = join(root, "home"), outside = join(root, "outside");
  mkdirSync(join(home, "projects"), { recursive: true });
  mkdirSync(outside);
  const db = openTestSqlite(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    createProjectsSchema(db);
    const projects = moduleOver(db, home, sameMillisecond);
    const create = (name: string) => {
      const record = projects.lifecycle.prepareRecord({ display_name: name, data_class: "user" });
      projects.lifecycle.register(record, "project.created", "user-1");
      return record.project_id;
    };
    run({ home, outputs: join(home, "outputs"), outside, db, projects, create });
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * `sameMillisecond`: every event at one instant, and each id sorting before the one made earlier, so that order by time and then by id
 * would put a later event first.
 */
function moduleOver(db: SqliteDatabase, home: string, sameMillisecond = false): ProjectsModule {
  let sequence = 0;
  return new ProjectsModule({
    db,
    projects_directory: join(home, "projects"),
    outputs_directory: join(home, "outputs"),
    root_home_directory: home,
    plugins: { has: () => false, companions: () => [] },
    now: () => sameMillisecond ? "2026-11-08T00:00:00.000Z" : `2026-11-08T00:00:${String(sequence % 60).padStart(2, "0")}.000Z`,
    id: prefix => sameMillisecond ? `${prefix}-${String(9999 - ++sequence).padStart(4, "0")}` : `${prefix}-${home.length}-${++sequence}`,
  });
}

function folder(env: Env, name: string): string {
  const at = join(env.outside, name);
  mkdirSync(at, { recursive: true });
  return at;
}

function change(env: Env, projectId: string, next: DirectoryChange): ProjectDirectories {
  const current = env.projects.query.projectDirectories(projectId);
  return env.projects.commands.changeDirectories({ project_id: projectId, actor_id: "user-1", change: next, expected_revision: current.revision });
}

function refusedWith(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ActionError, String(error));
    assert.equal(error.code, code);
    return true;
  };
}

const storedRows = (db: SqliteDatabase) => db.prepare("SELECT workspace_id, canonical_path, realpath_verified FROM workspaces ORDER BY workspace_id").all() as Array<{ workspace_id: string; canonical_path: string; realpath_verified: number }>;

test("SSC-20 a new project has its default output directory: no path in the catalog, the folder under this Home's outputs, ok before it is made", () => {
  withHome(env => {
    const id = env.create("甲");
    const directories = env.projects.query.projectDirectories(id);
    assert.equal(directories.directories.length, 1);
    const [output] = directories.directories;
    assert.deepEqual(output!.roles, ["output"]);
    assert.equal(output!.canonical_path, join(env.outputs, id));
    assert.equal(output!.display_name, "默认输出目录");
    assert.equal(output!.state, "ok", "a default output directory that is not made yet is not missing");
    assert.equal(existsSync(env.outputs), false, "registering a project makes no folder");
    const firstEvent = (env.db.prepare("SELECT event_id FROM project_events WHERE project_id = ? ORDER BY created_at, event_id LIMIT 1").get(id) as { event_id: string }).event_id;
    assert.equal(output!.workspace_id, projectOutputWorkspaceId(projectOutputHash(id, firstEvent)));
    assert.ok(isProjectOutputWorkspaceId(output!.workspace_id));
    assert.deepEqual(storedRows(env.db), [{ workspace_id: output!.workspace_id, canonical_path: `project-output:${id}`, realpath_verified: 0 }]);
    assert.deepEqual(env.projects.query.outputDirectory(id).canonical_path, join(env.outputs, id));

    // The same catalog read from a Home copied elsewhere answers the new place; nothing in the catalog named the old one.
    const copied = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-directories-copy-")));
    try {
      const elsewhere = moduleOver(env.db, copied);
      assert.equal(elsewhere.query.outputDirectory(id).canonical_path, join(copied, "outputs", id));
    } finally {
      rmSync(copied, { recursive: true, force: true });
    }
  });
});

test("SSC-20 a project id with a colon still has its own default output directory", () => {
  withHome(env => {
    const record = env.projects.lifecycle.prepareRecord({ project_id: "personal:notes", display_name: "带冒号", data_class: "user" });
    env.projects.lifecycle.register(record, "project.created", "user-1");
    assert.equal(env.projects.query.outputDirectory(record.project_id).canonical_path, join(env.outputs, record.project_id));
  });
});

test("SSC-22 moving the output to a folder and back to the default finds the same row again, without the folder being made", () => {
  withHome(env => {
    const id = env.create("甲");
    const defaultId = env.projects.query.outputDirectory(id).workspace_id;
    const mine = folder(env, "mine");
    const moved = change(env, id, { kind: "set_output", target: { workspace_path: mine } });
    assert.deepEqual(moved.directories.map(item => [item.canonical_path, item.roles]), [[mine, ["output"]]]);
    assert.equal(storedRows(env.db).some(row => row.workspace_id === defaultId), false, "the default row went with its last link; the files would stay");
    const back = change(env, id, { kind: "set_output", target: { default_output: true } });
    assert.deepEqual(back.directories.map(item => [item.workspace_id, item.roles]), [[defaultId, ["output"]]]);
    assert.equal(existsSync(env.outputs), false);
  });
});

test("SSC-22 the default output keeps the id it was written with when later events share its first event's millisecond", () => {
  withHome(env => {
    const id = env.create("甲");
    const written = env.projects.query.outputDirectory(id).workspace_id;
    const mine = folder(env, "mine");
    change(env, id, { kind: "add_input", workspace_path: mine });
    assert.equal(env.projects.query.outputDirectory(id).workspace_id, written, "an event at the same instant does not change which came first");
    const again = change(env, id, { kind: "set_output", target: { default_output: true } });
    assert.equal(again.directories.find(item => item.roles.includes("output"))?.workspace_id, written, "setting the default it already has is the same row, not a second one");
    change(env, id, { kind: "set_output", target: { workspace_path: mine } });
    const back = change(env, id, { kind: "set_output", target: { default_output: true } });
    assert.equal(back.directories.find(item => item.roles.includes("output"))?.workspace_id, written, "and back from another folder, the same id again");
    assert.equal(storedRows(env.db).filter(row => row.canonical_path === `project-output:${id}`).length, 1);
  }, { sameMillisecond: true });
});

test("SSC-22 path to row: the project's own default place is its row, another project's or anywhere else in outputs is refused", () => {
  withHome(env => {
    const first = env.create("甲"), second = env.create("乙");
    const own = env.projects.query.outputDirectory(first).workspace_id;
    const added = change(env, first, { kind: "add_input", workspace_path: join(env.outputs, first) });
    assert.deepEqual(added.directories.map(item => [item.workspace_id, item.roles]), [[own, ["input", "output"]]], "the same row, now an input too");
    assert.throws(() => change(env, first, { kind: "add_input", workspace_path: join(env.outputs, second) }), refusedWith("projects.directory_duplicate"));
    assert.throws(() => change(env, first, { kind: "set_output", target: { workspace_path: join(env.outputs, second) } }), refusedWith("projects.directory_duplicate"));
    assert.throws(() => change(env, first, { kind: "add_input", workspace_path: join(env.outputs, first, "sub") }), refusedWith("projects.directory_duplicate"));
    assert.throws(() => change(env, first, { kind: "add_input", workspace_path: env.outputs }), refusedWith("projects.directory_duplicate"));

    // A different case of the Home's path still lands on the same row (APFS and NTFS fold case; realpath gives the stored spelling).
    mkdirSync(join(env.outputs, first), { recursive: true });
    const upper = join(env.home.toUpperCase(), "outputs", first);
    if (existsSync(upper)) {
      const again = change(env, first, { kind: "add_input", workspace_path: upper });
      assert.equal(again.directories.length, 1);
    }
  });
});

test("SSC-22 a session bound in the default output directory or under it writes no row with a path", () => {
  withHome(env => {
    const first = env.create("甲"), second = env.create("乙");
    const before = storedRows(env.db);
    mkdirSync(join(env.outputs, first, "sub"), { recursive: true });
    env.projects.lifecycle.upsertWorkspaceMembership({ canonical_path: join(env.outputs, first), realpath_verified: true }, first, "user-1");
    env.projects.lifecycle.upsertWorkspaceMembership({ canonical_path: join(env.outputs, first, "sub"), realpath_verified: true }, first, "user-1");
    env.projects.lifecycle.upsertWorkspaceMembership({ canonical_path: join(env.outputs, second), realpath_verified: true }, first, "user-1");
    assert.deepEqual(storedRows(env.db), before, "still one row each, and neither names an absolute path");
    assert.equal(storedRows(env.db).every(row => row.canonical_path.startsWith("project-output:")), true);
    // A path read back from a row and passed in again leaves the row as it was.
    const output = env.projects.query.outputDirectory(first);
    env.projects.lifecycle.upsertWorkspaceMembership({ canonical_path: output.canonical_path, realpath_verified: true }, first, "user-1");
    assert.deepEqual(storedRows(env.db), before);
  });
});

test("SSC-22 a path names its folder's row: an input by its path, a default output by its place in outputs, nothing else in outputs or unlinked", () => {
  withHome(env => {
    const first = env.create("甲"), second = env.create("乙"), mine = folder(env, "mine");
    const added = change(env, first, { kind: "add_input", workspace_path: mine }).directories.find(item => item.canonical_path === mine)!;
    assert.equal(env.projects.query.workspaceIdAt(mine), added.workspace_id, "the row the folder was given, not one computed from its path");
    assert.equal(env.projects.query.workspaceIdAt(join(env.outputs, first)), env.projects.query.outputDirectory(first).workspace_id);
    assert.equal(env.projects.query.workspaceIdAt(join(env.outputs, second)), env.projects.query.outputDirectory(second).workspace_id);
    assert.equal(env.projects.query.workspaceIdAt(join(env.outputs, first, "sub")), null);
    assert.equal(env.projects.query.workspaceIdAt(env.outputs), null);
    assert.equal(env.projects.query.workspaceIdAt(folder(env, "unlinked")), null);
    // A runtime context's folder that stops offering the project: an input link goes; the project's output stays (SSC-17).
    assert.equal(env.projects.lifecycle.unlinkWorkspaceMembership(env.projects.query.outputDirectory(first).workspace_id, first, "user-1"), false);
    assert.equal(env.projects.lifecycle.unlinkWorkspaceMembership(added.workspace_id, first, "user-1"), true);
    assert.deepEqual(env.projects.query.projectDirectories(first).directories.map(item => [item.workspace_id, item.roles]),
      [[env.projects.query.outputDirectory(first).workspace_id, ["output"]]]);
  });
});

test("SSC-03 a folder is linked once, may be input and output at once, and a change from an old revision is refused", () => {
  withHome(env => {
    const first = env.create("甲"), second = env.create("乙");
    const shared = folder(env, "shared");
    const one = change(env, first, { kind: "add_input", workspace_path: shared });
    const two = change(env, second, { kind: "add_input", workspace_path: shared });
    const sharedId = one.directories.find(item => item.canonical_path === shared)!.workspace_id;
    assert.equal(two.directories.find(item => item.canonical_path === shared)!.workspace_id, sharedId, "one row for the folder");
    const again = change(env, first, { kind: "add_input", workspace_path: shared });
    assert.equal(again.directories.filter(item => item.canonical_path === shared).length, 1, "adding it again links it once");
    assert.equal(Number((env.db.prepare("SELECT COUNT(*) AS n FROM workspace_project_memberships WHERE workspace_id = ?").get(sharedId) as { n: number }).n), 2);

    const both = change(env, first, { kind: "set_output", target: { workspace_id: sharedId } });
    assert.deepEqual(both.directories.map(item => item.roles), [["input", "output"]], "the old default went; the folder is input and output");
    assert.equal(both.directories.filter(item => item.roles.includes("output")).length, 1);

    const stale = env.projects.query.projectDirectories(first).revision;
    change(env, first, { kind: "add_input", workspace_path: folder(env, "other") });
    assert.throws(() => env.projects.commands.changeDirectories({ project_id: first, actor_id: "user-1", change: { kind: "remove_input", workspace_id: sharedId }, expected_revision: stale }),
      refusedWith("actions.conflict"));
    assert.throws(() => env.db.prepare("UPDATE workspace_project_memberships SET role_output = 1 WHERE project_id = ?").run(first), /UNIQUE/u, "one output per project, in the catalog itself");
  });
});

test("SSC-03 removing an input: a folder that is also the output stays as the output, one that is only an input goes", () => {
  withHome(env => {
    const id = env.create("甲");
    const mine = folder(env, "mine"), other = folder(env, "other");
    change(env, id, { kind: "set_output", target: { workspace_path: mine } });
    const mineId = change(env, id, { kind: "add_input", workspace_path: mine }).directories.find(item => item.canonical_path === mine)!.workspace_id;
    const otherId = change(env, id, { kind: "add_input", workspace_path: other }).directories.find(item => item.canonical_path === other)!.workspace_id;
    const kept = change(env, id, { kind: "remove_input", workspace_id: mineId });
    assert.deepEqual(kept.directories.find(item => item.workspace_id === mineId)!.roles, ["output"]);
    const gone = change(env, id, { kind: "remove_input", workspace_id: otherId });
    assert.equal(gone.directories.some(item => item.workspace_id === otherId), false);
    assert.equal(storedRows(env.db).some(row => row.workspace_id === otherId), false, "no project left, so the row went too");
    assert.throws(() => change(env, id, { kind: "remove_input", workspace_id: mineId }), refusedWith("catalog.context.workspace_membership_not_found"));
  });
});

test("SSC-16 repair only a folder that is gone: the id stays for every project, a path that is another row or does not resolve is refused", () => {
  withHome(env => {
    const first = env.create("甲"), second = env.create("乙");
    const old = folder(env, "old"), taken = folder(env, "taken");
    const oldId = change(env, first, { kind: "add_input", workspace_path: old }).directories.find(item => item.canonical_path === old)!.workspace_id;
    change(env, second, { kind: "add_input", workspace_path: old });
    change(env, second, { kind: "add_input", workspace_path: taken });
    assert.throws(() => change(env, first, { kind: "repair", workspace_id: oldId, workspace_path: folder(env, "new") }), refusedWith("actions.input_invalid"), "still where it was");
    assert.throws(() => change(env, first, { kind: "add_input", workspace_path: join(env.outside, "never") }), refusedWith("projects.directory_missing"));

    renameSync(old, join(env.outside, "moved"));
    assert.equal(env.projects.query.projectDirectories(first).directories.find(item => item.workspace_id === oldId)!.state, "missing");
    assert.throws(() => change(env, first, { kind: "repair", workspace_id: oldId, workspace_path: taken }), refusedWith("projects.directory_duplicate"), "never merges two rows");
    assert.throws(() => change(env, first, { kind: "repair", workspace_id: oldId, workspace_path: join(env.outside, "never") }), refusedWith("projects.directory_missing"));
    assert.throws(() => change(env, first, { kind: "repair", workspace_id: oldId, workspace_path: join(env.outputs, first) }), refusedWith("projects.directory_duplicate"));
    const repaired = change(env, first, { kind: "repair", workspace_id: oldId, workspace_path: join(env.outside, "moved") });
    assert.equal(repaired.directories.find(item => item.workspace_id === oldId)!.canonical_path, join(env.outside, "moved"));
    assert.equal(env.projects.query.projectDirectories(second).directories.find(item => item.workspace_id === oldId)!.state, "ok", "the other project follows");
  });
});

test("SSC-26 a folder named for another device's directory: map, change, unmap, and it goes with the folder; only this project", () => {
  withHome(env => {
    const first = env.create("甲"), second = env.create("乙");
    const mine = folder(env, "mine"), other = folder(env, "other");
    const mapped = change(env, first, { kind: "map_source", source_workspace_id: "workspace-from-laptop", target: { workspace_path: mine } });
    const mineId = mapped.directories.find(item => item.canonical_path === mine)!.workspace_id;
    assert.deepEqual(mapped.source_links, [{ source_workspace_id: "workspace-from-laptop", workspace_id: mineId }]);
    assert.deepEqual(env.projects.query.projectDirectories(second).source_links, [], "only this project");
    const changed = change(env, first, { kind: "map_source", source_workspace_id: "workspace-from-laptop", target: { workspace_path: other } });
    assert.equal(changed.source_links.length, 1);
    assert.notEqual(changed.source_links[0]!.workspace_id, mineId);
    assert.deepEqual(change(env, first, { kind: "unmap_source", source_workspace_id: "workspace-from-laptop" }).source_links, []);

    change(env, first, { kind: "map_source", source_workspace_id: "workspace-from-laptop", target: { workspace_id: mineId } });
    assert.deepEqual(change(env, first, { kind: "remove_input", workspace_id: mineId }).source_links, [], "the folder went, and the link with it");
    const toDefault = change(env, first, { kind: "map_source", source_workspace_id: "workspace-output-from-laptop", target: { default_output: true } });
    assert.deepEqual(toDefault.source_links.map(link => link.workspace_id), [env.projects.query.outputDirectory(first).workspace_id]);
  });
});

test("SSC-26 one rule names the folder an id stands for here, for a reference and for a page alike: its own, the one named for it, or none", () => {
  const directories = { directories: [{ workspace_id: "here" }, { workspace_id: "named" }],
    source_links: [{ source_workspace_id: "laptop", workspace_id: "named" }, { source_workspace_id: "gone", workspace_id: "removed" }] };
  assert.equal(resolveWorkspaceId("here", directories), "here");
  assert.equal(resolveWorkspaceId("laptop", directories), "named");
  assert.equal(resolveWorkspaceId("gone", directories), null, "a link to a folder no longer in the project names nothing");
  assert.equal(resolveWorkspaceId("elsewhere", directories), null);
  // A reference reads through the same rule.
  assert.deepEqual(resolveWorkspaceFileSubject({ id: workspaceFileSubjectId("laptop", ["a", "b.md"]) }, directories), { workspace_id: "named", path: ["a", "b.md"] });
  assert.equal(resolveWorkspaceFileSubject({ id: workspaceFileSubjectId("gone", ["b.md"]) }, directories), null);
});

test("SSC-27 a folder for another device's directory may not be in the Home, hold it, be this project's own directory, or not resolve", () => {
  withHome(env => {
    const id = env.create("甲");
    const own = env.projects.query.outputDirectory(id).workspace_id;
    assert.throws(() => change(env, id, { kind: "map_source", source_workspace_id: own, target: { workspace_path: folder(env, "a") } }), refusedWith("projects.directory_duplicate"));
    const inHome = join(env.home, "notes");
    mkdirSync(inHome);
    assert.throws(() => change(env, id, { kind: "map_source", source_workspace_id: "workspace-x", target: { workspace_path: inHome } }), refusedWith("actions.input_invalid"));
    assert.throws(() => change(env, id, { kind: "map_source", source_workspace_id: "workspace-x", target: { workspace_path: join(env.home, "..") } }), refusedWith("actions.input_invalid"), "a folder that holds the Home");
    assert.throws(() => change(env, id, { kind: "map_source", source_workspace_id: "workspace-x", target: { workspace_path: join(env.outside, "never") } }), refusedWith("projects.directory_missing"));
    const through = join(env.outside, "link-to-home");
    symlinkSync(env.home, through);
    assert.throws(() => change(env, id, { kind: "map_source", source_workspace_id: "workspace-x", target: { workspace_path: through } }), refusedWith("actions.input_invalid"), "through a symbolic link");
    // A folder that is already an input here and lies inside the Home is refused too.
    const linked = change(env, id, { kind: "add_input", workspace_path: inHome }).directories.find(item => item.canonical_path === inHome)!.workspace_id;
    assert.throws(() => change(env, id, { kind: "map_source", source_workspace_id: "workspace-x", target: { workspace_id: linked } }), refusedWith("actions.input_invalid"));
    // A folder with a link may not be repaired into the Home either.
    const away = folder(env, "away");
    const awayId = change(env, id, { kind: "map_source", source_workspace_id: "workspace-y", target: { workspace_path: away } }).source_links[0]!.workspace_id;
    rmSync(away, { recursive: true });
    assert.throws(() => change(env, id, { kind: "repair", workspace_id: awayId, workspace_path: inHome }), refusedWith("projects.directory_duplicate"), "inHome is already a row");
    const freshInHome = join(env.home, "fresh");
    mkdirSync(freshInHome);
    assert.throws(() => change(env, id, { kind: "repair", workspace_id: awayId, workspace_path: freshInHome }), refusedWith("actions.input_invalid"));
  });
});

test("SSC-21 a default output directory under a symbolic link, or with an id that is not one segment, is refused before anything is made", () => {
  withHome(env => {
    const id = env.create("甲");
    const elsewhere = folder(env, "elsewhere");
    symlinkSync(elsewhere, env.outputs);
    assert.throws(() => prepareProjectOutputDirectory(env.outputs, id, "read"), refusedWith("catalog.project_storage_invalid"));
    assert.throws(() => prepareProjectOutputDirectory(env.outputs, id, "write"), refusedWith("catalog.project_storage_invalid"));
    assert.equal(existsSync(join(elsewhere, id)), false, "nothing made through the link");
    rmSync(env.outputs);
    mkdirSync(env.outputs);
    symlinkSync(elsewhere, join(env.outputs, id));
    assert.throws(() => env.projects.lifecycle.prepareWorkspaceDirectory(env.projects.query.outputDirectory(id).workspace_id, "write"), refusedWith("catalog.project_storage_invalid"));
    assert.throws(() => prepareProjectOutputDirectory(env.outputs, "../../x", "write"), refusedWith("catalog.project_storage_invalid"));
    env.db.prepare("UPDATE workspaces SET canonical_path = 'project-output:../../x'").run();
    assert.throws(() => env.projects.query.projectDirectories(id), refusedWith("catalog.project_storage_invalid"), "a row edited by hand to another project's id");
  });
});

test("SSC-24 the default output directory is made on the first write, and a read before that answers that it is not there", () => {
  withHome(env => {
    const id = env.create("甲");
    const output = env.projects.query.outputDirectory(id).workspace_id;
    assert.deepEqual(env.projects.lifecycle.prepareWorkspaceDirectory(output, "read"), { path: join(env.outputs, id), exists: false });
    assert.equal(existsSync(env.outputs), false);
    assert.deepEqual(env.projects.lifecycle.prepareWorkspaceDirectory(output, "write"), { path: join(env.outputs, id), exists: true });
    assert.equal(existsSync(join(env.outputs, id)), true);
    const mine = folder(env, "mine");
    const mineId = change(env, id, { kind: "add_input", workspace_path: mine }).directories.find(item => item.canonical_path === mine)!.workspace_id;
    assert.deepEqual(env.projects.lifecycle.prepareWorkspaceDirectory(mineId, "read"), { path: mine, exists: true });
    assert.throws(() => env.projects.lifecycle.prepareWorkspaceDirectory("workspace-none", "read"), refusedWith("projects.directory_revoked"));
  });
});

/** The memberships table as catalog version 1 made it (frozen here: version 1 is what Homes in use hold). */
const MEMBERSHIPS_V1_SQL = `
  CREATE TABLE workspace_project_memberships (
    membership_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
    bound_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(workspace_id, project_id)
  );
  CREATE INDEX workspace_project_memberships_project_idx ON workspace_project_memberships(project_id, workspace_id);
  CREATE UNIQUE INDEX workspace_project_memberships_one_default_idx ON workspace_project_memberships(workspace_id) WHERE is_default = 1;
`;

/** A catalog at version 1: one folder for 甲, two for 乙, none for 丙, and 丁 in the recycle bin. */
function catalogV1(eventSuffix: string): SqliteDatabase {
  const db = openTestSqlite(":memory:");
  db.pragma("foreign_keys = ON");
  createProjectsSchema(db);
  db.exec("DROP TABLE workspace_source_links; DROP TABLE workspace_project_memberships;");
  db.exec(MEMBERSHIPS_V1_SQL);
  const at = "2026-10-01T00:00:00.000Z";
  for (const project of ["甲", "乙", "丙", "丁"]) {
    db.prepare("INSERT INTO projects (project_id, display_name, source, data_class, created_at, updated_at) VALUES (?, ?, 'created', 'user', ?, ?)").run(`project-${project}`, project, at, at);
    db.prepare("INSERT INTO project_events (event_id, project_id, type, actor_id, payload_json, created_at) VALUES (?, ?, 'project.created', 'user-1', '{}', ?)").run(`event-${project}-${eventSuffix}`, `project-${project}`, at);
  }
  for (const [workspace, path] of [["workspace-a", "/work/a"], ["workspace-b", "/work/b"], ["workspace-c", "/work/c"]]) {
    db.prepare("INSERT INTO workspaces (workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)").run(workspace, path, workspace, at, at);
  }
  for (const [membership, workspace, project, isDefault] of [["m1", "workspace-a", "project-甲", 1], ["m2", "workspace-b", "project-乙", 1], ["m3", "workspace-c", "project-乙", 0]] as const) {
    db.prepare("INSERT INTO workspace_project_memberships (membership_id, workspace_id, project_id, is_default, bound_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'user-1', ?, ?)").run(membership, workspace, project, isDefault, at, at);
  }
  db.prepare("INSERT INTO project_recycle (project_id, recycled, generation, observed_at) VALUES ('project-丁', 1, 1, ?)").run(at);
  return db;
}

/** The Host's own step from 1 to 2, as the catalog's upgrade run calls it (its transaction, its owner's check). */
function upgrade(db: SqliteDatabase): void {
  const step = CATALOG_UPGRADES.find(entry => entry.from === 1)!;
  assert.equal(step.sql, undefined, "the step is one function, so the writers' links go before the roles are drawn");
  db.transaction(() => {
    step.run!(db);
    step.verify!(db);
  })();
}

const shape = (db: SqliteDatabase) => db.prepare("SELECT type, name, tbl_name FROM sqlite_master WHERE name LIKE 'workspace%' ORDER BY name").all();
const columns = (db: SqliteDatabase, table: string) => db.prepare(`PRAGMA table_info(${table})`).all();
const memberships = (db: SqliteDatabase) => db.prepare("SELECT workspace_id, project_id, role_input, role_output FROM workspace_project_memberships ORDER BY project_id, workspace_id").all();

test("SSC-20 catalog 1 to 2: one folder becomes the output, several stay inputs with a default output, the recycle bin too, no Home taken", () => {
  const db = catalogV1("device-1");
  try {
    upgrade(db);
    const output = (project: string) => projectOutputWorkspaceId(projectOutputHash(`project-${project}`, `event-${project}-device-1`));
    assert.deepEqual(memberships(db), [
      { workspace_id: "workspace-b", project_id: "project-乙", role_input: 1, role_output: 0 },
      { workspace_id: "workspace-c", project_id: "project-乙", role_input: 1, role_output: 0 },
      { workspace_id: output("乙"), project_id: "project-乙", role_input: 0, role_output: 1 },
      { workspace_id: output("丁"), project_id: "project-丁", role_input: 0, role_output: 1 },
      { workspace_id: output("丙"), project_id: "project-丙", role_input: 0, role_output: 1 },
      { workspace_id: "workspace-a", project_id: "project-甲", role_input: 1, role_output: 1 },
    ].sort((left, right) => left.project_id.localeCompare(right.project_id) || left.workspace_id.localeCompare(right.workspace_id)));
    assert.deepEqual(db.prepare("SELECT canonical_path FROM workspaces WHERE workspace_id = ?").get(output("丙")), { canonical_path: "project-output:project-丙" });

    // The structure is what a new catalog makes.
    const fresh = openTestSqlite(":memory:");
    try {
      createProjectsSchema(fresh);
      assert.deepEqual(shape(db), shape(fresh));
      assert.deepEqual(columns(db, "workspace_project_memberships"), columns(fresh, "workspace_project_memberships"));
      assert.deepEqual(columns(db, "workspace_source_links"), columns(fresh, "workspace_source_links"));
    } finally {
      fresh.close();
    }
  } finally {
    db.close();
  }
});

test("SSC-20 the upgrade gives the same ids on the same catalog twice, and other ids where the project's events were drawn on another device", () => {
  const ids = (suffix: string) => {
    const db = catalogV1(suffix);
    try {
      upgrade(db);
      return (db.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id").all() as Array<{ workspace_id: string }>).map(row => row.workspace_id);
    } finally {
      db.close();
    }
  };
  assert.deepEqual(ids("device-1"), ids("device-1"));
  assert.notDeepEqual(ids("device-1"), ids("device-2"));
});

test("SSC-20 a project with no event cannot be given an output, and the step fails as a whole", () => {
  const db = catalogV1("device-1");
  try {
    db.prepare("DELETE FROM project_events WHERE project_id = 'project-丙'").run();
    const before = db.prepare("SELECT * FROM workspace_project_memberships ORDER BY membership_id").all();
    assert.throws(() => upgrade(db), refusedWith("catalog.project_storage_invalid"));
    assert.deepEqual(db.prepare("PRAGMA table_info(workspace_project_memberships)").all().map(row => (row as { name: string }).name).includes("is_default"), true, "rolled back to version 1");
    assert.deepEqual(db.prepare("SELECT * FROM workspace_project_memberships ORDER BY membership_id").all(), before);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS n FROM workspaces").get() as { n: number }).n), 3, "no default output row was left");
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'workspace_source_links'").get(), undefined);
  } finally {
    db.close();
  }
});

/** A repository with a worktree the Host made for a writer, where the Host makes them (`createGitWorktreePort`, `hostWriterId`). */
async function repositoryWithWriter(root: string) {
  const repo = join(root, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, "README.md"), "fixture\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args]);
  git("init", "-q"); git("add", "README.md"); git("commit", "-q", "-m", "fixture");
  const tree = await createGitWorktreePort(repo).create(hostWriterId("operation-1"));
  return { repo, writer: resolve(repo, tree.directory) };
}

/** A version-1 catalog with the given projects (each with an event) and links (`[project, path, is_default]`), one folder row per path. */
function catalogWithLinks(projects: readonly string[], links: ReadonlyArray<readonly [string, string, 0 | 1]>): SqliteDatabase {
  const db = openTestSqlite(":memory:");
  db.pragma("foreign_keys = ON");
  createProjectsSchema(db);
  db.exec("DROP TABLE workspace_source_links; DROP TABLE workspace_project_memberships;");
  db.exec(MEMBERSHIPS_V1_SQL);
  const at = "2026-10-01T00:00:00.000Z";
  for (const project of projects) {
    db.prepare("INSERT INTO projects (project_id, display_name, source, data_class, created_at, updated_at) VALUES (?, ?, 'created', 'user', ?, ?)").run(`project-${project}`, project, at, at);
    db.prepare("INSERT INTO project_events (event_id, project_id, type, actor_id, payload_json, created_at) VALUES (?, ?, 'project.created', 'user-1', '{}', ?)").run(`event-${project}`, `project-${project}`, at);
  }
  const ids = new Map<string, string>();
  links.forEach(([project, path, isDefault], index) => {
    if (!ids.has(path)) {
      ids.set(path, `workspace-${ids.size}`);
      db.prepare("INSERT INTO workspaces (workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)").run(ids.get(path), path, basename(path), at, at);
    }
    db.prepare("INSERT INTO workspace_project_memberships (membership_id, workspace_id, project_id, is_default, bound_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'user-1', ?, ?)")
      .run(`m${index}`, ids.get(path), `project-${project}`, isDefault, at, at);
  });
  return db;
}

const linkedPaths = (db: SqliteDatabase, project: string) => (db.prepare(`SELECT workspaces.canonical_path AS path, role_input, role_output FROM workspace_project_memberships
  JOIN workspaces USING (workspace_id) WHERE project_id = ? ORDER BY workspaces.canonical_path`).all(`project-${project}`) as Array<{ path: string; role_input: number; role_output: number }>);

test("SSC-20 catalog 1 to 2: a single-folder project that ran writers keeps that folder as its output, and the writers' worktree links are gone", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-upgrade-writers-")));
  try {
    const { repo, writer } = await repositoryWithWriter(root);
    // Host 0.x linked each writer's worktree to the project (`authorizeWriterDirectory`): the project counted two folders.
    const db = catalogWithLinks(["甲"], [["甲", repo, 1], ["甲", writer, 0]]);
    try {
      upgrade(db);
      assert.deepEqual(linkedPaths(db, "甲"), [{ path: repo, role_input: 1, role_output: 1 }], "the person's one folder is the output, as for any one-folder project");
      assert.equal(db.prepare("SELECT 1 FROM workspaces WHERE canonical_path = ?").get(writer), undefined, "the worktree's folder row went with its link");
    } finally {
      db.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SSC-20 catalog 1 to 2: a folder the person linked that is not where the Host makes writers' worktrees for that project stays as it was", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-upgrade-folders-")));
  try {
    const { repo, writer } = await repositoryWithWriter(root);
    const writersOf = dirname(writer), name = basename(writer);
    const kept = [
      join(root, "elsewhere", name), // named like a writer, not under the writers' folder
      join(dirname(writersOf), "0123456789abcdef", name), // under the writers' folder, under another repository's key
      join(writersOf, "notes"), // under this repository's key, not a writer's id
    ];
    // 乙 links the repository's real worktree too, but not the repository: a worktree is the Host's only beside its own repository.
    const db = catalogWithLinks(["甲", "乙"], [["甲", repo, 1], ...kept.map(path => ["甲", path, 0] as const), ["乙", writer, 1]]);
    try {
      upgrade(db);
      const rows = linkedPaths(db, "甲");
      assert.deepEqual(rows.filter(row => row.role_input).map(row => [row.path, row.role_output]), [repo, ...kept].sort().map(path => [path, 0]),
        "every folder of a project with several stays, an input");
      assert.deepEqual(rows.filter(row => row.role_output).map(row => row.path), ["project-output:project-甲"], "and the project's output is its default output directory");
      assert.deepEqual(linkedPaths(db, "乙"), [{ path: writer, role_input: 1, role_output: 1 }], "a project's one folder is its output");
    } finally {
      db.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
