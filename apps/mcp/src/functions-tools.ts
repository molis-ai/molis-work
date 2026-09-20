import type { McpToolDefinition } from "./protocol.js";
import { V1_STRING } from "./tool-schemas.js";

export const FUNCTIONS_TOOLS: McpToolDefinition[] = [
  {
    name: "molis_work_v1_functions_list",
    description:
      "列出本机已发布的判断函数。先调用本工具再 describe / invoke；不要编造 function_key。草稿不可见。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "molis_work_v1_functions_describe",
    description:
      "读取一个已发布判断函数的输入输出合同与说明。调用前必须先 list，且 function_key 必须来自 list 结果。",
    inputSchema: {
      type: "object",
      properties: {
        function_key: V1_STRING,
      },
      required: ["function_key"],
    },
  },
  {
    name: "molis_work_v1_functions_invoke",
    description:
      "调用一个已发布判断函数。input 是一段文本。返回 status=ok 或 needs_review；needs_review 是完成的判断，不是失败，也不是行动许可。不要因为 ok 就自动做退款或其他副作用。",
    inputSchema: {
      type: "object",
      properties: {
        function_key: V1_STRING,
        input: V1_STRING,
      },
      required: ["function_key", "input"],
    },
  },
];
