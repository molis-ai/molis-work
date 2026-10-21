import type { ActionDefinition, ActionExecutionContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference, ArtifactVersionRecord, FixedVersionRecord, ProcessItemRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginActionClient, PluginArtifactClient, PluginHostServices, PluginProcessItemClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingResultDocumentHandler } from "@molis-ai/molis-work-plugin-coding";
import { createShelfPlugin, type ShelfResultPorts } from "@molis-ai/molis-work-plugin-shelf";

/** Fixed Coding results and a fake platform around them, for the tests of Coding's text action and of the copy Shelf makes of it (W5-01-CODING). */

export const CODING_PLUGIN = "io.molis.work.coding";
export const SHELF_PLUGIN = "io.molis.work.shelf";
export const PROJECT_ID = "project-1";
export const PROJECT_PATH = "/projects/project-1";
export const OWNER = "web-user";

const key = (ref: ArtifactReference) => `${ref.artifact_id}@${ref.version}`;

const fixed = (over: Partial<FixedVersionRecord> & Pick<FixedVersionRecord, "artifact_id" | "artifact_type_id" | "payload">): FixedVersionRecord => ({
  version: 1, project_id: PROJECT_ID, schema_version: 1, producer_plugin_id: CODING_PLUGIN, producer_plugin_version: "1.20.0",
  producer_binding_signature: "official-coding-binding", owner_actor_id: OWNER, content_kind: "inline", content_ref: null, content_digest: "digest",
  size_bytes: 1, metadata: {}, scope: "team_project", availability: "available", unavailable_reason: null, lifecycle_state: "active",
  supersedes_version: null, created_by: OWNER, created_at: "2026-10-20T08:30:00.000Z", archived_at: null, archived_by: null, ...over });

export const REPORT_REFERENCE: ArtifactReference = { artifact_id: "coding-report:session-a:run-1", version: 1 };
export const REPORT_BODY = "## 完整原文\r\n含 ``` 与 <script>，不重新请求模型。\n最后一行🌲";

/** A Coding run report as the 成果库 holds it. */
export function reportRecord(over: Partial<ArtifactVersionRecord> = {}): ArtifactVersionRecord {
  return { ...fixed({ ...REPORT_REFERENCE, artifact_type_id: "coding.report.v1", metadata: { title: "已固定的原报告" },
    payload: { title: "已固定的原报告", run_id: "run-1", source: { session_id: "session-a" }, body_markdown: REPORT_BODY } }),
  origin: { kind: "pinned", subject: { kind: "coding_session", id: "session-a" }, revision: "run-1" }, title: "已固定的原报告", media_type: "application/json", trace: [], ...over };
}

/** Another session's report, whose identity inside agrees with the one it is held under. */
export function reportOf(sessionId: string, runId: string, over: Partial<ArtifactVersionRecord> = {}): ArtifactVersionRecord {
  const title = `报告 ${runId}`;
  return reportRecord({ artifact_id: `coding-report:${sessionId}:${runId}`, metadata: { title }, title,
    payload: { title, run_id: runId, source: { session_id: sessionId }, body_markdown: `正文 ${runId}` },
    origin: { kind: "pinned", subject: { kind: "coding_session", id: sessionId }, revision: runId }, ...over });
}

export const CHANGESET_REFERENCE: ArtifactReference = { artifact_id: "coding-changeset:session-a:run-1", version: 1 };

/** One file changed with its review, one created, one rejected, one whose write is not known, and one kept only as an old diff. */
export const CHANGE_SET: CodingChangeSet = {
  scope: "run-frozen", run_id: "run-1", applied: true, coverage: "text-reviews",
  origin: { session_id: "session-a", runtime_session_id: "runtime-1", workspace_id: "workspace-1", workspace_name: "demo" },
  files: [
    { path: "src/a.ts", kind: "modified", added_lines: 1, removed_lines: 1, diff: "@@ -1 +1 @@\n-old\n+new",
      review: { review_id: "review-1", before_text: "const a = 1;\n", after_text: "const a = 2; // `tick`\n", decision: "approved", execution: "applied" } },
    { path: "src/b.md", kind: "added", added_lines: 2, removed_lines: 0, diff: "@@ -0,0 +1,2 @@\n+# B\n+```\n",
      review: { review_id: "review-2", before_text: null, after_text: "# B\n```ts\nlet b;\n```\n", decision: "approved", execution: "applied" } },
    { path: "src/c.ts", kind: "modified", added_lines: 1, removed_lines: 0, diff: "@@ @@",
      review: { review_id: "review-3", before_text: "", after_text: "c", decision: "rejected", execution: "not-applied" } },
    { path: "src/d.ts", kind: "modified", added_lines: 1, removed_lines: 0, diff: "@@ @@",
      review: { review_id: "review-4", before_text: "d", after_text: "dd", decision: "approved", execution: "unknown" } },
    { path: "src/e.ts", kind: "modified", added_lines: 1, removed_lines: 1, diff: "@@ -1 +1 @@\n-e\n+ee" },
  ],
};

