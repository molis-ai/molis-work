import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ActionError, SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { materialOriginActions, materialRecentActions, PROJECT_WORKSPACE_PROVIDER_ID, projectDirectoryActions, type ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import { workspaceFileSubjectId, workspaceReadActions, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { MATERIAL_ORIGIN_NOTES, type MaterialOriginQuery, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { MATERIAL_RECENT_USES_SCHEMA_SQL, MaterialRecentUses } from "@molis-ai/molis-work-module-projects";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";

import { checkWorkspaceFile, projectWorkspaceActionProvider, readMaterialOrigins, type MaterialOriginPorts } from "@molis-ai/molis-work-app-local-host";

// specs/shared-sources-and-surfaces §2, §2.1 (SSC-02, SSC-12, SSC-25, SSC-28, SSC-30): where a reference comes from is read now, under the
// caller's own authority. A plugin cannot use it to learn about what it may not read; nothing is opened before the caller may read it.

const OWN_DEFAULT = "workspace-output-own000000000000000000000";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "molis-origins-")));
  const docs = path.join(root, "docs");
  mkdirSync(docs);
  for (let n = 1; n <= 7; n += 1) writeFileSync(path.join(docs, `${n}.md`), `file ${n}`);
  const directories: ProjectDirectories = { project_id: "p", revision: "r1", source_links: [], instructions: { off: false, trusted: false },
    directories: [{ workspace_id: "ws1", canonical_path: docs, realpath_verified: true, display_name: "docs", roles: ["input"], state: "ok" }] };
  return { root, directories, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const fileRef = (n: number, revision = sha(`file ${n}`)): MaterialRef => ({ subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId("ws1", [`${n}.md`]) }, pin: { mode: "current", read_revision: revision } });
const caller = (audience: "user" | "plugin"): ActionCallContext => ({ actor_id: audience === "user" ? "local-person" : "plugin:goals", project_id: "p", audience, permissions: [],
  ...(audience === "plugin" ? { calling_plugin_id: "goals" } : {}) });

const view = (capability_id: string, provider: ActionView["provider"], options: { kinds?: string[]; available?: boolean; reader?: boolean } = {}): ActionView => ({
  capability_id, version: 1, operation: "query", provider,
  availability: options.available === false ? { available: false, code: "actions.plugin_permission", reason: "没有授权" } : { available: true },
  action: { title: capability_id, description: "", kind: "query", audiences: ["user", "plugin"], permissions: [], subject_kinds: options.kinds ?? ["project"],
    input_schema: {}, output_schema: {}, ...(options.reader ? { input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE } : {}) },
}) as ActionView;
const goals = { provider_id: "goals", title: "目标", kind: "plugin", plugin_id: "goals" } as const;
const library = { provider_id: "artifacts-install-1", title: "成果库", kind: "plugin", plugin_id: "io.molis.work.artifacts" } as const;
const pages = { provider_id: "pages-install-1", title: "Pages", kind: "plugin", plugin_id: "pages" } as const;

