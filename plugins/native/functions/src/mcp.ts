import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { FunctionsService } from "./service.js";

/** Declare `tool_id`s here and handle by `tool_id` only. Host stamps the public name. */
export const FUNCTIONS_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = [
  {
    tool_id: "list",
    description:
      "列出本机已发布的判断函数。先调用本工具再 describe / invoke；不要编造 function_key。草稿不可见。",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
    effect: "read",
    audience: "runtime",
    scope: "home",
  },
  {
    tool_id: "describe",
    description:
      "读取一个已发布判断函数的输入输出合同与说明。调用前必须先 list，且 function_key 必须来自 list 结果。",
    input_schema: {
      type: "object",
      properties: {
        function_key: { type: "string" },
      },
      required: ["function_key"],
    },
    effect: "read",
    audience: "runtime",
    scope: "home",
  },
  {
    tool_id: "invoke",
    description:
      "调用一个已发布判断函数。input 是一段文本。返回 status=ok 或 needs_review；needs_review 是完成的判断，不是失败，也不是行动许可。不要因为 ok 就自动做退款或其他副作用。",
    input_schema: {
      type: "object",
      properties: {
        function_key: { type: "string" },
        input: { type: "string" },
      },
      required: ["function_key", "input"],
    },
    effect: "write",
    audience: "runtime",
    scope: "home",
  },
];

export function runFunctionsMcpTool(
  service: FunctionsService,
  request: PluginMcpHandleRequest,
): string | Promise<string> {
  if (request.tool_id === "list") {
    return JSON.stringify({ functions: service.listPublished() }, null, 2);
  }
  if (request.tool_id === "describe") {
    return JSON.stringify({
      function: service.describePublished(stringField(request.arguments.function_key)),
    }, null, 2);
  }
  if (request.tool_id === "invoke") {
    return service.invokePublished(
      stringField(request.arguments.function_key),
      stringField(request.arguments.input),
    ).then((result) => JSON.stringify(result, null, 2));
  }
  throw new Error(`未登记的 Functions MCP：${request.tool_id}`);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}
