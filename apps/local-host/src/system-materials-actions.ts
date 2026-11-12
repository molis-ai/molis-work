import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ActionError, bindActionHandler, fileContentOf, fileEntriesPage, retainActionAuthority, subjectContext, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration,
  type FileEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactJsonValue, ArtifactReference, ArtifactsApplicationApi, FixedVersionRecord, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { projectDirectoryActions, type ProjectDirectories, type ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_SCHEMA_VERSION, FILE_TEXT_SELECTION_TYPE, FILES_COLLECTION_SCHEMA_VERSION, FILES_COLLECTION_TYPE,
  fileSnapshotFitsInline, parseFilePath, parseFileSnapshot, parseFileTextSelection, parseTextSelectionRange, resolveWorkspaceFileSubject, resolveWorkspaceId, workspaceFileSubjectId,
  workspaceReadActions, WORKSPACE_FILE_SUBJECT_KIND, WORKSPACE_SKIPPED_FOLDERS, type FileSnapshot, type FileTextSelection, type WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MATERIALS_PORTS, MATERIALS_PROVIDER_ID, MATERIALS_SURFACE, materialsActions, materialsFileSource, SYSTEM_MATERIALS_PRODUCER_VERSION, SYSTEM_MATERIALS_SOURCE, type MaterialRef, type MaterialsCaptureInput,
  type MaterialsPinnedResult, type MaterialsPosition, type MaterialsReadResult, type MaterialsWorkspace } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { projectWorkspaceFiles, type ProjectCapabilityPorts } from "./project-capabilities.js";
import type { WorkspaceWindowPosition, WorkspaceWindowResult } from "./workspace-files.js";
import { assertMaterialRef } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { SqlitePluginPrivateStorage, type PluginInputGraph } from "@molis-ai/molis-work-plugin-runtime";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { runningProjectPlatform } from "./project-plugins.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

/**
 * The platform's materials service (Files retirement, specs/batch-06-shared-tools §3, materials-ui-contract §1, §5): the reading, fixing and
 * reading-back the Files plugin used to do, as a system provider every plugin and page calls the same way. It is the one producer of the
 * process items it writes: every version carries `SYSTEM_MATERIALS_SOURCE`'s id and signature, stamped here and never taken from input,
 * and what a port hands on is committed with its version in one transaction (BSH-05). Project, person and calling plugin come from the call.
 */
export interface SystemMaterialsPorts {
  /** The project's action client: folders and files are read through their own actions, under the caller's authority. */
  client: ActionClient;
  /** The project database the process items, port values and reading positions are written to, in one transaction. */
  db: SqliteDatabase;
  processItems: ProcessItemsApplicationApi;
  artifacts: ArtifactsApplicationApi;
  /** The Runtime's private values, where this service keeps reading positions under its own system id. */
  privateValues: Pick<SqlitePluginPrivateStorage, "forSystem">;
  /** The running plugin platform's wiring graph, or null when the project's plugins are not running (then nothing is handed on). */
  wiring(): Promise<PluginInputGraph | null>;
  /** One window of a long text file in a folder this project grants; absent where the Host reads no folders. */
  windows?(query: { workspace_id: string; path: readonly string[] }, from: WorkspaceWindowPosition | null): Promise<WorkspaceWindowResult>;
  /** A whole picture or PDF in a folder this project grants, for the side panel's preview; absent where the Host reads no folders. */
  bytes?(query: { workspace_id: string; path: readonly string[] }): Promise<WorkspaceFileResult>;
}

/** Who a window cursor is for and where it reads next: the project, the person, the reference's id and the folder it resolved to. */
interface CursorClaim { p: string; a: string; s: string; w: string; o: number; u: number; obs: string }

/**
 * Window cursors, signed with a key only this provider holds and that dies with the Host: a cursor cannot be made, moved to another
 * project, person or file, or kept past a restart. What it names is read again under the caller's authority each time.
 */
