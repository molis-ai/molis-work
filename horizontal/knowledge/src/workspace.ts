import { retainActionAuthority, type ActionReference, type ActionSubject, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectsCapabilities, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { KNOWLEDGE_GLOB_MAX_FILES, KNOWLEDGE_GLOB_MAX_FOLDERS, KNOWLEDGE_PROVIDER_ID, type KnowledgeGlobRequest, type KnowledgeGlobResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import {
  parseWorkspaceFileSubjectId,
  workspaceFileSubjectId,
  workspaceReadActions,
  WORKSPACE_FILE_SUBJECT_KIND,
  WORKSPACE_SKIPPED_FOLDERS,
  type WorkspaceFileResult,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { knowledgeErrors } from "./errors.js";
import { pathPattern } from "./glob.js";
import type { KnowledgeAccess } from "./index.js";

const DEFAULT_GLOB_LIMIT = 100;
const SKIPPED = new Set<string>(WORKSPACE_SKIPPED_FOLDERS);
type Origin = { capability_id: string; version: number };

const NOT_TEXT: Record<Exclude<WorkspaceFileResult["outcome"], "text" | "directory" | "bytes">, string> = {
  "too-large": "文件太大，读不了全文", binary: "这是二进制文件，没有文字可读", unsupported: "这个文件不能按文字读取", missing: "文件已不存在",
  denied: "这个路径不可读取，或工作目录的授权已变化", changed: "文件在读取时变化了，请重试",
};

/**
 * The project's linked folders, read for project knowledge (spec §7, K0b) only through the Host's one workspace read action and
 * always with the caller's own authority: a caller without the grant to read the folder gets nothing from here.
 */
export class KnowledgeWorkspace {
  /** Files whose path matches the pattern, walking only folders that could hold a match; bounded in files and folders listed. */
  async glob(access: KnowledgeAccess, input: KnowledgeGlobRequest, origin: Origin, cap = KNOWLEDGE_GLOB_MAX_FILES): Promise<KnowledgeGlobResponse> {
    const pattern = pathPattern(input.pattern);
    if (!pattern) throw knowledgeErrors.invalid("路径模式要相对于工作目录，不能以 / 开头或含 ..");
    const limit = Math.min(cap, Math.max(1, input.limit ?? DEFAULT_GLOB_LIMIT));
    const { invoke, folders } = await this.reader(access, origin, input.workspace_id);
    const result: KnowledgeGlobResponse = { files: [], more: false, unread: [] };
    let listed = 0;
    for (const folder of folders) {
      const queue: string[][] = pattern.starts.map(start => [...start]);
      while (queue.length) {
        const path = queue.shift()!;
        if (listed >= KNOWLEDGE_GLOB_MAX_FOLDERS || result.files.length >= limit) { result.more = true; break; }
        listed += 1;
        const read = await invoke({ workspace_id: folder.workspace_id, path, kind: "directory" }).catch((error: unknown) => ({ outcome: "error" as const, error }));
        if (read.outcome !== "directory") {
          // A starting folder the pattern names but the project does not have is simply not there.
          if (read.outcome !== "missing") result.unread.push({ workspace_id: folder.workspace_id, path: path.join("/"), reason: "error" in read ? String((read.error as Error)?.message ?? read.error).slice(0, 200) : NOT_TEXT[read.outcome as keyof typeof NOT_TEXT] ?? "读不了这个目录" });
          continue;
        }
        result.more ||= read.truncated;
        for (const entry of read.entries) {
          if (entry.kind === "directory") {
            const hidden = SKIPPED.has(entry.name) || entry.name.startsWith(".");
            if ((!hidden || pattern.names(entry.name)) && pattern.mayContain(entry.path)) queue.push([...entry.path]);
          } else if (entry.kind === "file" && pattern.matches(entry.path)) {
            if (result.files.length >= limit) { result.more = true; break; }
            result.files.push({ subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: workspaceFileSubjectId(folder.workspace_id, entry.path) },
              workspace_id: folder.workspace_id, workspace_name: folder.display_name, path: entry.path.join("/") });
          }
        }
      }
    }
    return result;
  }

  /** A workspace file as the piece `knowledge.read`, `outline` and `grep` read: its text now, with the fingerprint as its revision. */
  async file(access: KnowledgeAccess, subject: ActionSubject, origin: Origin): Promise<ActionSubjectContext> {
    const named = parseWorkspaceFileSubjectId(subject.id);
    if (!named) throw knowledgeErrors.invalid("这不是工作目录里的文件");
    const { invoke } = await this.reader(access, origin, named.workspace_id);
    const read = await invoke({ workspace_id: named.workspace_id, path: named.path, kind: "text" });
    if (read.outcome !== "text") throw knowledgeErrors.unreadable(read.outcome in NOT_TEXT ? NOT_TEXT[read.outcome as keyof typeof NOT_TEXT] : "这个文件不能按文字读取");
    return { subject, revision: read.fingerprint, title: named.path.join("/"), content: read.text, truncated: false, goal_ids: [] };
  }

  /** The workspace read action and the project's folders, as this caller may reach them now. */
  private async reader(access: KnowledgeAccess, origin: Origin, workspaceId: string | undefined) {
    const caller = retainActionAuthority(access.workspace ?? access.caller, { ...origin, provider_id: KNOWLEDGE_PROVIDER_ID });
    const views = await access.client.discover(caller);
    const files = available(views, workspaceReadActions.file), list = available(views, projectsCapabilities.listWorkspaces);
    if (!files || !list) throw knowledgeErrors.unreadable("没有读取项目工作目录的授权；要用工作目录里的文件，请在「对外接入」里允许读取项目目录文件");
    const linked = (await access.client.invoke(caller, list, []) as readonly ProjectWorkspaceRef[]).filter(item => item.realpath_verified);
    const folders = workspaceId === undefined ? linked : linked.filter(item => item.workspace_id === workspaceId);
    if (!folders.length) throw knowledgeErrors.unreadable(workspaceId === undefined ? "这个项目还没有关联工作目录" : "这个工作目录不属于当前项目，或已取消关联");
    return { folders, invoke: (input: { workspace_id: string; path: readonly string[]; kind: "directory" | "text" }) => access.client.invoke(caller, files, input) as Promise<WorkspaceFileResult> };
  }
}

function available(views: readonly ActionView[], definition: { capability_id: string; version: number }): ActionReference & { provider_id: string } | null {
  const view = views.find(item => item.capability_id === definition.capability_id && item.version === definition.version && item.availability.available);
  return view ? { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id } : null;
}