/** The change set of the fixtures as Markdown, written out: what a person reading the copy sees after Shelf's heading. */
export const CHANGE_SET_MARKDOWN = [
  "## 修改 1 · src/a.ts\n\n批准决定：已批准；保存时执行状态：已执行\n原审查：review-1\n\n修改前：\n```\nconst a = 1;\n\n```\n\n修改后：\n```\nconst a = 2; // `tick`\n\n```",
  "## 修改 2 · src/b.md\n\n批准决定：已批准；保存时执行状态：已执行\n原审查：review-2\n\n修改前（文件不存在）：\n```\n\n```\n\n修改后：\n````\n# B\n```ts\nlet b;\n```\n\n````",
  "## 修改 3 · src/c.ts\n\n批准决定：已拒绝；保存时执行状态：未执行\n原审查：review-3\n\n修改前：\n```\n\n```\n\n修改后：\n```\nc\n```",
  "## 修改 4 · src/d.ts\n\n批准决定：已批准；保存时执行状态：执行结果未知\n原审查：review-4\n\n修改前：\n```\nd\n```\n\n修改后：\n```\ndd\n```",
  "## 修改 5 · src/e.ts\n\n旧版局部差异（不是完整文件）：\n```\n@@ -1 +1 @@\n-e\n+ee\n```",
].join("\n\n");

/** A Coding change set as its process-item store holds it (exchange data, not a 成果). */
export function changeSetRecord(over: Partial<ProcessItemRecord> = {}): ProcessItemRecord {
  return fixed({ ...CHANGESET_REFERENCE, artifact_type_id: "coding.changeset.v1", metadata: { title: "这一轮的固定变更" }, payload: structuredClone(CHANGE_SET), ...over });
}

/**
 * What the platform answers one plugin about the project's versions: `read` only what the plugin may still use (the Manifest's consumed
 * types, nothing archived or unavailable), `readOwn` only its own, and the listing of both stores. Whose Manifest consumes what is
 * `consumes`; the real service is the artifacts plugin's `plugin-operations.ts`, which these answers follow.
 */
export interface FakePlatform {
  artifacts(pluginId: string): PluginArtifactClient;
  processItems(pluginId: string): PluginProcessItemClient;
}

export function fakePlatform(held: { artifacts?: readonly ArtifactVersionRecord[]; processItems?: readonly ProcessItemRecord[] }, consumes: ReadonlySet<string>): FakePlatform {
  const artifacts = new Map((held.artifacts ?? []).map(record => [key(record), record]));
  const processItems = new Map((held.processItems ?? []).map(record => [key(record), record]));
  const own = <T extends FixedVersionRecord>(pluginId: string, record: T | undefined): T | null => {
    if (record && record.producer_plugin_id !== pluginId) throw new ActionError("artifacts.plugin_denied", "这条成果线不是这个插件的");
    return record ?? null;
  };
  const usable = <T extends FixedVersionRecord>(record: T | undefined): T | null => {
    if (!record) return null;
    if (!consumes.has(record.artifact_type_id)) throw new ActionError("artifacts.plugin_incompatible", "插件没有声明消费这个类型");
    if (record.lifecycle_state !== "active" || record.availability !== "available") throw new ActionError("artifacts.plugin_incompatible", "原成果已归档或已失效");
    return record;
  };
  const listed = (record: FixedVersionRecord, kind: "artifact" | "process_item") => ({ artifact_id: record.artifact_id, version: record.version, kind,
    artifact_type_id: record.artifact_type_id, schema_version: record.schema_version, title: typeof record.metadata.title === "string" ? record.metadata.title : null });
  const usableRows = (records: Iterable<FixedVersionRecord>) => [...records].filter(record => consumes.has(record.artifact_type_id)
    && record.lifecycle_state === "active" && record.availability === "available");
  return {
    artifacts: pluginId => ({
      read: ref => usable(artifacts.get(key(ref)) ?? processItems.get(key(ref))),
      readOwn: ref => own(pluginId, artifacts.get(key(ref))),
      head: () => null,
      publish: () => { throw new Error("publishing is not under test"); },
      listConsumable: () => [...usableRows(artifacts.values()).map(record => listed(record, "artifact")), ...usableRows(processItems.values()).map(record => listed(record, "process_item"))],
    }),
    processItems: pluginId => ({
      readOwn: ref => own(pluginId, processItems.get(key(ref))),
      head: () => null,
      record: () => { throw new Error("recording is not under test"); },
    }),
  };
}

