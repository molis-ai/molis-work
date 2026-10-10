import { ActionError, bindWorkflowContentHandlers, defineWorkflowContentActions, bindArtifactPreview, defineArtifactPreviewAction, bindFileEntriesHandler, bindSearchEntriesHandler, defineFileEntriesAction, defineSearchEntriesAction, defineSubjectContextAction, searchRevisionOf, searchText, type SearchEntry, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactConsumerType, ArtifactReference, ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ARTIFACT_SUBJECT_KIND, artifactSubjectId, importedDocumentFile, parseArtifactSubjectId, type ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { readArtifactBrowser, readArtifactSelection, exportArtifactVersion, requireArtifactAnalysisRecord, artifactAnalysisContext, artifactVersionPath, importedFileOf, type ArtifactBrowserView } from "./browser.js";
import { readGoalArtifactEmbeds, type GoalArtifactEmbed } from "./goal-context.js";
import type { ExternalDocumentSource } from "./document-import.js";
import { DOCUMENT_ARTIFACT_TYPE } from "./document-type.js";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";

import { text, id, version, object, array, nullable, reference, consumerTypes, record } from "./action-schemas.js";
const selection = { selected: nullable(record), requested: nullable(reference), compatibility: nullable(object({ artifact: reference,
  consumable: { type: "boolean" }, reason: { enum: ["compatible_consumer", "consumer_missing", "artifact_unavailable", "artifact_archived"] } })) };
const browser = object({ versions: array(record), ...selection });
const imported = object({ artifact_id: id, version, title: text, reused: { type: "boolean" }, url: text, warnings: array(text) });
const sources = { enum: ["notion", "feishu", "lark", "google-docs"] };
const read = ["artifacts:read"], write = [...read, "artifacts:write"];
const subjectDefinition = defineSubjectContextAction("artifacts.subject.read", ARTIFACT_SUBJECT_KIND, "固定版本成果", read);
const subject: ActionDefinition<{ subject_id: string }, ActionSubjectContext> = { ...subjectDefinition,
  // Plugins read Artifacts through their own SDK with its consumption contracts, never through the subject reader.
  action: { ...subjectDefinition.action, audiences: ["user", "agent", "workflow", "mcp"], plugin: false } };
/** A local file: a text document by its `content`, any other file by its `original_file` bytes (A3). */
export interface ArtifactFileImport { source: "file"; filename: string; content?: string; title?: string;
  source_id?: string; original_file?: { filename: string; mime: string; data_base64: string } }
export interface ArtifactExternalImport { source: ExternalDocumentSource; url: string; connection_id?: string }
export interface ArtifactImportResult { artifact_id: string; version: number; title: string; reused: boolean; url: string; warnings: string[] }
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions = read, scheduling?: ActionDefinition['action']['scheduling']): ActionDefinition<I, O> {
  return { capability_id: `artifacts.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", ...(scheduling ? { scheduling } : {}), audiences: ["user", "agent", "workflow", "mcp"], permissions, subject_kinds: ["artifact"], input_schema: input, output_schema: output } };
}
const onlyPeople = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> => ({ ...definition, action: { ...definition.action, audiences: ["user"] } });
/**
 * A plugin input port that takes this version's type (artifact-positioning, 2026-10-04), and what it reads now: this very
 * version, another fixed version, another plugin's output (`source_title`), or nothing.
 */
export interface ArtifactPluginInput { plugin_id: string; plugin_title: string; port: string; source: "this" | "another-version" | "plugin" | "none"; source_title: string | null }
const pluginInputsOutput = object({ inputs: array(object({ plugin_id: text, plugin_title: text, port: text,
  source: { enum: ["this", "another-version", "plugin", "none"] }, source_title: nullable(text) })) });
/** System search: the newest available version of each Artifact, by title and the text inside its payload. */
const searchEntries = defineSearchEntriesAction("artifacts.search.entries", [{ kind: ARTIFACT_SUBJECT_KIND, title: "成果", surface: "artifacts" }], "项目成果", read);
/** The side panel's file tab (specs/archive/side-panel): the newest available version of each Artifact; previews read `subject`. */
const fileEntries = defineFileEntriesAction("artifacts.files.entries", [{ kind: ARTIFACT_SUBJECT_KIND, title: "成果", surface: "artifacts" }], "项目成果", read);
/**
 * The text of a payload that a person can read under a search hit. Producers keep ids, node types, encodings and
 * references in the same payload, so only these fields count, wherever they sit in it. A `cells` object is a table row
 * whose keys are column ids: its values are the text. `title` repeated by the payload is the hit's own title line.
 */
const SEARCHABLE_FIELDS = new Set(["title", "name", "text", "content", "body", "filename", "description", "summary", "caption", "label", "heading", "notes", "markdown", "cells",
  // The reading text the built-in producers keep under their own keys: a Coding report (task, answer, markdown body), a deck's
  // bullets, a character's instructions, a captured Feed message's source name and tags.
  "body_markdown", "task", "model_answer", "bullets", "instructions", "source_label", "tags"]);
function payloadText(value: unknown, title: string, field = "", out: string[] = [], budget = { left: 4000 }): string[] {
  if (budget.left <= 0 || value == null) return out;
  if (typeof value === "string") {
    if (!SEARCHABLE_FIELDS.has(field)) return out;
    const text = searchText(value, budget.left);
    if (text && text !== title) { out.push(text); budget.left -= text.length; }
  }
  else if (Array.isArray(value)) for (const item of value) payloadText(item, title, field, out, budget);
  else if (typeof value === "object") for (const [key, item] of Object.entries(value)) payloadText(item, title, field === "cells" ? field : key, out, budget);
  return out;
}
export const artifactsActions = {
  /** An imported file as the 成果库 and side panel show it (artifact-positioning A4): its text, or its original bytes. */
  preview: defineArtifactPreviewAction("artifacts.documents.preview", "导入的文件", read),
  subject,
  searchEntries,
  fileEntries,
  browser: define<{ reference?: ArtifactReference | null; supported_types?: ArtifactConsumerType[] }, ArtifactBrowserView>("browse", "浏览项目成果", "读取当前项目全部成果版本及指定的固定版本；保留原生产方、正文和可用状态", "query",
    object({ reference: nullable(reference), supported_types: consumerTypes }, []), browser),
  read: define<{ reference: ArtifactReference; supported_types?: ArtifactConsumerType[] }, Omit<ArtifactBrowserView, "versions">>("read", "读取固定成果版本", "按准确身份和版本读取成果及兼容性，不自动替换成最新版本", "query",
    object({ reference, supported_types: consumerTypes }, ["reference"]), object(selection)),
  export: define<{ reference: ArtifactReference }, { filename: string; mime: string; content: string }>("export", "导出成果版本", "导出原成果记录为 JSON，不注册新版本或改变发布状态", "query", object({ reference }), object({ filename: text, mime: text, content: text })),
  importFile: define<ArtifactFileImport, ArtifactImportResult>("import.file", "导入本地文件", "把任何本地文件存为个人成果：Markdown、TXT、HTML 读出正文，其他文件保存原件（最多 6 MB）；同内容重复导入重用原版本", "command",
    object({ source: { const: "file" }, filename: { ...text, minLength: 1, maxLength: 255 }, content: { ...text, description: "文本文件的 UTF-8 正文，解码后最多 2 MB" }, title: { ...text, maxLength: 500 },
      source_id: { ...text, minLength: 1, maxLength: 512 }, original_file: object({ filename: { ...text, minLength: 1, maxLength: 255 }, mime: { ...text, maxLength: 128 }, data_base64: { ...text, maxLength: 8_000_000 } }) }, ["source", "filename"]), imported, write, "concurrent"),
  importExternal: define<ArtifactExternalImport, ArtifactImportResult>("import.external", "导入外部文档", "使用当前 Home 已连接的文档账号读取链接，保存个人快照；不写回来源，不自动同步", "command",
    object({ source: sources, url: { ...text, minLength: 1, maxLength: 4096 }, connection_id: id }, ["source", "url"]), imported, [...write, "connectors:document:read"], "concurrent"),
  importSources: define<Record<string, never>, { sources: Record<string, boolean>; connections: ConnectorConnectionView[] }>("import.sources", "文档来源连接状态", "查看文档导入支持来源是否已连接，不返回凭据", "query", object({}), object({ sources: { type: "object", additionalProperties: { type: "boolean" } }, connections: array({ type: "object", additionalProperties: true }) })),
  goalEmbeds: define<{ goal_id: string; supported_types?: ArtifactConsumerType[] }, { embeds: GoalArtifactEmbed[] }>("goals.embeds", "读取目标成果引用", "读取原 Ledger 明确关联的输入和输出及固定版本，保留失效引用，不猜测关系", "query", object({ goal_id: id, supported_types: consumerTypes }, ["goal_id"]),
    object({ embeds: array(object({ relationship: { enum: ["input", "output"] }, view: browser })) })),
  links: define<{ reference: ArtifactReference }, ArtifactReferences>("links", "这一版被谁引用", "列出把这一版作为输入、交付物或提议交付物的目标，以及其他引用的数量；不修改数据",
    "query", object({ reference }), object({ goals: { type: "array", items: object({ goal_id: { type: "string" }, title: { type: "string" },
      role: { enum: ["input", "deliverable", "proposed", "proposed_input"] } }) }, other: { type: "integer", minimum: 0 } })),
  pluginInputs: define<{ reference: ArtifactReference }, { inputs: ArtifactPluginInput[] }>("plugin_inputs", "可以接这一版的插件输入",
    "列出已启用插件里能接收这一版类型的输入端口，以及它们现在读的是什么；不修改数据", "query", object({ reference }), pluginInputsOutput),
  // Changing what another plugin reads is the person's own choice (artifact-positioning, 2026-10-04).
  bindPluginInput: onlyPeople(define<{ reference: ArtifactReference; plugin_id: string; port: string; restore?: boolean }, { inputs: ArtifactPluginInput[] }>("plugin_inputs.bind",
    "把这一版交给插件的输入", "让一个插件的输入端口固定读这一版，直到改回原来的来源；restore 为真时改回原来的来源", "command",
    object({ reference, plugin_id: id, port: id, restore: { type: "boolean" } }, ["reference", "plugin_id", "port"]), pluginInputsOutput, write)),
  projectReference: define<{ reference: string }, { filename: string; content_base64: string }>("references.open", "打开项目结果引用", "通过受限读取器读取当前工作区里的 project:// 或相对路径引用；不接受调用者提供目录", "query",
    object({ reference: id }, ["reference"]), object({ filename: text, content_base64: text }), [...read, "workspace:read"]),
};
/**
 * A version in the 成果库 as the first station of a workflow run (artifact-positioning 五.1): any version starts a run with
 * its text; workflows never hand content to the 成果库.
 */
export const artifactsContentActions = defineWorkflowContentActions({ id: "artifacts", title: "成果", icon: "package", receive: false,
  subject_kind: ARTIFACT_SUBJECT_KIND, read_permissions: read, write_permissions: read });
export const ARTIFACT_ACTIONS: readonly ActionDefinition[] = [...Object.values(artifactsActions), ...Object.values(artifactsContentActions)];
export const ARTIFACT_ACTION_PERMISSIONS = [...new Set(ARTIFACT_ACTIONS.flatMap(value => value.action.permissions))];
export interface ArtifactActionPorts {
  projectId: string;
  artifacts: ArtifactsApplicationApi;
  ledger: ContextLedgerApi["query"];
  importDocument(input: ArtifactFileImport | ArtifactExternalImport, caller: ActionExecutionContext): Promise<ArtifactImportResult>;
  importSources(): Record<string, boolean>;
  importConnections?(): ConnectorConnectionView[];
  openProjectReference(input: { reference: string }): Promise<{ filename: string; content_base64: string }>;
  /** A Goal's title for 「被谁引用」, read by the host; null when the Goal is gone. */
  goalTitle?(goalId: string): string | null;
  /** A 成果 type's display name as its owner declares it (the side panel groups by it); null when undeclared. */
  typeTitle?(artifactTypeId: string): string | null;
  /** A version's text as its type's owner previews it, for a workflow run that starts from it; null when there is none. */
  previewText?(artifact: ArtifactVersionRecord, caller: ActionExecutionContext): Promise<string | null>;
  /** Plugin input ports that take the version's type, read from the host's plugin wiring; absent where no plugins run. */
  pluginInputs?(artifact: ArtifactVersionRecord): Promise<ArtifactPluginInput[]>;
  /** Give the port this version, or with `restore` its former source; returns the ports as they are afterwards. */
  bindPluginInput?(artifact: ArtifactVersionRecord, input: { plugin_id: string; port: string; restore: boolean }, caller: ActionExecutionContext): Promise<ArtifactPluginInput[]>;
}
/** Who refers to one version (A4b, 「被谁引用」): Goals that take it as input, hand it in, or have it proposed as either; other links counted. */
export interface ArtifactReferences {
  goals: Array<{ goal_id: string; title: string; role: "input" | "deliverable" | "proposed" | "proposed_input" }>;
  other: number;
}
const GOAL_ROLES: Record<string, ArtifactReferences["goals"][number]["role"]> = { "goal.input": "input", "goal.input.proposal": "proposed_input", "goal.output": "deliverable", "goal.output.proposal": "proposed" };
/** A version people can still hand on: in the 成果库, readable and not archived. */
function requireUsable(ports: ArtifactActionPorts, reference: ArtifactReference): ArtifactVersionRecord {
  const artifact = ports.artifacts.query.getArtifactVersion(ports.projectId, reference);
  if (!artifact || artifact.availability !== "available" || artifact.lifecycle_state === "archived") throw new ActionError("actions.subject_unavailable", "这一版不存在或不可用");
  return artifact;
}

export function createArtifactActionHandlers(ports: ArtifactActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, run: (input: I, caller: ActionExecutionContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => run(input as I, caller),
  });
  return [
    bindArtifactPreview(artifactsActions.preview, DOCUMENT_ARTIFACT_TYPE, artifact => {
      const file = importedFileOf(artifact);
      if (!file) throw new ActionError("artifacts.unavailable", "这一版的内容不可用");
      const text = /^text\//u.test(file.mime);
      return { title: file.filename, media_type: file.mime.split(";")[0]!.trim(), ...(text ? { text: file.bytes.toString("utf8") } : { bytes: new Uint8Array(file.bytes) }) };
    }),
    bind(artifactsActions.subject, (input, caller) => {
      const reference = parseArtifactSubjectId(input.subject_id);
      if (!reference) throw new ActionError("actions.invalid_input", "成果事项必须包含准确的成果 ID 和版本");
      const artifact = requireArtifactAnalysisRecord(ports.artifacts.query.getArtifactVersion(ports.projectId, reference),
        { project_id: ports.projectId, reference });
      const scope = { kind: "personal" as const, id: ports.projectId };
      // Edges in this project's ledger name this project or no project (Goals' input bindings name none).
      const currentProject = (project: string | null | undefined) => project == null || project === ports.projectId;
      const edges = ports.ledger.list({ actor_id: caller.actor_id, scope });
      const goalIds = edges.filter(edge => (edge.type === "goal.input" || edge.type === "goal.output")
        && edge.target.module === "artifacts" && edge.target.id === reference.artifact_id && edge.target.version === reference.version
        && currentProject(edge.target.project_id) && edge.source.module === "goals" && currentProject(edge.source.project_id))
        .map(edge => edge.source.id);
      return artifactAnalysisContext(artifact, goalIds);
    }),
    bindSearchEntriesHandler(artifactsActions.searchEntries, () => {
      const latest = new Map<string, ArtifactVersionRecord>();
      for (const record of ports.artifacts.query.listArtifacts(ports.projectId)) {
        if (record.lifecycle_state !== "active" || record.availability !== "available") continue;
        const current = latest.get(record.artifact_id);
        if (!current || record.version > current.version) latest.set(record.artifact_id, record);
      }
      return [...latest.values()].map((record): SearchEntry => {
        const summary = payloadText(record.payload, searchText(record.title)).join("\n").slice(0, 4000);
        // The summary is searched text read out of the payload by rules this build owns, so the revision covers it: an index made by an
        // earlier build, with other rules, reads the entry again instead of keeping its old summary until the next version.
        return { subject: { kind: ARTIFACT_SUBJECT_KIND, id: artifactSubjectId(record) }, revision: searchRevisionOf([`${record.version}:${record.content_digest}`, summary]),
          title: record.title, summary, updated_at: record.created_at, content: "summary", open: { surface: "artifacts", id: artifactVersionPath(record) } };
      });
    }),
    bindFileEntriesHandler(artifactsActions.fileEntries, () => {
      const latest = new Map<string, ArtifactVersionRecord>();
      for (const record of ports.artifacts.query.listArtifacts(ports.projectId)) {
        if (record.lifecycle_state !== "active" || record.availability !== "available") continue;
        const current = latest.get(record.artifact_id);
        if (!current || record.version > current.version) latest.set(record.artifact_id, record);
      }
      return [...latest.values()].map(record => ({ subject: { kind: ARTIFACT_SUBJECT_KIND, id: artifactSubjectId(record) },
        revision: `${record.version}:${record.content_digest}`, title: record.title, folder: [ports.typeTitle?.(record.artifact_type_id) ?? record.artifact_type_id],
        media_type: record.media_type, size: record.size_bytes ?? null, updated_at: record.created_at, open: { surface: "artifacts", id: artifactVersionPath(record) } }));
    }),
    bind(artifactsActions.browser, input => readArtifactBrowser(ports.artifacts.query, ports.projectId, input.reference ?? null, input.supported_types)),
    bind(artifactsActions.read, input => readArtifactSelection(ports.artifacts.query, ports.projectId, input.reference, input.supported_types)),
    bind(artifactsActions.export, input => ({ filename: `artifact-v${input.reference.version}.json`, mime: "application/json", content: exportArtifactVersion(ports.artifacts.query, ports.projectId, input.reference) })),
    bind(artifactsActions.importFile, (input, caller) => ports.importDocument(input, caller)),
    bind(artifactsActions.importExternal, (input, caller) => ports.importDocument(input, caller)),
    bind(artifactsActions.importSources, () => ({ sources: ports.importSources(), connections: ports.importConnections?.() ?? [] })),
    bind(artifactsActions.goalEmbeds, input => ({ embeds: readGoalArtifactEmbeds({ projectId: ports.projectId, goalId: input.goal_id, artifacts: ports.artifacts.query, ledger: ports.ledger, supportedTypes: input.supported_types }) })),
    bind(artifactsActions.projectReference, input => ports.openProjectReference(input)),
    bind(artifactsActions.pluginInputs, async input => ({ inputs: await ports.pluginInputs?.(requireUsable(ports, input.reference)) ?? [] })),
    bind(artifactsActions.bindPluginInput, async (input, caller) => {
      const artifact = requireUsable(ports, input.reference);
      if (!ports.bindPluginInput) throw new ActionError("artifacts.unavailable", "这里没有运行中的插件，不能改插件的输入");
      return { inputs: await ports.bindPluginInput(artifact, { plugin_id: input.plugin_id, port: input.port, restore: input.restore === true }, caller) };
    }),
    bind(artifactsActions.links, (input, caller) => {
      const edges = ports.ledger.list({ actor_id: caller.actor_id, scope: { kind: "personal", id: ports.projectId } }).filter(edge => edge.state === "active"
        && edge.target.module === "artifacts" && edge.target.id === input.reference.artifact_id && edge.target.version === input.reference.version);
      const goals = edges.filter(edge => edge.source.module === "goals" && GOAL_ROLES[edge.type])
        .map(edge => ({ goal_id: edge.source.id, title: ports.goalTitle?.(edge.source.id) ?? edge.source.id, role: GOAL_ROLES[edge.type]! }));
      return { goals, other: edges.length - goals.length } satisfies ArtifactReferences;
    }),
    ...bindWorkflowContentHandlers(artifactsContentActions, {
      list: () => ports.artifacts.query.listArtifacts(ports.projectId).filter(record => record.availability === "available" && record.lifecycle_state !== "archived")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(record => ({ item_id: artifactSubjectId(record), title: `${record.title} · v${record.version}`, caption: ports.typeTitle?.(record.artifact_type_id) ?? record.artifact_type_id, at: record.created_at })),
      read: async ({ item_id }, caller) => {
        const reference = parseArtifactSubjectId(item_id);
        const record = reference ? ports.artifacts.query.getArtifactVersion(ports.projectId, reference) : null;
        if (!record || record.availability !== "available") throw new ActionError("actions.subject_unavailable", "这一版不存在或不可用");
        const text = await ports.previewText?.(record, caller as ActionExecutionContext) ?? importedDocumentFile(record)?.text ?? null;
        return { title: record.title, body: text ?? record.title, url: artifactVersionPath(record), source: "成果库" };
      },
    }),
  ];
}