/** The catalog a caller discovers: the folder reads, and object readers of a few kinds as the tests need them. */
function catalog(options: { files?: boolean; pagesAvailable?: boolean; libraryAvailable?: boolean } = {}) {
  const invoked: string[] = [];
  const system = { provider_id: "system.workspace", title: "工作目录", kind: "system" } as const;
  const views = [
    view(workspaceReadActions.file.capability_id, system, { available: options.files !== false }),
    view(projectDirectoryActions.get.capability_id, { provider_id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目工作目录", kind: "system" }),
    view("goals.read", goals, { kinds: ["goal"], reader: true }), view("artifacts.read", library, { kinds: ["artifact"], reader: true, available: options.libraryAvailable ?? true }),
    view("pages.read", pages, { kinds: ["page"], reader: true, available: options.pagesAvailable ?? true }),
    view("one.read", goals, { kinds: ["twice"], reader: true }), view("two.read", pages, { kinds: ["twice"], reader: true }),
    view("mcp.read", { provider_id: "mcp.x", title: "X", kind: "mcp" }, { kinds: ["remote"], reader: true }),
  ];
  const client: ActionClient = {
    discover: () => views,
    invoke: async (_context, reference, input) => {
      const id = (input as { subject_id: string }).subject_id;
      invoked.push(`${reference.capability_id}:${id}`);
      if (id === "deleted") throw new ActionError("goals.goal_missing", "没有这个目标", { kind: "not_found" });
      if (id === "hidden") throw new ActionError("actions.forbidden", "不能看");
      if (id === "stuck") return new Promise(() => undefined);
      const kind = reference.capability_id === "goals.read" ? "goal" : reference.capability_id === "artifacts.read" ? "artifact" : "page";
      return { subject: { kind, id }, revision: "v2", title: id, content: "", truncated: false };
    },
  };
  return { client, invoked };
}

function ports(directories: ProjectDirectories, client: ActionClient, extra: Partial<MaterialOriginPorts> = {}) {
  const opened: string[] = [];
  const value: MaterialOriginPorts = {
    client, origin: { capability_id: materialOriginActions.read.capability_id, version: 1, provider_id: PROJECT_WORKSPACE_PROVIDER_ID }, projectId: "p",
    folders: async () => ({ directories, default_output_id: OWN_DEFAULT }),
    check: async (query, workspaces, hash) => { opened.push(`${query.path.join("/")}${hash ? "#" : ""}`); return checkWorkspaceFile(query, workspaces, hash); },
    versionKept: pin => pin.version.artifact_id === "kept", imported: reference => reference.artifact_id === "imported-one", ...extra,
  };
  return { ports: value, opened };
}

test("SSC-30: a plugin's reference to another plugin's object and one to a deleted object both come back as the same null", async () => {
  const { root, directories, cleanup } = fixture();
  try {
    const { client } = catalog({ pagesAvailable: false });
    const asked: MaterialOriginQuery[] = [{ ref: { subject: { kind: "page", id: "p1" }, pin: { mode: "current", read_revision: "v2" } } },
      { ref: { subject: { kind: "goal", id: "deleted" }, pin: { mode: "current", read_revision: "v1" } } }];
    const plugin = await readMaterialOrigins(caller("plugin"), asked, { compare: true }, ports(directories, client).ports);
    assert.deepEqual(plugin, [{ origin: null }, { origin: null }]);
    // The person is told which: no access now (owner still named, the reader not called), or gone.
    const person = await readMaterialOrigins(caller("user"), asked, { compare: true }, ports(directories, client).ports);
    assert.deepEqual(person.map(item => [item.origin?.state, item.origin?.owner]), [
      ["forbidden", { kind: "plugin", id: "pages", title: "Pages" }], ["missing", { kind: "plugin", id: "goals", title: "目标" }]]);
    assert.ok(root);
  } finally { cleanup(); }
});

test("SSC-30: without the grant to read the folder a plugin gets null and no file is opened", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog({ files: false });
    const { ports: given, opened } = ports(directories, client);
    assert.deepEqual(await readMaterialOrigins(caller("plugin"), [{ ref: fileRef(1) }], { compare: true }, given), [{ origin: null }]);
    const person = await readMaterialOrigins(caller("user"), [{ ref: fileRef(1) }], { compare: true }, given);
    assert.equal(person[0]!.origin?.state, "forbidden");
    assert.equal(person[0]!.origin?.directory, undefined, "nothing about the folder before the grant");
    assert.deepEqual(opened, [], "fingerprinting never started");
  } finally { cleanup(); }
});