function windowCursors() {
  const key = randomBytes(32), mac = (body: string) => createHmac("sha256", key).update(body).digest("base64url");
  return {
    seal: (claim: CursorClaim) => { const body = Buffer.from(JSON.stringify(claim)).toString("base64url"); return `${body}.${mac(body)}`; },
    open(cursor: string, expected: Omit<CursorClaim, "o" | "u" | "obs">): WorkspaceWindowPosition {
      const [body = "", tag = ""] = cursor.split(".");
      const given = Buffer.from(tag), wanted = Buffer.from(mac(body));
      let claim: Partial<CursorClaim> = {};
      if (given.length === wanted.length && timingSafeEqual(given, wanted)) {
        try { claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<CursorClaim>; } catch { claim = {}; }
      }
      if (claim.p !== expected.p || claim.a !== expected.a || claim.s !== expected.s || claim.w !== expected.w
        || !Number.isSafeInteger(claim.o) || !Number.isSafeInteger(claim.u) || typeof claim.obs !== "string") throw invalid("这一段的位置已失效，请从头读取");
      return { offset: claim.o!, utf16: claim.u!, observed: claim.obs };
    },
  };
}

const POSITION_KEY = "reading-position";
/** The folder ports last carried, project-wide: reading another folder withdraws what they hand on (as Files did). */
const LAST_FOLDER_KEY = "last-workspace";
const POSITION_MAX = 16_384;
const producer = { plugin_id: MATERIALS_PROVIDER_ID, plugin_version: SYSTEM_MATERIALS_PRODUCER_VERSION, binding_signature: SYSTEM_MATERIALS_SOURCE.signature };
const SNAPSHOT_TYPES = new Set([`${FILE_SNAPSHOT_TYPE}@${FILE_SNAPSHOT_SCHEMA_VERSION}`, `${FILE_TEXT_SELECTION_TYPE}@${FILE_TEXT_SELECTION_SCHEMA_VERSION}`]);

const invalid = (message: string) => new ActionError("actions.input_invalid", message);
const unavailable = (message: string) => new ActionError("actions.subject_unavailable", message);
const shown = (folder: ProjectDirectory): MaterialsWorkspace => ({ workspace_id: folder.workspace_id, name: folder.display_name, handle: folder.workspace_id });
const positionKey = (actorId: string) => `${POSITION_KEY}:${actorId}`;

function parsePosition(raw: string | null): MaterialsPosition | null {
  if (!raw || raw.length > POSITION_MAX) return null;
  try {
    const value = JSON.parse(raw) as { workspace_id?: unknown; path?: unknown };
    return typeof value.workspace_id === "string" && value.workspace_id ? { workspace_id: value.workspace_id, path: parseFilePath(value.path) } : null;
  } catch { return null; }
}

/** Why a text read gave no text, in the words the person sees. */
function notText(result: WorkspaceFileResult | WorkspaceWindowResult): ActionError {
  switch (result.outcome) {
    case "missing": return unavailable("文件已不存在");
    case "denied": return new ActionError("actions.forbidden", "这个路径不可读取");
    case "changed": return new ActionError("actions.subject_changed", "文件已经变了，请从头重新读取");
    case "too-large": return new ActionError("actions.input_too_large", `文件太大（${Math.round(result.bytes / 1024)} KB），超过一次读取的 ${Math.round(result.limit / 1024)} KB`);
    default: return new ActionError("actions.subject_incompatible", "这个文件不是文本");
  }
}

