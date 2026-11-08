import { ActionError, findSubjectReader, platformErrorKind, retainActionAuthority, type ActionCallContext, type ActionClient, type ActionReference, type ActionSubject,
  type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACT_SUBJECT_KIND, parseArtifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { isProjectOutputWorkspaceId } from "@molis-ai/molis-work-module-projects";
import { PROJECT_WORKSPACE_PROVIDER_ID, projectDirectoryActions, type ProjectDirectories, type ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseWorkspaceFileSubjectId, resolveWorkspaceFileSubject, workspaceReadActions, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MATERIAL_ORIGIN_NOTES, MATERIAL_ORIGINS_COMPARE, type MaterialOrigin, type MaterialOriginAnswer, type MaterialOriginQuery, type MaterialPin } from "@molis-ai/molis-work-contracts/platform/project-materials";
import type { WorkspaceFileCheck } from "./workspace-files.js";

/** How long one read of origins waits, all its comparisons and object reads together (spec §2): past it, what is not done says `unchecked`. */
export const MATERIAL_ORIGINS_DEADLINE_MS = 1000;
/** How many items of one read are read at the same time (合同台第二十三轮). */
export const MATERIAL_ORIGINS_PARALLEL = 4;
const HEX_REVISION = /^[0-9a-f]{64}$/;
const SIZE_REVISION = /^size:(\d+)$/;
/** Who owns a project's own files on the person's disk, for display. */
const DIRECTORY_OWNER: MaterialOrigin["owner"] = { kind: "system", id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目目录" };

export interface ProjectFolders { directories: ProjectDirectories; default_output_id: string }

export interface MaterialOriginPorts {
  /** The action catalog, as the caller reaches it: the owner of each kind of object is found there, never in a list of its own. */
  client: ActionClient;
  /** The action whose call this read serves, which the nested calls are made under. */
  origin: ActionReference & { provider_id: string };
  projectId: string;
  /** The project's folders now, from their owner, and the id its own default output directory has whether or not it is the output now. */
  folders(): Promise<ProjectFolders>;
  /** A file's presence, size and (with `hash`) fingerprint, under the folder checks; only after the caller may read the folder. */
  check(query: { workspace_id: string; path: readonly string[] }, workspaces: readonly ProjectDirectory[], hash: boolean): Promise<WorkspaceFileCheck>;
  /** Whether a pinned version is still kept: a fixed version in the 成果库, a snapshot among the process items. */
  versionKept(pin: Exclude<MaterialPin, { mode: "current" }>): boolean;
  /** Whether a 成果库 version came in as an imported file (`origin.kind === "imported"`), not one a plugin pinned. */
  imported(reference: ArtifactReference): boolean;
  now?(): number;
}

/**
 * Each item's origin, in the order given, read now under the caller's own authority (specs/shared-sources-and-surfaces §2, SSC-02, SSC-30).
 * Nothing is recorded and nothing waits on the project's queue. A local file is checked only after the caller may read the folder: no grant,
 * no file opened. The owner of an object is the one reader of its kind in the action catalog (`findSubjectReader`, 合同台第二十二轮).
 *
 * To a plugin, what it cannot read and what is gone are the same null, and so is an object with no one owner. To the person, only the
 * latter is null. With `compare`, the first `MATERIAL_ORIGINS_COMPARE` local files pinned to their current content, in the order given,
 * are compared by content. The items are read at the same time, `MATERIAL_ORIGINS_PARALLEL` at most, within one deadline; what has not
 * answered by then, a file or an object, is `unreadable` and says `unchecked` (合同台第二十三轮). Answers keep the order asked.
 */
export async function readMaterialOrigins(caller: ActionCallContext, queries: readonly MaterialOriginQuery[], options: { compare: boolean },
  ports: MaterialOriginPorts): Promise<MaterialOriginAnswer[]> {
  if (caller.project_id !== ports.projectId) throw new ActionError("actions.scope_mismatch", "调用不属于当前项目");
  const nested = retainActionAuthority(caller, ports.origin);
  const views = await ports.client.discover(nested);
  const now = ports.now ?? Date.now, deadline = now() + MATERIAL_ORIGINS_DEADLINE_MS;
  const plugin = caller.audience === "plugin";
  // Which five are compared is settled from the request before anything is read, so it does not depend on which read answers first.
  const compared = new Set(queries.flatMap((query, index) => options.compare && "ref" in query && query.ref.subject.kind === WORKSPACE_FILE_SUBJECT_KIND
    && query.ref.pin.mode === "current" && HEX_REVISION.test(query.ref.pin.read_revision) ? [index] : []).slice(0, MATERIAL_ORIGINS_COMPARE));
  const reading: OriginReading = { caller: nested, views, plugin, deadline, now, ports, compare: options.compare, folders: undefined };
  const answers: MaterialOriginAnswer[] = queries.map(() => ({ origin: null }));
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < queries.length; index = next++) answers[index] = { origin: await originOf(reading, queries[index]!, compared.has(index)) };
  };
  await Promise.all(Array.from({ length: Math.min(MATERIAL_ORIGINS_PARALLEL, queries.length) }, worker));
  if (caller.signal?.aborted) throw new ActionError("actions.cancelled", "读取出处已取消");
  return answers;
}