test("SSC-25, SSC-30: an id this project has no folder for is unmapped, with its owner and no directory, to a plugin as well", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog();
    const at = (folder: string): MaterialOriginQuery => ({ ref: { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(folder, ["README.md"]) }, pin: { mode: "current", read_revision: "size:3" } } });
    const { ports: given, opened } = ports(directories, client);
    const answers = await readMaterialOrigins(caller("plugin"), [at(OWN_DEFAULT), at("workspace-output-elsewhere0000000000000000"), at("ws-other-device")], { compare: true }, given);
    assert.deepEqual(answers.map(item => item.origin), [
      { source: "directory", owner: { kind: "system", id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目目录" }, state: "unmapped", note: MATERIAL_ORIGIN_NOTES.former_default_output },
      { source: "directory", owner: { kind: "system", id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目目录" }, state: "unmapped", note: MATERIAL_ORIGIN_NOTES.other_default_output },
      { source: "directory", owner: { kind: "system", id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目目录" }, state: "unmapped" }]);
    assert.deepEqual(opened, [], "a folder nobody named here is not looked in, even for a file of the same name");
    // Named here: the same reference reads from that folder.
    const mapped = { ...directories, source_links: [{ source_workspace_id: "ws-other-device", workspace_id: "ws1" }] };
    writeFileSync(path.join(directories.directories[0]!.canonical_path, "README.md"), "abc");
    const now = await readMaterialOrigins(caller("plugin"), [at("ws-other-device")], { compare: true }, ports(mapped, client).ports);
    assert.equal(now[0]!.origin?.state, "ok");
    assert.equal(now[0]!.origin?.directory?.workspace_id, "ws1");
  } finally { cleanup(); }
});

test("SSC-28, SSC-30: the first five current files are compared by content; the sixth on, and a subject alone, say unchecked and never changed", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog();
    const { ports: given, opened } = ports(directories, client);
    const asked: MaterialOriginQuery[] = [{ ref: fileRef(1) }, { ref: fileRef(2, sha("before")) }, { ref: fileRef(3) }, { ref: fileRef(4) }, { ref: fileRef(5) },
      { ref: fileRef(6, sha("before")) }, { subject: fileRef(7).subject }, { ref: fileRef(1, "size:6") }, { ref: fileRef(1, "size:99") }];
    const answers = await readMaterialOrigins(caller("user"), asked, { compare: true }, given);
    assert.deepEqual(answers.map(item => [item.origin?.state, item.origin?.note ?? null]), [
      ["ok", null], ["changed", null], ["ok", null], ["ok", null], ["ok", null],
      ["ok", MATERIAL_ORIGIN_NOTES.unchecked], ["ok", MATERIAL_ORIGIN_NOTES.unchecked], ["ok", null], ["changed", null]]);
    assert.deepEqual(opened.filter(item => item.endsWith("#")), ["1.md#", "2.md#", "3.md#", "4.md#", "5.md#"], "only five read for their content");
    // Recording reads no content at all.
    const recording = ports(directories, client);
    await readMaterialOrigins(caller("user"), asked, { compare: false }, recording.ports);
    assert.deepEqual(recording.opened.filter(item => item.endsWith("#")), []);
  } finally { cleanup(); }
});

test("SSC-02, SSC-30: an object's origin is its one reader's answer now; no one owner means no origin", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client, invoked } = catalog();
    const goal = (id: string, revision = "v2"): MaterialOriginQuery => ({ ref: { subject: { kind: "goal", id }, pin: { mode: "current", read_revision: revision } } });
    const asked: MaterialOriginQuery[] = [goal("g1"), goal("g1", "v1"), goal("hidden"), { subject: { kind: "goal", id: "g1" } },
      { ref: { subject: { kind: "twice", id: "x" }, pin: { mode: "current", read_revision: "v" } } }, { ref: { subject: { kind: "gone", id: "x" }, pin: { mode: "current", read_revision: "v" } } },
      { ref: { subject: { kind: "remote", id: "x" }, pin: { mode: "current", read_revision: "v" } } },
      { ref: { subject: { kind: "goal", id: "g1" }, pin: { mode: "fixed", version: { artifact_id: "kept", version: 1 } } } },
      { ref: { subject: { kind: "goal", id: "g1" }, pin: { mode: "snapshot", version: { artifact_id: "dropped", version: 1 } } } }];
    const person = await readMaterialOrigins(caller("user"), asked, { compare: true }, ports(directories, client).ports);
    assert.deepEqual(person.map(item => item.origin && [item.origin.source, item.origin.state, item.origin.note ?? null]), [
      ["object", "ok", null], ["object", "changed", null], ["object", "forbidden", null], ["object", "ok", MATERIAL_ORIGIN_NOTES.unchecked],
      null, null, null, ["object", "ok", null], ["object", "missing", null]]);
    assert.ok(!invoked.some(call => call.startsWith("one.read") || call.startsWith("two.read") || call.startsWith("mcp.read")), "the platform never picks one of two readers");
    const plugin = await readMaterialOrigins(caller("plugin"), asked, { compare: true }, ports(directories, client).ports);
    assert.deepEqual(plugin.map(item => item.origin?.state ?? null), ["ok", "changed", null, "ok", null, null, null, "ok", null]);
  } finally { cleanup(); }
});

test("SSC-30: a 成果 is an import only when its record says it was imported; one a plugin pinned is an object", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog();
    const kept = (artifact_id: string): MaterialOriginQuery => ({ ref: { subject: { kind: "artifact", id: artifactSubjectId({ artifact_id, version: 1 }) }, pin: { mode: "current", read_revision: "v2" } } });
    const answers = await readMaterialOrigins(caller("user"), [kept("imported-one"), kept("pinned-one")], { compare: true }, ports(directories, client).ports);
    assert.deepEqual(answers.map(item => [item.origin?.source, item.origin?.state]), [["import", "ok"], ["object", "ok"]]);
  } finally { cleanup(); }
});

