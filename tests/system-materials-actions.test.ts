import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import type { ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import { FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_TYPE, FILES_COLLECTION_TYPE, workspaceFileSubjectId, workspaceReadActions,
  WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ActionError, type ActionCallContext, type ActionReference, type FileContent, type FileEntriesPage } from "@molis-ai/molis-work-contracts/platform/actions";
import { MATERIALS_PROVIDER_ID, materialsActions, materialsFileSource, SYSTEM_MATERIALS_SOURCE, type MaterialRef, type MaterialsCaptureResult, type MaterialsOpenResult,
  type MaterialsReadResult } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { PluginInputGraph } from "@molis-ai/molis-work-plugin-runtime";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

// Files retirement S1 (specs/batch-06-shared-tools §3, materials-ui-contract §1, §5; BSH-05): the platform's materials service opens a file
// of the project's folders, fixes what the person saw as a process item it alone produces, hands it on at a port in the same commit, and
// reads a reference back under the caller's current authority. A refusal at any step writes nothing.

const DIFF = "io.molis.work.diff";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const reading = ["workspace:read"];

async function materialsHome(t: TestContext) {
  const f = await openTestHome(t);
  const project = await f.createProject("Materials", ["diff"]);
  const folder = await realpath(await mkdtemp(join(tmpdir(), "materials-output-")));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(join(folder, "notes.md"), "第一行\nsecond line 🙂\n");
  const settings = `/projects/${project.project_id}/api/project-settings/directories`;
  const { revision } = await f.web.get<ProjectDirectories>(settings);
  const changed = await f.web.post<ProjectDirectories>(settings, { change: "set_output", input: { workspace_path: folder, expected_revision: revision } });
  const output = changed.directories.find(row => row.roles.includes("output"))!;
  // Opening the project page starts its plugins, so ports and Diff's inputs are live.
  assert.equal((await fetch(`${f.origin}/projects/${project.project_id}/`, { headers: { origin: f.origin, "x-molis-work-control-token": f.controlToken } })).status, 200);
  const owner = await f.host.withProject(project.reference, opened => opened);
  const platform = await runningProjectPlatform(owner.store, project.project_id);
  assert.ok(platform, "the project's plugins are running");
  const actions = f.host.actionClient(project.reference);
  const call = <Output>(definition: ActionReference, input: unknown, caller: ActionCallContext = person(reading, project.project_id)) =>
    actions.invoke(caller, definition, input) as Promise<Output>;
  const processItems = () => owner.processItems.query.listArtifacts(project.project_id);
  return { f, project, folder, output, owner, graph: platform.wiring, call, processItems };
}

test("BSH-05 materials.open reads the file, keeps the person's reading position and hands the folder on as the platform's files collection", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  const opened = await m.call<MaterialsOpenResult>(materialsActions.open, { workspace_id: m.output.workspace_id, path: ["notes.md"] });
  assert.equal(opened.result.outcome, "text");
  assert.deepEqual(await m.call(materialsActions.position, {}), { position: { workspace_id: m.output.workspace_id, path: ["notes.md"] } });
  const files = m.graph.outputReference(MATERIALS_PROVIDER_ID, "files");
  assert.ok(files, "the files port carries the folder now");
  const version = m.owner.processItems.query.getArtifactVersion(m.project.project_id, files)!;
  assert.equal(version.artifact_type_id, FILES_COLLECTION_TYPE);
  assert.deepEqual([version.producer_plugin_id, version.producer_binding_signature], [MATERIALS_PROVIDER_ID, SYSTEM_MATERIALS_SOURCE.signature]);
  assert.deepEqual((version.payload as { selection: unknown }).selection, { path: ["notes.md"] });
  // A file that is not there is answered, and nothing is written for it.
  const before = m.processItems().length;
  const missing = await m.call<MaterialsOpenResult>(materialsActions.open, { workspace_id: m.output.workspace_id, path: ["gone.md"] });
  assert.equal(missing.result.outcome, "missing");
  assert.equal(m.processItems().length, before);
  assert.deepEqual(await m.call(materialsActions.position, {}), { position: { workspace_id: m.output.workspace_id, path: ["notes.md"] } });
});