/** What every step of the service shares: its stored values, its cursors, the caller's reads and the one write window. */
function materialsCore(projectId: string, ports: SystemMaterialsPorts) {
  const values = ports.privateValues.forSystem(MATERIALS_PROVIDER_ID), cursors = windowCursors();
  const nested = (caller: ActionExecutionContext, definition: { capability_id: string; version: number }) =>
    retainActionAuthority(caller, { capability_id: definition.capability_id, version: definition.version, provider_id: MATERIALS_PROVIDER_ID });
  const folders = (caller: ActionExecutionContext) => ports.client.invoke(caller, projectDirectoryActions.get, {}) as Promise<ProjectDirectories>;
  /** The folder the caller named, exactly: one of this project's now, under the caller's authority. */
  async function folderOf(caller: ActionExecutionContext, workspaceId: unknown): Promise<ProjectDirectory> {
    const all = typeof workspaceId === "string" && workspaceId ? await folders(caller) : null;
    const folder = all?.directories.find(item => item.workspace_id === workspaceId);
    if (!folder) throw unavailable("这个文件夹已不在项目里，请刷新后重新选择文件");
    return folder;
  }
  const read = (caller: ActionExecutionContext, workspaceId: string, path: readonly string[], kind: "directory" | "text") =>
    ports.client.invoke(caller, workspaceReadActions.file, { workspace_id: workspaceId, path, kind }) as Promise<WorkspaceFileResult>;

  /** Records the next version of one port's line and hands it on; inside the caller's transaction. */
  function handOn(graph: PluginInputGraph, port: string, type: { artifact_type_id: string; schema_version: number }, payload: ArtifactJsonValue, actorId: string) {
    const artifact_id = `${MATERIALS_PROVIDER_ID}:${port}`;
    const previous = ports.processItems.query.latestArtifactVersion(projectId, artifact_id)?.version ?? 0;
    const saved = ports.processItems.commands.registerVersion({ project_id: projectId, actor_id: actorId, artifact_id, version: previous + 1, ...type,
      content: { kind: "inline", payload }, supersedes_version: previous === 0 ? null : previous, producer, scope: "personal" });
    graph.publish({ plugin_id: MATERIALS_PROVIDER_ID, port, reference: { artifact_id, version: previous + 1 }, scope_key: projectId });
    return saved.artifact;
  }
  /** Reading another folder than the ports last carried withdraws what they hand on, in the same transaction as the read's own writes. */
  function switchFolder(graph: PluginInputGraph | null, workspaceId: string) {
    if (values.get(LAST_FOLDER_KEY) === workspaceId) return;
    values.set(LAST_FOLDER_KEY, workspaceId);
    for (const port of Object.values(MATERIALS_PORTS)) graph?.invalidate(MATERIALS_PROVIDER_ID, port, "浏览的文件夹换了，请在这个文件夹里重新固定快照");
  }
  /** The one write window: after the caller's last wait, its authority asked again in the same turn as the transaction. */
  function commit<T>(caller: ActionExecutionContext, write: () => T): T {
    return ports.db.transaction(() => { caller.assert_authority_current?.(); return write(); }).immediate();
  }
  return { projectId, ports, values, cursors, nested, folders, folderOf, read, handOn, switchFolder, commit };
}
type MaterialsCore = ReturnType<typeof materialsCore>;

/** Fixing what the caller saw (BSH-05): read again, checked, recorded as the platform's process item, and handed on when a port is named. */
function materialsCapture({ projectId, ports, cursors, folderOf, read, handOn, switchFolder, commit }: MaterialsCore) {
  /** The text the caller saw: the whole file, checked against its fingerprint, or the window its cursor names, read again. */
  async function seen(caller: ActionExecutionContext, folder: ProjectDirectory, path: readonly string[], input: MaterialsCaptureInput) {
    if (input.cursor !== undefined) {
      if (!ports.windows) throw new ActionError("actions.service_unavailable", "这里不能分段读取文件");
      const from = cursors.open(input.cursor, { p: projectId, a: caller.actor_id, s: workspaceFileSubjectId(folder.workspace_id, path), w: folder.workspace_id });
      const window = await ports.windows({ workspace_id: folder.workspace_id, path }, from);
      if (window.outcome !== "window") throw notText(window);
      return { text: window.text, start: window.start, whole: false };
    }
    const result = await read(caller, folder.workspace_id, path, "text");
    if (result.outcome !== "text") throw notText(result);
    if (input.fingerprint !== result.fingerprint) throw new ActionError("actions.subject_changed", "文件已改变，请刷新并查看后再固定快照");
    return { text: result.text, start: 0, whole: true };
  }

  async function capture(caller: ActionExecutionContext, input: MaterialsCaptureInput) {
    const path = parseFilePath(input.path);
    const port = input.port ?? null;
    const ranged = input.start !== undefined || input.end !== undefined;
    if (port === MATERIALS_PORTS.selection ? !ranged : port !== null && ranged) throw invalid(port === MATERIALS_PORTS.selection ? "选区端口要给出选区范围" : "全文快照不带选区范围");
    const folder = await folderOf(caller, input.workspace_id);
    const text = await seen(caller, folder, path, input);
    if (!ranged && !text.whole) throw invalid("长文件不能整份固定，可以固定其中一段选区");
    const base = { workspace: { workspace_id: folder.workspace_id, name: folder.display_name }, path, text: text.text };
    let content: FileSnapshot | FileTextSelection = parseFileSnapshot(base);
    if (ranged) {
      const { start, end } = parseTextSelectionRange(input.start, input.end);
      if (start < text.start || end > text.start + text.text.length) throw invalid("选区已经失效，请重新选择");
      content = parseFileTextSelection({ ...base, start, end, text: text.text.slice(start - text.start, end - text.start) });
    }
    if (!fileSnapshotFitsInline(content)) throw new ActionError("actions.input_too_large", "内容超过 1 MiB 的固定上限，可以固定其中一段选区");
    const type = ranged ? { artifact_type_id: FILE_TEXT_SELECTION_TYPE, schema_version: FILE_TEXT_SELECTION_SCHEMA_VERSION }
      : { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION };
    const graph = port ? await ports.wiring() : null;
    if (port && !graph) throw new ActionError("actions.service_unavailable", "这个项目的插件还没有运行，暂时不能交给输出");
    const payload = JSON.parse(JSON.stringify(content)) as ArtifactJsonValue;
    await caller.beforeEffect();
    const saved = commit(caller, () => {
      if (!graph || !port) {
        const artifact_id = `${MATERIALS_PROVIDER_ID}:capture:${randomUUID()}`;
        return ports.processItems.commands.registerVersion({ project_id: projectId, actor_id: caller.actor_id, artifact_id, version: 1, ...type,
          content: { kind: "inline", payload }, supersedes_version: null, producer, scope: "personal" }).artifact;
      }
      switchFolder(graph, folder.workspace_id);
      return handOn(graph, port, type, payload, caller.actor_id);
    });
    graph?.evaluateAll();
    const ref: MaterialRef = { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(folder.workspace_id, path) },
      pin: { mode: "snapshot", version: { artifact_id: saved.artifact_id, version: saved.version } } };
    return { ref, port, snapshot: content };
  }
  return capture;
}

