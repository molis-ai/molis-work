import type { ActionCallContext, ActionDefinition, ActionHandlerBinding, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactConsumerType, ArtifactReference, ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { readArtifactBrowser, readArtifactSelection, exportArtifactVersion, type ArtifactBrowserView } from "./browser.js";
import { readGoalArtifactEmbeds, type GoalArtifactEmbed } from "./goal-context.js";
import type { ExternalDocumentSource } from "./document-import.js";

import { text, id, version, object, array, nullable, reference, consumerTypes, record } from "./action-schemas.js";
const selection = { selected: nullable(record), requested: nullable(reference), compatibility: nullable(object({ artifact: reference,
  consumable: { type: "boolean" }, reason: { enum: ["compatible_consumer", "consumer_missing", "artifact_unavailable", "artifact_archived"] } })) };
const browser = object({ versions: array(record), ...selection });
const imported = object({ artifact_id: id, version, reused: { type: "boolean" }, url: text, warnings: array(text) });
const sources = { enum: ["notion", "feishu", "lark", "google-docs"] };
const read = ["artifacts:read"], write = [...read, "artifacts:write"];
export interface ArtifactFileImport { source: "file"; filename: string; content: string; title?: string }
export interface ArtifactExternalImport { source: ExternalDocumentSource; url: string }
export interface ArtifactImportResult { artifact_id: string; version: number; reused: boolean; url: string; warnings: string[] }
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions = read): ActionDefinition<I, O> {
  return { capability_id: `artifacts.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences: ["user", "agent", "workflow", "mcp"], permissions, subject_kinds: ["artifact"], input_schema: input, output_schema: output } };
}
export const artifactsActions = {
  browser: define<{ reference?: ArtifactReference | null; supported_types?: ArtifactConsumerType[] }, ArtifactBrowserView>("browse", "浏览项目成果", "读取当前项目全部成果版本及指定的固定版本；保留原生产方、正文和可用状态", "query",
    object({ reference: nullable(reference), supported_types: consumerTypes }, []), browser),
  read: define<{ reference: ArtifactReference; supported_types?: ArtifactConsumerType[] }, Omit<ArtifactBrowserView, "versions">>("read", "读取固定成果版本", "按准确身份和版本读取成果及兼容性，不自动替换成最新版本", "query",
    object({ reference, supported_types: consumerTypes }, ["reference"]), object(selection)),
  export: define<{ reference: ArtifactReference }, { filename: string; mime: string; content: string }>("export", "导出成果版本", "导出原成果记录为 JSON，不注册新版本或改变发布状态", "query", object({ reference }), object({ filename: text, mime: text, content: text })),
  importFile: define<ArtifactFileImport, ArtifactImportResult>("import.file", "导入本地文档", "将上传的 Markdown、TXT 或 HTML 文本保存为个人成果快照；同内容重复导入重用原版本", "command",
    object({ source: { const: "file" }, filename: { ...text, minLength: 1, maxLength: 255 }, content: { ...text, description: "UTF-8 文本，解码后最多 2 MB" }, title: { ...text, maxLength: 500 } }, ["source", "filename", "content"]), imported, write),
  importExternal: define<ArtifactExternalImport, ArtifactImportResult>("import.external", "导入外部文档", "使用当前 Home 已连接的文档账号读取链接，保存个人快照；不写回来源，不自动同步", "command",
    object({ source: sources, url: { ...text, minLength: 1, maxLength: 4096 } }), imported, [...write, "connectors:document:read"]),
  importSources: define<Record<string, never>, { sources: Record<string, boolean> }>("import.sources", "文档来源连接状态", "查看文档导入支持来源是否已连接，不返回凭据", "query", object({}), object({ sources: { type: "object", additionalProperties: { type: "boolean" } } })),
  goalEmbeds: define<{ goal_id: string; supported_types?: ArtifactConsumerType[] }, { embeds: GoalArtifactEmbed[] }>("goals.embeds", "读取目标成果引用", "读取原 Ledger 明确关联的输入和输出及固定版本，保留失效引用，不猜测关系", "query", object({ goal_id: id, supported_types: consumerTypes }, ["goal_id"]),
    object({ embeds: array(object({ relationship: { enum: ["input", "output"] }, view: browser })) })),
  projectReference: define<{ reference: string; evidence_id?: string | null }, { filename: string; content_base64: string }>("references.open", "打开项目结果引用", "通过受限读取器读取 project:// 或历史相对路径引用；已验证 Evidence 的原工作区优先，不接受调用者提供目录", "query",
    object({ reference: id, evidence_id: nullable(id) }, ["reference"]), object({ filename: text, content_base64: text }), [...read, "workspace:read"]),
};
export const ARTIFACT_ACTIONS: readonly ActionDefinition[] = Object.values(artifactsActions);
export const ARTIFACT_ACTION_PERMISSIONS = [...new Set(ARTIFACT_ACTIONS.flatMap(value => value.action.permissions))];
export interface ArtifactActionPorts {
  boardId: string;
  artifacts: ArtifactsApplicationApi;
  ledger: ContextLedgerApi["query"];
  importDocument(input: ArtifactFileImport | ArtifactExternalImport, caller: ActionCallContext, definition: ActionDefinition): Promise<ArtifactImportResult>;
  importSources(): Record<string, boolean>;
  openProjectReference(input: { reference: string; evidence_id?: string | null }): Promise<{ filename: string; content_base64: string }>;
}
export function createArtifactActionHandlers(ports: ArtifactActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, run: (input: I, caller: ActionCallContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => run(input as I, caller),
  });
  return [
    bind(artifactsActions.browser, input => readArtifactBrowser(ports.artifacts.query, ports.boardId, input.reference ?? null, input.supported_types)),
    bind(artifactsActions.read, input => readArtifactSelection(ports.artifacts.query, ports.boardId, input.reference, input.supported_types)),
    bind(artifactsActions.export, input => ({ filename: `artifact-v${input.reference.version}.json`, mime: "application/json", content: exportArtifactVersion(ports.artifacts.query, ports.boardId, input.reference) })),
    bind(artifactsActions.importFile, (input, caller) => ports.importDocument(input, caller, artifactsActions.importFile)),
    bind(artifactsActions.importExternal, (input, caller) => ports.importDocument(input, caller, artifactsActions.importExternal)),
    bind(artifactsActions.importSources, () => ({ sources: ports.importSources() })),
    bind(artifactsActions.goalEmbeds, input => ({ embeds: readGoalArtifactEmbeds({ boardId: ports.boardId, goalId: input.goal_id, artifacts: ports.artifacts.query, ledger: ports.ledger, supportedTypes: input.supported_types }) })),
    bind(artifactsActions.projectReference, input => ports.openProjectReference(input)),
  ];
}