test("BSH-05 materials.capture fixes what was seen as the platform's process item, hands it to Diff in the same commit, and reads back exactly", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  const text = "第一行\nsecond line 🙂\n";
  const captured = await m.call<MaterialsCaptureResult>(materialsActions.capture, { workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: sha(text), port: "before" });
  assert.equal(captured.port, "before");
  assert.equal(captured.ref.subject.id, workspaceFileSubjectId(m.output.workspace_id, ["notes.md"]));
  assert.equal(captured.ref.pin.mode, "snapshot");
  const pinned = captured.ref.pin.mode === "snapshot" ? captured.ref.pin.version : assert.fail("a snapshot");
  assert.deepEqual(m.graph.outputReference(MATERIALS_PROVIDER_ID, "before"), pinned);
  assert.deepEqual(m.graph.reference(DIFF, "before"), pinned, "Diff's before reads the platform's snapshot by its default source");
  const record = m.owner.processItems.query.getArtifactVersion(m.project.project_id, pinned)!;
  assert.deepEqual([record.artifact_type_id, record.producer_plugin_id, record.producer_binding_signature, record.scope],
    [FILE_SNAPSHOT_TYPE, MATERIALS_PROVIDER_ID, SYSTEM_MATERIALS_SOURCE.signature, "personal"]);
  assert.equal(m.owner.artifacts.query.listArtifacts(m.project.project_id).length, 0, "a snapshot never enters the 成果库");

  const read = await m.call<MaterialsReadResult>(materialsActions.read, { ref: captured.ref, mode: "text" });
  assert.deepEqual([read.text, read.state, read.comparable], [text, "ok", true]);

  // A selection without a port: only its reference, with the UTF-16 range the owner recorded; no port moves.
  const start = text.indexOf("second"), end = text.indexOf("\n", start);
  const selection = await m.call<MaterialsCaptureResult>(materialsActions.capture, { workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: sha(text), start, end });
  assert.equal(selection.port, null);
  assert.equal(m.graph.outputReference(MATERIALS_PROVIDER_ID, "selection"), null);
  const cut = await m.call<MaterialsReadResult>(materialsActions.read, { ref: selection.ref, mode: "text" });
  assert.deepEqual([cut.text, cut.selection], ["second line 🙂", { start, end }]);
  assert.equal(m.owner.processItems.query.getArtifactVersion(m.project.project_id, selection.ref.pin.mode === "snapshot" ? selection.ref.pin.version : assert.fail())!.artifact_type_id, FILE_TEXT_SELECTION_TYPE);

  // A current reference reads the file as it is now, and says when it has moved on; the fixed one does not change.
  const current: MaterialRef = { subject: captured.ref.subject, pin: { mode: "current", read_revision: sha(text) } };
  assert.equal((await m.call<MaterialsReadResult>(materialsActions.read, { ref: current, mode: "head" })).state, "ok");
  await writeFile(join(m.folder, "notes.md"), "rewritten\n");
  const moved = await m.call<MaterialsReadResult>(materialsActions.read, { ref: current, mode: "text" });
  assert.deepEqual([moved.state, moved.text, moved.read_revision], ["changed", "rewritten\n", sha("rewritten\n")]);
  assert.equal((await m.call<MaterialsReadResult>(materialsActions.read, { ref: captured.ref, mode: "text" })).text, text);
});