test("SSC-30: whether a 成果 was imported is read only once the caller may read it", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog({ libraryAvailable: false });
    const looked: string[] = [];
    const given = ports(directories, client, { imported: reference => { looked.push(reference.artifact_id); return true; } }).ports;
    const asked: MaterialOriginQuery[] = [{ ref: { subject: { kind: "artifact", id: artifactSubjectId({ artifact_id: "imported-one", version: 1 }) }, pin: { mode: "current", read_revision: "v2" } } }];
    assert.deepEqual((await readMaterialOrigins(caller("plugin"), asked, { compare: true }, given)).map(item => item.origin), [null]);
    assert.deepEqual((await readMaterialOrigins(caller("user"), asked, { compare: true }, given)).map(item => [item.origin?.source, item.origin?.state]), [["object", "forbidden"]]);
    assert.deepEqual(looked, [], "the library's record was not read for a caller who may not read the object");
  } finally { cleanup(); }
});

test("SSC-28: the items are read at the same time, four at most, and answered in the order given", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog();
    let running = 0, most = 0;
    const waiting: (() => void)[] = [];
    const slow: ActionClient = { discover: client.discover, invoke: async (context, reference, input) => {
      running += 1; most = Math.max(most, running);
      await new Promise<void>(resolve => waiting.push(resolve));
      running -= 1;
      return client.invoke(context, reference, input);
    } };
    const goal = (n: number): MaterialOriginQuery => ({ ref: { subject: { kind: "goal", id: `g${n}` }, pin: { mode: "current", read_revision: n % 2 ? "v2" : "v1" } } });
    const answering = readMaterialOrigins(caller("user"), [1, 2, 3, 4, 5, 6].map(goal), { compare: true }, ports(directories, slow).ports);
    const settle = () => new Promise(resolve => setImmediate(resolve));
    for (let tick = 0; tick < 20 && waiting.length < 4; tick += 1) await settle();
    await settle();
    assert.equal(waiting.length, 4, "four are asked at once, and the fifth waits for one of them");
    // The later ones are let go first: the answers still come in the order asked.
    let done = false;
    void answering.then(() => { done = true; }, () => { done = true; });
    while (!done) { for (const release of waiting.splice(0).reverse()) release(); await settle(); }
    const answers = await answering;
    assert.equal(most, 4, "never more than four at once");
    assert.deepEqual(answers.map(item => item.origin?.state), ["ok", "changed", "ok", "changed", "ok", "changed"]);
  } finally { cleanup(); }
});

test("SSC-28: one file asked at the same time in two projects is checked once for each, never shared between them", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client } = catalog();
    const held: (() => void)[] = [], checked: string[] = [];
    // The same folder id, path and comparison in two projects: a check started for one is not an answer for the other.
    const holding = (projectId: string) => ports(directories, client, { projectId, check: async (query, workspaces, hash) => {
      checked.push(projectId);
      await new Promise<void>(resolve => held.push(resolve));
      return checkWorkspaceFile(query, workspaces, hash);
    } }).ports;
    const asked: MaterialOriginQuery[] = [{ ref: fileRef(1) }];
    const first = readMaterialOrigins(caller("user"), asked, { compare: true }, holding("p"));
    const second = readMaterialOrigins({ ...caller("user"), project_id: "q" }, asked, { compare: true }, holding("q"));
    for (let tick = 0; tick < 20 && checked.length < 2; tick += 1) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([...checked].sort(), ["p", "q"], "each project checks its own folder");
    for (const release of held.splice(0)) release();
    assert.deepEqual((await Promise.all([first, second])).map(answers => answers[0]!.origin?.state), ["ok", "ok"]);
  } finally { cleanup(); }
});