/** Reading a reference back under the caller's current authority: a pinned version exactly, a current file whole or in windows. */
function materialsReader({ projectId, ports, cursors, folders, read }: MaterialsCore) {
  /**
   * A pinned version read back exactly. A snapshot must be one this service wrote under its current signature; a fixed version is the
   * 成果库's, under its own rules. Either must be available, the caller's own, and name the same file as the reference.
   */
  function pinnedOf(caller: ActionExecutionContext, record: FixedVersionRecord | null, subjectId: string | null, system: boolean) {
    if (!record || record.availability !== "available" || record.lifecycle_state !== "active") throw unavailable("这份固定的资料已不在，或已失效");
    const file = SNAPSHOT_TYPES.has(`${record.artifact_type_id}@${record.schema_version}`);
    if (system && (record.producer_plugin_id !== MATERIALS_PROVIDER_ID || record.producer_binding_signature !== SYSTEM_MATERIALS_SOURCE.signature || !file)) {
      throw new ActionError("actions.subject_incompatible", "这不是平台资料固定下来的版本");
    }
    if (record.scope === "personal" && record.owner_actor_id !== caller.actor_id) throw new ActionError("actions.forbidden", "不能读取其他人固定的资料");
    if (!file) return { record, content: null, selection: undefined };
    const selection = record.artifact_type_id === FILE_TEXT_SELECTION_TYPE;
    const content = selection ? parseFileTextSelection(record.payload) : parseFileSnapshot(record.payload);
    if (subjectId !== null && workspaceFileSubjectId(content.workspace.workspace_id, content.path) !== subjectId) throw new ActionError("actions.subject_mismatch", "引用与固定的资料不是同一个文件");
    return { record, content, selection: selection ? { start: (content as FileTextSelection).start, end: (content as FileTextSelection).end } : undefined };
  }

  async function readRef(caller: ActionExecutionContext, ref: MaterialRef, withText: boolean, cursor?: string): Promise<MaterialsReadResult> {
    const title = (path: readonly string[]) => path.at(-1) ?? "资料";
    if (ref.pin.mode === "snapshot" || ref.pin.mode === "fixed") {
      const system = ref.pin.mode === "snapshot", store = system ? ports.processItems : ports.artifacts;
      const { record, content, selection } = pinnedOf(caller, store.query.getArtifactVersion(projectId, ref.pin.version), ref.subject.id, system);
      if (!content && withText) throw new ActionError("actions.subject_incompatible", "这份成果不是文本资料，请在成果库里打开");
      const owned: MaterialRef = { subject: ref.subject, pin: ref.pin, ...(ref.range ? { range: ref.range } : {}) };
      const named = content ? title(content.path) : typeof record.metadata.title === "string" && record.metadata.title ? record.metadata.title : "成果";
      return { ref: owned, title: named, read_revision: record.content_digest, comparable: true, state: "ok",
        ...(withText && content ? { text: content.text } : {}), ...(selection ? { selection } : {}) };
    }
    if (ref.subject.kind !== WORKSPACE_FILE_SUBJECT_KIND) throw new ActionError("actions.subject_incompatible", "这种资料请用它自己的阅读动作");
    const named = resolveWorkspaceFileSubject(ref.subject, await folders(caller));
    if (!named) throw unavailable("这个文件所在的文件夹已不在项目里");
    const answer = (revision: string, extra: Partial<MaterialsReadResult>): MaterialsReadResult => ({
      ref: { subject: ref.subject, pin: { mode: "current", read_revision: ref.pin.mode === "current" ? ref.pin.read_revision : revision }, ...(ref.range ? { range: ref.range } : {}) },
      title: title(named.path), read_revision: revision, comparable: !revision.startsWith("size:"),
      state: ref.pin.mode === "current" && revision === ref.pin.read_revision ? "ok" : "changed", ...extra });
    const result = withText && cursor !== undefined ? null : await read(caller, named.workspace_id, named.path, "text");
    if (result && result.outcome === "text") return answer(result.fingerprint, withText ? { text: result.text } : {});
    if (result && result.outcome !== "too-large") {
      if (!withText && "fingerprint" in result) return answer(result.fingerprint, {});
      throw notText(result);
    }
    if (!withText) return answer(`size:${result!.outcome === "too-large" ? result!.bytes : 0}`, {});
    // Too long for one read: in windows, each read again under the caller's authority and from the same file as the one before.
    if (!ports.windows) throw notText(result!);
    const claim = { p: projectId, a: caller.actor_id, s: workspaceFileSubjectId(named.workspace_id, named.path), w: named.workspace_id };
    const from = cursor === undefined ? null : cursors.open(cursor, claim);
    const window = await ports.windows({ workspace_id: named.workspace_id, path: named.path }, from);
    if (window.outcome !== "window") throw notText(window);
    const at = from ?? { offset: 0, utf16: 0, observed: window.observed };
    return answer(`size:${window.size}`, { text: window.text, window: { start: window.start, cursor: cursors.seal({ ...claim, o: at.offset, u: at.utf16, obs: at.observed }),
      next_cursor: window.next ? cursors.seal({ ...claim, o: window.next.offset, u: window.next.utf16, obs: window.next.observed }) : null } });
  }
  /** Versions this service fixed, restored from the version alone; what the caller cannot read is nulls, with no path. */
  function pinned(caller: ActionExecutionContext, versions: readonly ArtifactReference[]): MaterialsPinnedResult {
    return { items: versions.map(version => {
      try {
        const { record, content } = pinnedOf(caller, ports.processItems.query.getArtifactVersion(projectId, version), null, true);
        if (!content) throw unavailable("这份固定的资料已不在，或已失效");
        const subject = { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(content.workspace.workspace_id, content.path) };
        return { version, ref: { subject, pin: { mode: "snapshot" as const, version } }, title: content.path.at(-1) ?? "资料", read_revision: record.content_digest };
      } catch (error) {
        if (!(error instanceof ActionError)) throw error;
        return { version, ref: null, title: null, read_revision: null };
      }
    }) };
  }
  return { readRef, pinned };
}