/** A start context in the project, with only the services a test hands it. */
export function startContext(pluginId: string, services: Partial<PluginHostServices>, over: Partial<PluginStartContext> = {}): PluginStartContext {
  return { install_id: `${pluginId}-install`, plugin_id: pluginId, version: "1.0.0", deployment: "local", grants: ["artifact:read", "storage:private"],
    project_id: PROJECT_ID, actor_id: OWNER, requireGrant: () => {}, services: { ui: { register: () => {}, unregister: () => {} }, ...services }, ...over };
}

/** The caller of an action: the local owner in the project, as the plugin audience when a plugin asks. */
export const callerFor = (over: Partial<ActionExecutionContext> = {}): ActionExecutionContext => ({ actor_id: OWNER, project_id: PROJECT_ID, audience: "plugin",
  permissions: ["artifact:read"], beforeEffect: async () => {}, ...over });

export function handlerOf(handlers: readonly ActionHandlerBinding[], definition: Pick<ActionDefinition, "capability_id" | "version">): ActionHandlerBinding {
  const found = handlers.find(handler => handler.capability_id === definition.capability_id && handler.version === definition.version);
  if (!found) throw new Error(`no handler for ${definition.capability_id}@${definition.version}`);
  return found;
}

/** Coding's own start context over the fake platform, and its text action as a plugin asks for it. */
export function codingDocumentHandler(platform: FakePlatform): ActionHandlerBinding {
  return codingResultDocumentHandler(startContext(CODING_PLUGIN, { artifacts: platform.artifacts(CODING_PLUGIN), processItems: platform.processItems(CODING_PLUGIN) }));
}

/**
 * Shelf started over the fake platform. Its `services.actions.invoke` runs Coding's real handler, as the platform does for a consumed
 * action, and records what it was asked. `connected` are the references its input ports hold.
 */
export async function startShelf(platform: FakePlatform, options: { connected?: Record<string, ArtifactReference>; receive?: ShelfResultPorts["receive"] } = {}) {
  const coding = codingDocumentHandler(platform), asked: string[] = [];
  const actions: PluginActionClient = {
    discover: async () => [],
    invokeQuery: async () => { throw new Error("a plugin-only action is reached by invoke"); },
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      asked.push(`${definition.capability_id}@${definition.version}`);
      if (definition.capability_id !== coding.capability_id || definition.version !== coding.version) throw new ActionError("actions.forbidden", "插件没有声明消费这项动作");
      const answer: unknown = await coding.handle(callerFor(), input);
      return answer as Output;
    },
  };
  const written: unknown[] = [];
  const receive: ShelfResultPorts["receive"] = options.receive ?? (async preview => { written.push(preview); throw new Error("receiving is not under test"); });
  const context = startContext(SHELF_PLUGIN, { artifacts: platform.artifacts(SHELF_PLUGIN), actions,
    inputs: { status: () => { throw new Error("not under test"); }, read: () => null, selectedGroup: () => undefined, reference: port => options.connected?.[port] ?? null } });
  const running = await createShelfPlugin({ projectPath: () => PROJECT_PATH, receive }).start(context);
  if (!running || running.kind !== "app" || !running.actions) throw new Error("Shelf starts as an app with actions");
  return { handlers: running.actions, asked, written };
}
