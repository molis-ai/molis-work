#!/usr/bin/env node
// Inbox next-step binding maintenance (FI-6 P3, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §1.2.6, RAC-518):
// the binding of the `inbox.next` scene was a row of the Functions store (`function_scene_bindings`, in the Home), and is Inbox's own now:
// a row of `inbox_scene_bindings` in the project's library, a table Inbox declares and the platform makes the first time the library opens
// with the new build. The new build reads only the new place, so a project that had a binding is moved once: the row is copied as it is
// (rule, whether it is on, revision) and then removed from the Functions store. Delete this file and
// tests/inbox-binding-maintenance.test.ts together once the Homes in use have been done (they stay in Git history).
//
//   node tests/fixtures/inbox-binding-maintenance.mjs list --functions <functions.sqlite> --project <project.sqlite> [--json]
//       READ ONLY. Says whether the project has a binding in the Functions store and whether the new table already holds one.
//   node tests/fixtures/inbox-binding-maintenance.mjs move --functions <functions.sqlite> --project <project.sqlite> [--json]
//       Copies the project's row into the new table, then deletes it from the Functions store. Stops without writing when the new table is
//       missing (open the project with the new build first) or already holds a different binding. Running it again changes nothing.
//   Run it on copies first; on a real Home only with the Host stopped and the window approved. One call is one project: its id is read
//   from the project library's `project_root`. Exit code: 0 done or nothing to do, 1 a problem (nothing was written), 2 a bad command.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SCENE = "inbox.next";
const problem = message => Object.assign(new Error(message), { problem: true });

function open(file, readOnly) {
  if (!existsSync(file)) throw problem(`${file} does not exist`);
  return new DatabaseSync(file, { readOnly });
}

/** What the two libraries hold for this project, or a problem when they are not what the maintenance expects. */
export function readInboxBinding(functionsFile, projectFile, readOnly = true) {
  const project = open(projectFile, readOnly), functions = open(functionsFile, readOnly);
  try {
    const roots = project.prepare("SELECT project_id FROM project_root").all();
    if (roots.length !== 1) throw problem(`${projectFile} holds ${roots.length} projects, not one`);
    const projectId = roots[0].project_id;
    const table = project.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'inbox_scene_bindings'").get().n;
    if (table !== 1) throw problem(`${projectFile} has no inbox_scene_bindings table: open the project once with the new build first`);
    const old = functions.prepare("SELECT action_binding_json, binding_revision, updated_at FROM function_scene_bindings WHERE scene_id = ? AND project_id = ?").get(SCENE, projectId) ?? null;
    const current = project.prepare("SELECT action_binding_json, binding_revision, updated_at FROM inbox_scene_bindings WHERE project_id = ? AND scene_id = ?").get(projectId, SCENE) ?? null;
    if (old && current && JSON.stringify(old) !== JSON.stringify(current)) throw problem(`the project already holds another binding in inbox_scene_bindings than the one in the Functions store`);
    return { projectId, old, current };
  } finally { project.close(); functions.close(); }
}

/** Copies the row into the project, then removes it from the Functions store; a project without a row, or one already moved, is left as it is. */
export function moveInboxBinding(functionsFile, projectFile) {
  const read = readInboxBinding(functionsFile, projectFile, false);
  if (!read.old) return { project_id: read.projectId, moved: false };
  const project = open(projectFile, false), functions = open(functionsFile, false);
  try {
    if (!read.current) {
      project.prepare("INSERT INTO inbox_scene_bindings (project_id, scene_id, action_binding_json, binding_revision, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(read.projectId, SCENE, read.old.action_binding_json, read.old.binding_revision, read.old.updated_at);
    }
    functions.prepare("DELETE FROM function_scene_bindings WHERE scene_id = ? AND project_id = ?").run(SCENE, read.projectId);
  } finally { project.close(); functions.close(); }
  const after = readInboxBinding(functionsFile, projectFile);
  if (after.old || !after.current) throw problem("the binding did not read back from the project library alone");
  return { project_id: read.projectId, moved: true };
}

function run(argv) {
  const [mode, ...rest] = argv;
  const value = name => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : undefined; };
  const functionsFile = value("--functions"), projectFile = value("--project");
  if (!["list", "move"].includes(mode) || !functionsFile || !projectFile) return { code: 2, text: "usage: inbox-binding-maintenance.mjs list|move --functions <functions.sqlite> --project <project.sqlite> [--json]" };
  try {
    const report = mode === "list"
      ? (read => ({ project_id: read.projectId, in_functions_store: read.old !== null, in_project: read.current !== null, needs_move: read.old !== null }))(readInboxBinding(path.resolve(functionsFile), path.resolve(projectFile)))
      : moveInboxBinding(path.resolve(functionsFile), path.resolve(projectFile));
    const text = rest.includes("--json") ? JSON.stringify(report, null, 2)
      : mode === "list" ? `${report.project_id}: ${report.needs_move ? "has a binding in the Functions store; move copies it" : "nothing to move"}`
        : `${report.project_id}: ${report.moved ? "binding moved" : "nothing to move"}`;
    return { code: 0, text };
  } catch (error) {
    if (error?.problem === true) return { code: 1, text: `problem, nothing written: ${error.message}` };
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outcome = run(process.argv.slice(2));
  (outcome.code === 0 ? process.stdout : process.stderr).write(`${outcome.text}\n`);
  process.exit(outcome.code);
}