test("BSH-05 a refused capture writes no process item, no port value and no event", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  const text = "第一行\nsecond line 🙂\n";
  const events = () => Number(m.owner.store.db.prepare("SELECT count(*) AS n FROM events").get()?.n);
  const quiet = () => ({ items: m.processItems().length, before: m.graph.outputReference(MATERIALS_PROVIDER_ID, "before"), events: events() });
  const start = quiet();
  const input = { workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: sha(text), port: "before" };
  const refused = async (what: string, run: () => Promise<unknown>, code: string) => {
    await assert.rejects(run(), (error: unknown) => (error as ActionError).code === code, what);
    assert.deepEqual(quiet(), start, `${what}: nothing written`);
  };
  await refused("a fingerprint the person did not see", () => m.call(materialsActions.capture, { ...input, fingerprint: sha("other") }), "actions.subject_changed");
  await refused("a folder not in this project", () => m.call(materialsActions.capture, { ...input, workspace_id: "workspace-elsewhere" }), "actions.subject_unavailable");
  await refused("a path outside the folder", () => m.call(materialsActions.capture, { ...input, path: ["..", "secret"] }), "work.workspace.invalid_path");
  await refused("a range past the text", () => m.call(materialsActions.capture, { ...input, port: "selection", start: 0, end: text.length + 1 }), "actions.input_invalid");
  await refused("a selection port without a range", () => m.call(materialsActions.capture, { ...input, port: "selection" }), "actions.input_invalid");
  await refused("no workspace:read", () => m.call(materialsActions.capture, input, person([], m.project.project_id)), "actions.forbidden");

  // Revoked after its last wait: the reads went through, the authority is gone by the write window.
  let read = false;
  const revoking: ActionCallContext = { ...person(reading, m.project.project_id),
    validate_authority: async (reference: ActionReference) => {
      if (reference.capability_id === workspaceReadActions.file.capability_id) read = true;
      else if (read && reference.capability_id === materialsActions.capture.capability_id) throw new ActionError("actions.forbidden", "revoked");
    } };
  await refused("revoked after the read", () => m.call(materialsActions.capture, input, revoking), "actions.forbidden");
  assert.ok(read, "the file was read before the refusal");

  // The port fails inside the commit: the version recorded with it rolls back too.
  const publish = t.mock.method(PluginInputGraph.prototype, "publish", () => { throw new Error("port write failed"); });
  await assert.rejects(m.call(materialsActions.capture, input), /port write failed/u);
  publish.mock.restore();
  assert.deepEqual(quiet(), start, "a failed port write leaves no process item or event behind");
});

test("BSH-05 materials.read refuses what is not this person's, not the platform's own, or not the file the reference names", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  const text = "第一行\nsecond line 🙂\n";
  const captured = await m.call<MaterialsCaptureResult>(materialsActions.capture, { workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: sha(text) });
  const code = (expected: string) => (error: unknown) => (error as ActionError).code === expected;
  const someoneElse = { ...person(reading, m.project.project_id), actor_id: "someone-else" };
  await assert.rejects(m.call(materialsActions.read, { ref: captured.ref, mode: "text" }, someoneElse), code("actions.forbidden"));
  await assert.rejects(m.call(materialsActions.read, { ref: { ...captured.ref, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(m.output.workspace_id, ["other.md"]) } }, mode: "text" }),
    code("actions.subject_mismatch"));
  // A version under the platform's id but not its current signature (an old registration, a copy from elsewhere) is not read back.
  const stale = m.owner.processItems.commands.registerVersion({ project_id: m.project.project_id, actor_id: person(reading).actor_id, artifact_id: "stale-snapshot", version: 1,
    artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1, content: { kind: "inline", payload: { workspace: { workspace_id: m.output.workspace_id, name: "x" }, path: ["notes.md"], text: "stale" } },
    producer: { plugin_id: MATERIALS_PROVIDER_ID, plugin_version: "1", binding_signature: "an-old-signature" }, scope: "personal" });
  await assert.rejects(m.call(materialsActions.read, { ref: { subject: captured.ref.subject, pin: { mode: "snapshot", version: { artifact_id: stale.artifact.artifact_id, version: 1 } } }, mode: "text" }),
    code("actions.subject_incompatible"));
  // The platform writes no 成果: its producer is refused by the 成果库.
  assert.throws(() => m.owner.artifacts.commands.registerVersion({ project_id: m.project.project_id, actor_id: person(reading).actor_id, artifact_id: "system-artifact", version: 1,
    artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1, content: { kind: "inline", payload: { workspace: { workspace_id: m.output.workspace_id, name: "x" }, path: ["notes.md"], text: "x" } },
    producer: { plugin_id: MATERIALS_PROVIDER_ID, plugin_version: "1", binding_signature: SYSTEM_MATERIALS_SOURCE.signature }, scope: "personal",
    origin: { kind: "pinned", subject: captured.ref.subject, revision: sha(text) }, title: "notes.md", media_type: "text/markdown" }),
    code("artifacts.artifact.type_undeclared"));
  await assert.rejects(m.call(materialsActions.read, { ref: { subject: captured.ref.subject, pin: { mode: "snapshot", version: { artifact_id: "absent", version: 1 } } }, mode: "head" }),
    code("actions.subject_unavailable"));
});

