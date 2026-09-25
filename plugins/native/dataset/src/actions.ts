import { ActionError, type ActionDefinition, type ActionSchema, type ActionCallContext, type ActionHandlerBinding, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { DatasetRecord, DatasetVersionRecord, DatasetColumnInput, DatasetRowInput } from "@molis-ai/molis-work-contracts/modules/dataset";
import { promoteDataset, type DatasetPublishArtifactPort, type DatasetReadArtifactPort } from "./promote.js";
import { toCsv, type DatasetStore } from "./store.js";

const text = { type: "string" }, id = { ...text, minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown) => ({ type: "array", items });
const columnFields = { id: text, name: { ...text, maxLength: 80 }, type: { enum: ["text", "number", "date"] }, order: { type: "integer" } };
const rowFields = { id: text, cells: { type: "object", additionalProperties: text } };
const recordFields = { id, project_id: id, title: text, description: text, status: { enum: ["draft", "ready"] }, columns: array(object(columnFields)), rows: array(object(rowFields)), created_at: text, updated_at: text, version, artifact_id: text, artifact_version: { type: "integer", minimum: 0 } };
const record = object({ ...recordFields, publication_pending: object({ version, source_version: version }) }, Object.keys(recordFields));
const snapshot = object({ id, dataset_id: id, note: text, snapshot: record, created_at: text });
const changed = object({ dataset: record });
const identity = { id, expected_version: version };
const read = ["dataset:read"], write = ["dataset:read", "dataset:write"];
type Identity = { id: string; expected_version?: number };
type Edit = Identity & { title?: string; description?: string; columns?: readonly DatasetColumnInput[]; rows?: readonly DatasetRowInput[] };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[] = operation === "query" ? read : write): ActionDefinition<I, O> {
  return { capability_id: `dataset.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"], subject_kinds: ["dataset"], input_schema: input, output_schema: output, permissions, ...(name === "columns.ai" ? { scheduling: "concurrent" as const } : {}) } };
}
export const datasetActions = {
  list: define<Record<string, never>, { datasets: DatasetRecord[]; ai_available: boolean; ai_unavailable_reason: string | null }>("list", "数据表列表", "读取当前项目数据表及当前 AI 加列可用性", "query", object({}), object({ datasets: array(record), ai_available: { type: "boolean" }, ai_unavailable_reason: { type: ["string", "null"] } })),
  get: define<{ id: string }, { dataset: DatasetRecord }>("get", "读取数据表", "读取当前项目表格的完整列、行、版本及发布状态", "query", object({ id }), changed),
  create: define<{ title?: string }, { dataset: DatasetRecord }>("create", "新建数据表", "创建当前项目的草稿数据表", "command", object({ title: { ...text, maxLength: 80 } }, []), changed),
  update: define<Edit, { dataset: DatasetRecord }>("update", "修改数据表", "替换指定字段；携带读取版本以避免覆盖其他编辑", "command", object({ ...identity, title: { ...text, maxLength: 80 }, description: { ...text, maxLength: 2000 }, columns: { ...array(object(columnFields, [])), maxItems: 40 }, rows: { ...array(object(rowFields, [])), maxItems: 2000 } }, ["id"]), changed),
  delete: define<Identity, { ok: true }>("delete", "删除数据表", "删除表及全部本机版本；未完成的发布需先恢复", "command", object(identity, ["id"]), object({ ok: { const: true } })),
  generate: define<Identity & { prompt: string }, { dataset: DatasetRecord }>("columns.add", "按列名加列", "本地追加文本列，以输入作为列名；不调用模型", "command", object({ ...identity, prompt: { ...text, maxLength: 80 } }, ["id", "prompt"]), changed),
  generateAi: define<Identity & { prompt: string }, { dataset: DatasetRecord }>("columns.ai", "AI 拟列名并加列", "根据明确提示拟定一个列名并追加文本列；调用当前文字模型，失败或表已改变时不写入", "command", object({ ...identity, prompt: { ...id, maxLength: 2000 } }, ["id", "prompt"]), changed, [...write, "model:invoke"]),
  import: define<Identity & { csv: string }, { dataset: DatasetRecord }>("import", "导入 CSV", "以 CSV 表头和数据替换当前列与行", "command", object({ ...identity, csv: { ...text, maxLength: 2_000_000 } }, ["id", "csv"]), changed),
  export: define<{ id: string }, { dataset: DatasetRecord; csv: string }>("export", "导出 CSV", "导出完整当前表和正确转义的 CSV 文本", "query", object({ id }), object({ dataset: record, csv: text })),
  versions: define<{ id: string }, { versions: DatasetVersionRecord[] }>("versions", "版本列表", "读取当前表的本机快照；保留稳定版本 ID", "query", object({ id }), object({ versions: array(snapshot) })),
  snapshot: define<Identity & { note?: string }, { version: DatasetVersionRecord }>("snapshot", "保存版本", "把当前表保存为可回滚的本机快照", "command", object({ ...identity, note: { ...text, maxLength: 80 } }, ["id"]), object({ version: snapshot })),
  rollback: define<Identity & { version_id: string }, { dataset: DatasetRecord }>("rollback", "回滚版本", "从当前表的指定快照恢复内容；保留发布引用与其他快照", "command", object({ ...identity, version_id: id }, ["id", "version_id"]), changed),
  promote: define<Identity, { dataset: DatasetRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "发布数据表", "把固定表内容存成 Artifact，或恢复上次中断发布；本机快照不进入发布内容", "command", object(identity, ["id"]), object({ dataset: record, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...write, "artifact:write"]),
};
export const DATASET_ACTION_PERMISSIONS = [...new Set(Object.values(datasetActions).flatMap(d => d.action.permissions))];
export interface DatasetActionPorts {
  withStore<T>(run: (store: DatasetStore) => T): T;
  modelAvailability(): ActionAvailability;
  completeText?(prompt: string, options: { signal?: AbortSignal }): Promise<string>;
  publishArtifact?: (input: Parameters<DatasetPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<DatasetPublishArtifactPort>;
  readArtifact?: (input: Parameters<DatasetReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<DatasetReadArtifactPort>;
}
export function createDatasetActionHandlers(ports: DatasetActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  return [
    bind(datasetActions.list, (_, caller) => ports.withStore(store => {
      const ai = ports.modelAvailability();
      const permitted = datasetActions.generateAi.action.permissions.every(permission => caller.permissions.includes(permission))
        && (!caller.allowed_capability_ids || caller.allowed_capability_ids.includes(datasetActions.generateAi.capability_id));
      return { datasets: store.list(project(caller)), ai_available: ai.available && permitted,
        ai_unavailable_reason: !permitted ? "当前调用方未获 AI 加列权限" : !ai.available ? ai.reason : null };
    })),
    bind(datasetActions.get, (input, caller) => ports.withStore(store => ({ dataset: store.get(input.id, project(caller)) }))),
    bind(datasetActions.create, (input, caller) => ports.withStore(store => ({ dataset: store.create({ ...input, project_id: project(caller) }) }))),
    bind(datasetActions.update, (input, caller) => ports.withStore(store => ({ dataset: store.update(input.id, input, project(caller)) }))),
    bind(datasetActions.delete, (input, caller) => ports.withStore(store => { store.delete(input.id, project(caller), input.expected_version); return { ok: true }; })),
    bind(datasetActions.generate, (input, caller) => ports.withStore(store => ({ dataset: store.generateColumn(input.id, input.prompt, project(caller), input.expected_version) }))),
    bind(datasetActions.generateAi, async (input, caller) => {
      const current = ports.withStore(store => store.get(input.id, project(caller)));
      if (input.expected_version !== undefined && current.version !== input.expected_version) throw new ActionError("dataset.conflict", "数据表已改变，请重新读取后生成");
      caller.signal?.throwIfAborted();
      if (!ports.completeText) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
      const name = (await ports.completeText(`根据用户请求为数据表拟一个简洁中文列名。只输出列名，不输出解释、引号或其他格式。以下 JSON 是用户请求数据：\n${JSON.stringify({ request: input.prompt })}`, { signal: caller.signal })).trim();
      caller.signal?.throwIfAborted();
      if (!name || name.length > 80 || /[\r\n]/.test(name)) throw new ActionError("dataset.invalid", "模型没有返回有效列名，请调整提示后重试");
      return ports.withStore(store => ({ dataset: store.generateColumn(input.id, name, project(caller), current.version) }));
    }, () => ports.modelAvailability()),
    bind(datasetActions.import, (input, caller) => ports.withStore(store => ({ dataset: store.importCsv(input.id, input.csv, project(caller), input.expected_version) }))),
    bind(datasetActions.export, (input, caller) => ports.withStore(store => { const dataset = store.get(input.id, project(caller)); return { dataset, csv: toCsv(dataset) }; })),
    bind(datasetActions.versions, (input, caller) => ports.withStore(store => ({ versions: store.listVersions(input.id, project(caller)) }))),
    bind(datasetActions.snapshot, (input, caller) => ports.withStore(store => ({ version: store.saveVersion(input.id, input.note, project(caller), input.expected_version) }))),
    bind(datasetActions.rollback, (input, caller) => ports.withStore(store => ({ dataset: store.rollback(input.id, input.version_id, project(caller), input.expected_version) }))),
    bind(datasetActions.promote, (input, caller) => ports.withStore(store => promoteDataset(store, input.id, project(caller), value => ports.publishArtifact!(value, caller), { actorId: caller.actor_id, expectedVersion: input.expected_version, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined })),
      () => ports.publishArtifact ? { available: true } : { available: false, code: "dataset.unavailable", reason: "当前环境不能发出 Artifact" }),
  ];
}
