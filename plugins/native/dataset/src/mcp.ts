import type { DatasetColumn, DatasetRow } from "@molis-ai/molis-work-contracts/modules/dataset";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DatasetError } from "./error.js";
import { toCsv, type DatasetStore } from "./store.js";

/** Declare `tool_id`s here and handle by `tool_id` only. Host stamps the public name and injects project_id. */
export const DATASET_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = [
  {
    tool_id: "list",
    description: "列出当前绑定项目里的数据表。先 list 再 get / update；不要编造表 id。",
    input_schema: { type: "object", properties: {}, required: [] },
    effect: "read",
  },
  {
    tool_id: "get",
    description: "读取一张数据表的列、行和状态。id 必须来自 list 或 create 的结果。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
  {
    tool_id: "create",
    description: "在当前绑定项目新建一张草稿数据表。",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: [],
    },
    effect: "write",
  },
  {
    tool_id: "update",
    description: "改表标题、说明、列或行。columns / rows 整表替换。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        columns: { type: "array" },
        rows: { type: "array" },
      },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "delete",
    description: "删除数据表及其版本快照。不可恢复。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "generate",
    description: "按提示在表末尾加一列文本列。这是本地 stub，不调用外部模型。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        prompt: { type: "string" },
      },
      required: ["id", "prompt"],
    },
    effect: "write",
  },
  {
    tool_id: "import",
    description: "用 CSV 文本覆盖当前表的列和行。第一行是表头。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        csv: { type: "string" },
      },
      required: ["id", "csv"],
    },
    effect: "write",
  },
  {
    tool_id: "export",
    description: "把当前表导出为 CSV 文本。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
  {
    tool_id: "versions",
    description: "列出一张表的版本快照。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
  {
    tool_id: "snapshot",
    description: "给当前表存一版快照，可选短备注。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        note: { type: "string" },
      },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "rollback",
    description: "把表滚回 versions 里的某一版。version_id 必须来自 versions。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        version_id: { type: "string" },
      },
      required: ["id", "version_id"],
    },
    effect: "write",
  },
];

export function runDatasetMcpTool(
  store: DatasetStore,
  request: PluginMcpHandleRequest,
  projectId: string,
): string {
  if (request.tool_id === "list") {
    return dump({ datasets: store.list(projectId) });
  }
  if (request.tool_id === "get") {
    return dump({ dataset: store.get(idOf(request), projectId) });
  }
  if (request.tool_id === "create") {
    return dump({ dataset: store.create({ title: optionalString(request.arguments.title), project_id: projectId }) });
  }
  if (request.tool_id === "update") {
    return dump({
      dataset: store.update(idOf(request), {
        title: optionalString(request.arguments.title),
        description: optionalString(request.arguments.description),
        columns: optionalColumns(request.arguments.columns),
        rows: optionalRows(request.arguments.rows),
      }, projectId),
    });
  }
  if (request.tool_id === "delete") {
    store.delete(idOf(request), projectId);
    return dump({ ok: true });
  }
  if (request.tool_id === "generate") {
    return dump({
      dataset: store.generateColumn(idOf(request), requiredString(request.arguments.prompt, "加列提示"), projectId),
    });
  }
  if (request.tool_id === "import") {
    return dump({
      dataset: store.importCsv(idOf(request), requiredString(request.arguments.csv, "CSV"), projectId),
    });
  }
  if (request.tool_id === "export") {
    const dataset = store.get(idOf(request), projectId);
    return dump({ csv: toCsv(dataset), dataset });
  }
  if (request.tool_id === "versions") {
    return dump({ versions: store.listVersions(idOf(request), projectId) });
  }
  if (request.tool_id === "snapshot") {
    return dump({ version: store.saveVersion(idOf(request), optionalString(request.arguments.note), projectId) });
  }
  if (request.tool_id === "rollback") {
    return dump({
      dataset: store.rollback(idOf(request), requiredString(request.arguments.version_id, "版本 id"), projectId),
    });
  }
  throw new Error(`未登记的 Dataset MCP：${request.tool_id}`);
}

function dump(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function idOf(request: PluginMcpHandleRequest): string {
  return requiredString(request.arguments.id, "数据表 id");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DatasetError("dataset.invalid", `缺少${label}`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new DatasetError("dataset.invalid", "字段须为文字");
  return value;
}

function optionalColumns(value: unknown): DatasetColumn[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DatasetError("dataset.invalid", "列须是列表");
  return value as DatasetColumn[];
}

function optionalRows(value: unknown): DatasetRow[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DatasetError("dataset.invalid", "行须是列表");
  return value as DatasetRow[];
}