interface OriginReading {
  caller: ActionCallContext;
  views: readonly ActionView[];
  plugin: boolean;
  deadline: number;
  now(): number;
  ports: MaterialOriginPorts;
  compare: boolean;
  folders: Promise<ProjectFolders | null> | undefined;
}

async function originOf(reading: OriginReading, query: MaterialOriginQuery, hash: boolean): Promise<MaterialOrigin | null> {
  const subject = "ref" in query ? query.ref.subject : query.subject, pin = "ref" in query ? query.ref.pin : null;
  const origin = subject.kind === WORKSPACE_FILE_SUBJECT_KIND ? await fileOrigin(reading, subject, pin, hash) : await objectOrigin(reading, subject, pin);
  // A plugin is not told whether it may not read a thing or the thing is gone.
  return origin && reading.plugin && (origin.state === "forbidden" || origin.state === "missing") ? null : origin;
}

/** The folders, read once a caller has been found to be allowed to read them; null when it may not. */
function readableFolders(reading: OriginReading): Promise<ProjectFolders | null> {
  reading.folders ??= (async () => {
    const allowed = (definition: ActionReference) => reading.views.some(view => view.capability_id === definition.capability_id && view.version === definition.version && view.availability.available);
    return allowed(workspaceReadActions.file) && allowed(projectDirectoryActions.get) ? reading.ports.folders() : null;
  })();
  return reading.folders;
}

async function fileOrigin(reading: OriginReading, subject: ActionSubject, pin: MaterialPin | null, hash: boolean): Promise<MaterialOrigin> {
  const base = { source: "directory" as const, owner: DIRECTORY_OWNER };
  const folders = await readableFolders(reading);
  if (!folders) return { ...base, state: "forbidden" };
  const directories = folders.directories;
  const named = parseWorkspaceFileSubjectId(subject.id);
  if (!named) return { ...base, state: "missing" };
  const resolved = resolveWorkspaceFileSubject(subject, directories);
  if (!resolved) {
    const note = named.workspace_id === folders.default_output_id ? MATERIAL_ORIGIN_NOTES.former_default_output
      : isProjectOutputWorkspaceId(named.workspace_id) ? MATERIAL_ORIGIN_NOTES.other_default_output : undefined;
    return { ...base, state: "unmapped", ...(note ? { note } : {}) };
  }
  const folder = directories.directories.find(item => item.workspace_id === resolved.workspace_id)!;
  const directory = { workspace_id: folder.workspace_id, display_name: folder.display_name, roles: [...folder.roles] };
  if (folder.state !== "ok") return { ...base, directory, state: "missing" };
  if (pin && pin.mode !== "current") return { ...base, directory, state: reading.ports.versionKept(pin) ? "ok" : "missing" };
  const usable = directories.directories.filter(item => item.state === "ok" && item.realpath_verified);
  const revision = pin?.read_revision ?? "";
  const checked = await withinDeadline(reading, () => inFlight(reading.ports.projectId, resolved, hash, () => reading.ports.check(resolved, usable, hash))
    .catch((): WorkspaceFileCheck => ({ outcome: "denied" })));
  // Not looked at in time: neither there nor gone can be said.
  if (checked === "late") return { ...base, directory, state: "unreadable", note: MATERIAL_ORIGIN_NOTES.unchecked };
  if (checked.outcome === "missing") return { ...base, directory, state: "missing" };
  if (checked.outcome === "denied" || checked.outcome === "unsupported") return { ...base, directory, state: "unreadable" };
  // A reference was written from a read under the limit, so a file past it now is not the same one.
  if (checked.outcome === "too-large") return { ...base, directory, state: "changed" };
  const size = SIZE_REVISION.exec(revision);
  if (reading.compare && size) return { ...base, directory, state: Number(size[1]) === checked.size ? "ok" : "changed" };
  if (hash && checked.fingerprint) return { ...base, directory, state: checked.fingerprint === revision ? "ok" : "changed" };
  return { ...base, directory, state: "ok", note: MATERIAL_ORIGIN_NOTES.unchecked };
}

