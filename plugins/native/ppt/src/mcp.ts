import type { PptSlide } from "@molis-ai/molis-work-contracts/modules/ppt";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PptError } from "./error.js";
import type { PptStore } from "./store.js";

/** Declare `tool_id`s here and handle by `tool_id` only. Host stamps the public name and injects project_id. */
export const PPT_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = [
  {
    tool_id: "list",
    description: "列出当前绑定项目里的演示稿。先 list 再 get / update；不要编造演示稿 id。",
    input_schema: { type: "object", properties: {}, required: [] },
    effect: "read",
  },
  {
    tool_id: "get",
    description: "读取一份演示稿的主题色和幻灯片。id 必须来自 list 或 create 的结果。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
  {
    tool_id: "create",
    description: "在当前绑定项目新建一份演示稿，默认带一页空白幻灯片。",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: [],
    },
    effect: "write",
  },
  {
    tool_id: "update",
    description: "改演示稿标题、说明、主题色或幻灯片。slides 整表替换。不导出 PPTX。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        color_primary: { type: "string" },
        color_background: { type: "string" },
        color_text: { type: "string" },
        slides: { type: "array" },
      },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "delete",
    description: "删除演示稿。不可恢复。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
];

export function runPptMcpTool(
  store: PptStore,
  request: PluginMcpHandleRequest,
  projectId: string,
): string {
  if (request.tool_id === "list") {
    return dump({ presentations: store.list(projectId) });
  }
  if (request.tool_id === "get") {
    return dump({ presentation: store.get(idOf(request), projectId) });
  }
  if (request.tool_id === "create") {
    return dump({ presentation: store.create({ title: optionalString(request.arguments.title), project_id: projectId }) });
  }
  if (request.tool_id === "update") {
    return dump({
      presentation: store.update(idOf(request), {
        title: optionalString(request.arguments.title),
        description: optionalString(request.arguments.description),
        color_primary: optionalString(request.arguments.color_primary),
        color_background: optionalString(request.arguments.color_background),
        color_text: optionalString(request.arguments.color_text),
        slides: optionalSlides(request.arguments.slides),
      }, projectId),
    });
  }
  if (request.tool_id === "delete") {
    store.delete(idOf(request), projectId);
    return dump({ ok: true });
  }
  throw new Error(`未登记的 PPT MCP：${request.tool_id}`);
}

function dump(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function idOf(request: PluginMcpHandleRequest): string {
  return requiredString(request.arguments.id, "演示稿 id");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PptError("ppt.invalid", `缺少${label}`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new PptError("ppt.invalid", "字段须为文字");
  return value;
}

function optionalSlides(value: unknown): PptSlide[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new PptError("ppt.invalid", "幻灯片须是列表");
  return value as PptSlide[];
}