test("BSH-05 a file longer than one read is read whole in windows that never cut a character, and any change ends the reading", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  // 3-byte and 4-byte characters at every offset, so window edges fall inside them; well over the 256 KiB window.
  const line = "资料 🙂 abc\n", long = line.repeat(Math.ceil((600 * 1024) / Buffer.byteLength(line)));
  await writeFile(join(m.folder, "long.md"), long);
  const ref: MaterialRef = { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(m.output.workspace_id, ["long.md"]) }, pin: { mode: "current", read_revision: `size:${Buffer.byteLength(long)}` } };
  const head = await m.call<MaterialsReadResult>(materialsActions.read, { ref, mode: "head" });
  assert.deepEqual([head.read_revision, head.comparable, head.state], [`size:${Buffer.byteLength(long)}`, false, "ok"]);
  const windows: MaterialsReadResult[] = [];
  for (let cursor: string | undefined; ;) {
    const window = await m.call<MaterialsReadResult>(materialsActions.read, { ref, mode: "text", ...(cursor ? { cursor } : {}) });
    windows.push(window);
    assert.ok(window.window && Buffer.byteLength(window.text!) <= 256 * 1024, "one window at most 256 KiB");
    if (!window.window.next_cursor) break;
    cursor = window.window.next_cursor;
  }
  assert.ok(windows.length >= 3);
  assert.equal(windows.map(window => window.text).join(""), long, "the windows put together are the file, character for character");
  let offset = 0;
  for (const window of windows) { assert.equal(window.window!.start, offset, "each window says where in the file it starts (UTF-16)"); offset += window.text!.length; }

  // A selection in the second window, fixed by naming that window: the owner reads it again and cuts the same text.
  const second = windows[1]!.window!, start = second.start + 3, end = start + 7;
  const fixed = await m.call<MaterialsCaptureResult>(materialsActions.capture, { workspace_id: m.output.workspace_id, path: ["long.md"], cursor: second.cursor, start, end });
  assert.equal((await m.call<MaterialsReadResult>(materialsActions.read, { ref: fixed.ref, mode: "text" })).text, long.slice(start, end));
  const code = (expected: string) => (error: unknown) => (error as ActionError).code === expected;
  await assert.rejects(m.call(materialsActions.capture, { workspace_id: m.output.workspace_id, path: ["long.md"], cursor: second.cursor, start: 0, end: 4 }), code("actions.input_invalid"),
    "a range outside the named window");
  await assert.rejects(m.call(materialsActions.capture, { workspace_id: m.output.workspace_id, path: ["long.md"], fingerprint: "x".repeat(64) }), code("actions.input_too_large"),
    "a long file is not fixed whole");

  // A cursor is this person's, for this file, as signed: another person, a forged one and another file are refused.
  const next = windows[0]!.window!.next_cursor!;
  await assert.rejects(m.call(materialsActions.read, { ref, mode: "text", cursor: next }, { ...person(reading, m.project.project_id), actor_id: "someone-else" }), code("actions.input_invalid"));
  const [body, tag] = next.split(".");
  const moved = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), o: 0 })).toString("base64url");
  await assert.rejects(m.call(materialsActions.read, { ref, mode: "text", cursor: `${moved}.${tag}` }), code("actions.input_invalid"));
  await writeFile(join(m.folder, "other.md"), long);
  const other: MaterialRef = { ...ref, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(m.output.workspace_id, ["other.md"]) } };
  await assert.rejects(m.call(materialsActions.read, { ref: other, mode: "text", cursor: next }), code("actions.input_invalid"));

  // The file changes between two windows (same size, rewritten): the next window is refused, never a mix of old and new.
  await writeFile(join(m.folder, "long.md"), long.replaceAll("abc", "xyz"));
  await assert.rejects(m.call(materialsActions.read, { ref, mode: "text", cursor: next }), code("actions.subject_changed"));
  const again = await m.call<MaterialsReadResult>(materialsActions.read, { ref, mode: "text" });
  assert.equal(again.window!.start, 0, "reading from the start again works");
});