async function objectOrigin(reading: OriginReading, subject: ActionSubject, pin: MaterialPin | null): Promise<MaterialOrigin | null> {
  const lookup = findSubjectReader(reading.views, subject.kind);
  if (lookup.found === "ambiguous" || lookup.found === "none") return null;
  const owner = ownerOf(lookup.view);
  // An owner reached only through MCP is not one an origin can name.
  if (!owner) return null;
  // A 成果库 version is an import only when it came in as a file; one a plugin pinned is that plugin's object.
  const kept = subject.kind === ARTIFACT_SUBJECT_KIND ? parseArtifactSubjectId(subject.id) : null;
  const base = { source: kept && reading.ports.imported(kept) ? "import" as const : "object" as const, owner };
  if (lookup.found === "unavailable") return reading.plugin ? null : { ...base, state: "forbidden" };
  const view = lookup.view, reader = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  const read = await withinDeadline(reading, () => reading.ports.client.invoke(reading.caller, reader, { subject_id: subject.id }).then(
    context => ({ context: context as ActionSubjectContext }), (error: unknown) => ({ error })));
  if (read === "late") return { ...base, state: "unreadable", note: MATERIAL_ORIGIN_NOTES.unchecked };
  if ("error" in read) {
    const kind = read.error instanceof ActionError ? read.error.kind ?? platformErrorKind(read.error.code) : undefined;
    return { ...base, state: kind === "not_found" ? "missing" : kind === "forbidden" ? "forbidden" : "unreadable" };
  }
  if (read.context.subject.kind !== subject.kind || read.context.subject.id !== subject.id) return { ...base, state: "unreadable" };
  if (!pin) return { ...base, state: "ok", note: MATERIAL_ORIGIN_NOTES.unchecked };
  if (pin.mode !== "current") return { ...base, state: reading.ports.versionKept(pin) ? "ok" : "missing" };
  return { ...base, state: read.context.revision === pin.read_revision ? "ok" : "changed" };
}

function ownerOf(view: ActionView): MaterialOrigin["owner"] | null {
  const provider = view.provider;
  if (provider.kind === "plugin") return { kind: "plugin", id: provider.plugin_id ?? provider.provider_id, title: provider.title };
  return provider.kind === "system" ? { kind: "system", id: provider.provider_id, title: provider.title } : null;
}

/**
 * The answer, or "late" once the read's deadline has passed. Past it nothing more is started; a read already sent cannot be stopped,
 * it is only no longer waited for.
 */
async function withinDeadline<T>(reading: OriginReading, start: () => Promise<T>): Promise<T | "late"> {
  const left = reading.deadline - reading.now();
  if (left <= 0) return "late";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">(resolve => { timer = setTimeout(() => resolve("late"), left); });
  try { return await Promise.race([start(), late]); } finally { clearTimeout(timer); }
}

/**
 * A file's check that is still running is not sent again: a slow disk or a file not yet downloaded keeps one read waiting, and opening the
 * panel again would only pile more onto the thread pool (spec §2).
 */
const running = new Map<string, Promise<WorkspaceFileCheck>>();
function inFlight(projectId: string, file: { workspace_id: string; path: readonly string[] }, hash: boolean, start: () => Promise<WorkspaceFileCheck>): Promise<WorkspaceFileCheck> {
  const key = JSON.stringify([projectId, file.workspace_id, file.path, hash]);
  const current = running.get(key);
  if (current) return current;
  const started = start().finally(() => running.delete(key));
  running.set(key, started);
  return started;
}