test("SSC-28: past the one-second deadline nothing more is started, and what did not finish, a file or an object, says unreadable and unchecked", async () => {
  const { directories, cleanup } = fixture();
  try {
    const { client, invoked } = catalog();
    let clock = 0;
    const given = ports(directories, client, { now: () => clock });
    const check = given.ports.check;
    given.ports.check = (query, workspaces, hash) => {
      if (query.path[0] !== "7.md") return check(query, workspaces, hash);
      given.opened.push(`7.md${hash ? "#" : ""}`);
      return new Promise<never>(() => undefined);
    };
    const goal = (id: string, revision = "v"): MaterialOriginQuery => ({ ref: { subject: { kind: "goal", id }, pin: { mode: "current", read_revision: revision } } });
    // Four slow ones take every place; the deadline passes before the last two start.
    const waiting = readMaterialOrigins(caller("user"), [goal("stuck"), { ref: fileRef(7) }, goal("stuck"), goal("stuck"), { ref: fileRef(2) }, goal("g1", "v2")],
      { compare: true }, given.ports);
    setTimeout(() => { clock = 5_000; }, 10);
    const answers = await waiting;
    assert.deepEqual(answers.map(item => [item.origin?.state, item.origin?.note ?? null]), [1, 2, 3, 4, 5, 6].map(() => ["unreadable", MATERIAL_ORIGIN_NOTES.unchecked]));
    assert.equal(answers[1]!.origin?.directory?.workspace_id, "ws1", "a file is still named by its folder");
    assert.deepEqual(invoked, ["goals.read:stuck", "goals.read:stuck", "goals.read:stuck"], "nothing was asked after the deadline");
    assert.deepEqual(given.opened, ["7.md#"], "and no file was opened after it");
  } finally { cleanup(); }
});

test("SSC-12: “最近用过” keeps only what the caller can read now, says nothing about the rest, and a refused call keeps nothing", async () => {
  const { directories, cleanup } = fixture();
  const db = openTestSqlite(":memory:");
  try {
    db.exec(MATERIAL_RECENT_USES_SCHEMA_SQL);
    const { client } = catalog({ pagesAvailable: false });
    const fakeCatalog = { projectDirectories: () => directories, defaultOutputDirectoryId: () => OWN_DEFAULT };
    const provider = projectWorkspaceActionProvider("p", () => ({ home: "/home", run: async (_options: unknown, operation: (catalog: never) => unknown) => operation(fakeCatalog as never) }) as never,
      async () => undefined, { client, db, now: () => new Date("2026-11-08T00:00:00.000Z"), versionKept: () => true, imported: () => false });
    const handler = (capability: string) => provider.handlers.find(item => item.capability_id === capability)!;
    let refuse = false;
    const call = (audience: "user" | "plugin"): ActionExecutionContext => ({ ...caller(audience), beforeEffect: async () => { if (refuse) throw new ActionError("actions.forbidden", "撤权了"); } });
    const page: MaterialRef = { subject: { kind: "page", id: "p1" }, pin: { mode: "current", read_revision: "v2" } };
    const deleted: MaterialRef = { subject: { kind: "goal", id: "deleted" }, pin: { mode: "current", read_revision: "v1" } };
    const elsewhere: MaterialRef = { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId("ws-other", ["a.md"]) }, pin: { mode: "current", read_revision: "size:1" } };
    const answer = await handler(materialRecentActions.record.capability_id).handle(call("plugin"), { refs: [fileRef(1), page, deleted, elsewhere, fileRef(2)] });
    assert.deepEqual(answer, {}, "no count, no reason");
    const recent = new MaterialRecentUses(db);
    assert.deepEqual(recent.list({ kind: "plugin", id: "goals" }), [fileRef(2), fileRef(1)]);
    // The person's list is their own; one recorded under a revoked call is not kept.
    refuse = true;
    await assert.rejects(handler(materialRecentActions.record.capability_id).handle(call("user"), { refs: [fileRef(3)] }) as Promise<unknown>);
    assert.deepEqual(recent.list({ kind: "user", id: "local-person" }), []);
    refuse = false;
    recent.record({ kind: "plugin", id: "goals" }, [page, deleted], "2026-11-08T00:01:00.000Z");
    recent.record({ kind: "user", id: "local-person" }, [page, { subject: { kind: "twice", id: "x" }, pin: { mode: "current", read_revision: "v" } }], "2026-11-08T00:01:00.000Z");
    const read = handler(materialRecentActions.read.capability_id);
    const plugin = await read.handle(call("plugin"), {}) as { items: { ref: MaterialRef }[] };
    assert.deepEqual(plugin.items.map(item => item.ref), [fileRef(2), fileRef(1)], "a plugin is not given the subject of what it cannot read");
    const person = await read.handle(call("user"), {}) as { items: { ref: MaterialRef; origin: { state: string } | null }[] };
    assert.deepEqual(person.items.map(item => item.origin?.state ?? null), [null, "forbidden"], "the person sees each line, and why");
  } finally { db.close(); cleanup(); }
});