/** A tree walk stops here: the side panel lists what a person browses, not a whole dependency cache. */
const LIST_MAX_FILES = 2000, LIST_MAX_DEPTH = 8;
const SKIPPED = new Set<string>(WORKSPACE_SKIPPED_FOLDERS);
const MEDIA: Record<string, string> = { md: "text/markdown", markdown: "text/markdown", txt: "text/plain", json: "application/json", ts: "text/typescript", tsx: "text/typescript",
  js: "text/javascript", mjs: "text/javascript", css: "text/css", html: "text/html", yml: "application/yaml", yaml: "application/yaml", py: "text/x-python",
  csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf" };
const mediaOf = (name: string) => MEDIA[name.split(".").pop()?.toLowerCase() ?? ""] ?? "text/plain";

/**
 * The project's folders as a side panel file source (materials-ui-contract §6): every folder listed under its own name, and a file
 * previewed in place, read under the caller's authority. Pictures and PDFs come whole, read by the Host from the folder the caller may read.
 */
function materialsFiles({ ports, nested, folders, read }: MaterialsCore) {
  return [
    bindActionHandler(materialsFileSource.entries, async (input, caller) => {
      const call = nested(caller, materialsFileSource.entries), files: FileEntry[] = [];
      const walk = async (folder: ProjectDirectory, dir: readonly string[], depth: number): Promise<void> => {
        const result = files.length < LIST_MAX_FILES ? await read(call, folder.workspace_id, dir, "directory") : null;
        if (result?.outcome !== "directory") return;
        for (const entry of result.entries) {
          if (files.length >= LIST_MAX_FILES) return;
          if (entry.kind === "directory") { if (depth < LIST_MAX_DEPTH && !SKIPPED.has(entry.name) && !entry.name.startsWith(".")) await walk(folder, entry.path, depth + 1); continue; }
          if (entry.kind !== "file") continue;
          const id = workspaceFileSubjectId(folder.workspace_id, entry.path);
          files.push({ subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id }, revision: id, title: entry.name, folder: [folder.display_name, ...entry.path.slice(0, -1)],
            media_type: mediaOf(entry.name), size: null, updated_at: null, open: { surface: MATERIALS_SURFACE, id } });
        }
      };
      for (const folder of (await folders(call)).directories) await walk(folder, [], 0);
      return fileEntriesPage(files, input);
    }),
    bindActionHandler(materialsFileSource.content, async (input, caller) => {
      const call = nested(caller, materialsFileSource.content);
      // A file named by another device's folder reads from the folder the person named for it here (SSC-26).
      const named = resolveWorkspaceFileSubject({ id: String(input.subject?.id ?? "") }, await folders(call));
      if (!named) throw unavailable("这个文件不在当前项目的文件夹里");
      const title = named.path.at(-1) ?? "文件", media = mediaOf(title);
      // Pictures and PDFs are shown as they are; everything else, SVG included, as text.
      const whole = (media.startsWith("image/") && media !== "image/svg+xml") || media === "application/pdf";
      let result: WorkspaceFileResult;
      if (whole) {
        if (!ports.bytes) throw new ActionError("actions.service_unavailable", "这里不能预览整份文件");
        await read(call, named.workspace_id, named.path.slice(0, -1), "directory");
        result = await ports.bytes({ workspace_id: named.workspace_id, path: named.path });
      } else result = await read(call, named.workspace_id, named.path, "text");
      if (result.outcome === "bytes") return fileContentOf({ subject: input.subject, revision: result.fingerprint, title, media_type: media, bytes: Buffer.from(result.data, "base64") });
      if (result.outcome === "text") return fileContentOf({ subject: input.subject, revision: result.fingerprint, title, media_type: media, text: result.text });
      if (result.outcome === "missing") throw unavailable("文件已不存在");
      const why = result.outcome === "too-large" ? `文件太大（${Math.round(result.bytes / 1024)} KB），侧栏只预览 ${Math.round(result.limit / 1024)} KB 以内的文件。`
        : result.outcome === "binary" ? "这是二进制文件，侧栏只预览文本。" : result.outcome === "denied" ? "这个路径不可读取。" : "这个文件现在不能预览。";
      // A text file too long for one read is named by its size, the revision a windowed read answers to; the reader reads it on.
      return fileContentOf({ subject: input.subject, revision: result.outcome === "too-large" ? `size:${result.bytes}` : "unreadable", title, media_type: "text/plain", text: why });
    }),
    // A project-folder file's context by the shared subject protocol (Placement follows it into a Goal): its text page by page under
    // the caller's folder authority, and the revision a live reference compares with (the content's SHA, or its size when too long).
    bindActionHandler(materialsFileSource.subject, async (input, caller) => {
      const call = nested(caller, materialsFileSource.subject), subject = { kind: WORKSPACE_FILE_SUBJECT_KIND, id: input.subject_id };
      const named = resolveWorkspaceFileSubject(subject, await folders(call));
      if (!named) throw unavailable("这个文件不在当前项目的文件夹里");
      const title = named.path.at(-1) ?? "文件", open = { surface: MATERIALS_SURFACE, id: subject.id };
      const result = await read(call, named.workspace_id, named.path, "text");
      if (result.outcome === "text") return subjectContext({ subject, revision: result.fingerprint, title, content: result.text, open }, input);
      if (result.outcome === "too-large") return subjectContext({ subject, revision: `size:${result.bytes}`, title, content: "", truncated: true, open }, input);
      if (result.outcome === "missing") throw unavailable("文件已不存在");
      throw notText(result);
    }),
  ];
}