test("BSH-08 the side panel's folder source is the platform's: every project folder listed under its name, a file previewed in place, nothing without the read", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  const input = await realpath(await mkdtemp(join(tmpdir(), "materials-input-")));
  t.after(() => rm(input, { recursive: true, force: true }));
  await mkdir(join(input, "docs")); await mkdir(join(input, "node_modules")); await mkdir(join(input, ".cache"));
  await writeFile(join(input, "docs", "brief.txt"), "简报\n"); await writeFile(join(input, "node_modules", "skip.js"), "x"); await writeFile(join(input, ".cache", "skip.txt"), "x");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  await writeFile(join(input, "chart.png"), png);
  const settings = `/projects/${m.project.project_id}/api/project-settings/directories`;
  const { revision } = await m.f.web.get<ProjectDirectories>(settings);
  const added = await m.f.web.post<ProjectDirectories>(settings, { change: "add_input", input: { workspace_path: input, expected_revision: revision } });
  const inputFolder = added.directories.find(row => !row.roles.includes("output"))!;

  const page = await m.call<FileEntriesPage>(materialsFileSource.entries, { cursor: null, limit: 500 });
  const listed = page.entries.map(entry => [...entry.folder, entry.title].join("/")).sort();
  assert.deepEqual(listed, [`${inputFolder.display_name}/chart.png`, `${inputFolder.display_name}/docs/brief.txt`, `${m.output.display_name}/notes.md`].sort(),
    "both folders, under their names; dependency caches and dot-folders are not walked");
  assert.ok(page.entries.every(entry => entry.open === null && entry.subject.kind === WORKSPACE_FILE_SUBJECT_KIND), "previewed in place: no plugin page opens them");

  const brief = page.entries.find(entry => entry.title === "brief.txt")!;
  const text = await m.call<FileContent>(materialsFileSource.content, { subject: brief.subject });
  assert.deepEqual([text.encoding, text.data, text.revision], ["utf8", "简报\n", sha("简报\n")]);
  const chart = page.entries.find(entry => entry.title === "chart.png")!;
  const picture = await m.call<FileContent>(materialsFileSource.content, { subject: chart.subject });
  assert.deepEqual([picture.encoding, picture.media_type, Buffer.from(picture.data, "base64")], ["base64", "image/png", png]);

  // Without the read permission neither the list nor a picture is reached; a file outside the project's folders is not found.
  const without = person([], m.project.project_id);
  await assert.rejects(m.call(materialsFileSource.entries, { cursor: null, limit: 500 }, without), (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden");
  await assert.rejects(m.call(materialsFileSource.content, { subject: chart.subject }, without), (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden");
  await assert.rejects(m.call(materialsFileSource.content, { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId("another-folder", ["x.txt"]) } }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.subject_unavailable");
});

test("BSH-08 the side panel's reader reaches the materials service as the person: open, read, quote, position; a write without the page's token is refused", { timeout: 60_000 }, async t => {
  const m = await materialsHome(t);
  const prefix = `/projects/${m.project.project_id}/api/materials`;
  const text = "第一行\nsecond line 🙂\n";
  const opened = await m.f.web.post<MaterialsOpenResult>(`${prefix}/open`, { workspace_id: m.output.workspace_id, path: ["notes.md"] });
  assert.equal(opened.result.outcome, "text");
  assert.deepEqual(await m.f.web.get(`${prefix}/position`), { position: { workspace_id: m.output.workspace_id, path: ["notes.md"] } });
  const quoted = await m.f.web.post<MaterialsCaptureResult>(`${prefix}/capture`, { workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: sha(text), start: 4, end: 15 });
  assert.equal(quoted.port, null, "a quote names no port");
  const back = await m.f.web.post<MaterialsReadResult>(`${prefix}/read`, { ref: quoted.ref, mode: "text" });
  assert.equal(back.text, "second line");
  // An action refuses as itself; the route passes the refusal on.
  await assert.rejects(m.f.web.post(`${prefix}/capture`, { workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: "0".repeat(64) }),
    (error: unknown) => (error as { code?: string }).code === "actions.subject_changed", "a file seen otherwise is not fixed");
  const before = m.processItems().length;
  const forged = await fetch(`${m.f.origin}${prefix}/capture`, { method: "POST", headers: { origin: m.f.origin, "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: m.output.workspace_id, path: ["notes.md"], fingerprint: sha(text) }) });
  assert.equal(forged.status, 403, await forged.text());
  assert.equal(m.processItems().length, before, "nothing fixed without the token");
  assert.equal((await fetch(`${m.f.origin}${prefix}/delete`, { headers: { origin: m.f.origin, "x-molis-work-control-token": m.f.controlToken } })).status !== 200, true);
});