export function systemMaterialsActionProvider(projectId: string, ports: SystemMaterialsPorts): ActionProviderRegistration {
  const core = materialsCore(projectId, ports), capture = materialsCapture(core), { readRef, pinned } = materialsReader(core);
  const { values, nested, folders, folderOf, read, handOn, switchFolder, commit } = core;
  // The latest open each person asked for: an earlier open that finishes later does not move their reading position back.
  const opens = new Map<string, number>();
  let openSequence = 0;
  return { provider: { provider_id: MATERIALS_PROVIDER_ID, kind: "system", title: SYSTEM_MATERIALS_SOURCE.name, project_id: projectId },
    definitions: [...Object.values(materialsActions), ...Object.values(materialsFileSource)], handlers: [...materialsFiles(core),
      bindActionHandler(materialsActions.open, async (input, caller) => {
        const call = nested(caller, materialsActions.open), path = parseFilePath(input.path);
        const sequence = ++openSequence;
        opens.set(caller.actor_id, sequence);
        const folder = await folderOf(call, input.workspace_id);
        const result = await read(call, folder.workspace_id, path, "text");
        const answer = { workspace: shown(folder), result, path };
        if (result.outcome !== "text") return answer;
        const root = await read(call, folder.workspace_id, [], "directory");
        const graph = root.outcome === "directory" ? await ports.wiring() : null;
        await caller.beforeEffect();
        if (opens.get(caller.actor_id) !== sequence) return answer;
        const handed = commit(caller, () => {
          values.set(positionKey(caller.actor_id), JSON.stringify({ workspace_id: folder.workspace_id, path }));
          if (!graph || root.outcome !== "directory") return false;
          switchFolder(graph, folder.workspace_id);
          handOn(graph, MATERIALS_PORTS.files, { artifact_type_id: FILES_COLLECTION_TYPE, schema_version: FILES_COLLECTION_SCHEMA_VERSION }, {
            workspace: { workspace_id: folder.workspace_id, name: folder.display_name },
            collection: { handle: folder.workspace_id, display_name: folder.display_name, entry_count: root.entries.length, truncated: root.truncated },
            selection: { path: [...path] },
          }, caller.actor_id);
          return true;
        });
        if (handed) graph?.evaluateAll();
        return answer;
      }),
      bindActionHandler(materialsActions.capture, (input, caller) => capture(nested(caller, materialsActions.capture), input)),
      bindActionHandler(materialsActions.pinned, (input, caller) => pinned(nested(caller, materialsActions.pinned), input.versions)),
      bindActionHandler(materialsActions.read, (input, caller) => {
        assertMaterialRef(input.ref);
        return readRef(nested(caller, materialsActions.read), input.ref, input.mode === "text", input.cursor);
      }),
      bindActionHandler(materialsActions.position, async (_input, caller) => {
        const position = parsePosition(values.get(positionKey(caller.actor_id)));
        if (!position) return { position: null };
        const all = await folders(nested(caller, materialsActions.position));
        const workspaceId = resolveWorkspaceId(position.workspace_id, all);
        return { position: workspaceId ? { workspace_id: workspaceId, path: position.path } : null };
      }),
    ] };
}

/** The provider for one opened project: its database, version stores, the plugin platform running on it when one is, and its folders. */
export function projectMaterialsProvider(runtime: MolisWorkProjectRuntime, client: ActionClient, folders: ProjectCapabilityPorts): ActionProviderRegistration {
  const files = projectWorkspaceFiles(folders), id = runtime.project_id;
  return systemMaterialsActionProvider(id, { client, db: runtime.store.db, processItems: runtime.processItems, artifacts: runtime.artifacts,
    privateValues: new SqlitePluginPrivateStorage(runtime.store.db), wiring: async () => (await runningProjectPlatform(runtime.store, id))?.wiring ?? null,
    ...(files ? { windows: (query, from) => files.window(id, query, from), bytes: query => files.read(id, { ...query, kind: "bytes" }) } : {}) });
}
