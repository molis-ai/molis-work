import type { McpToolDefinition } from "./protocol.js";
import { V1_STRING } from "./tool-schemas.js";

export const CONTEXT_TOOLS: McpToolDefinition[] = [
  {
    name: "molis_work_v1_context_resolve",
    description:
      "由统一 Molis Work Skill 显式解析当前 Runtime 宿主提供的稳定工作入口；本工具只读，候选、目录和历史本身都不授权绑定。若用户当前消息已经明确要求用 Molis Work 连接或推进一个已命名项目，且返回的现有项目中只有一个与该指代无歧义匹配，Skill 应直接调用 context_bind，不要让用户重复确认；否则，suggested 时展示候选并询问，unbound 时展示项目列表并询问选择或新建。仅提到项目、含糊表达或宿主线索都不能当成选择。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "molis_work_v1_context_list_projects",
    description:
      "列出 Molis Work 自己管理的项目、当前 Runtime 工作入口状态及宿主建议；不暴露数据库路径，也不创建或修改绑定。给用户展示时只显示项目名，不要展示 project_id 或数据库路径。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "molis_work_v1_context_reject_suggestion",
    description:
      "用户在当前 Runtime 对话明确拒绝一个宿主建议项目后，停止在当前 Session 重复建议它；不绑定、不删除项目，也不影响其他 Session。user_confirmed=true 只能用于用户在当前对话明确说出拒绝（例如「不是这个」）；沉默、超时或含糊回答不能调用本工具。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确拒绝这个候选项目" },
      },
      required: ["project_id", "actor_id", "user_confirmed"],
    },
  },
  {
    name: "molis_work_v1_context_bind",
    description:
      "用户在当前 Runtime 对话明确选择项目后建立关联。普通选择会记录当前目录用过这个项目，但新 Session 仍需询问；有 Session ID 时同时只绑定当前 Session。不保存工作目录默认项目。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确选择此项目" },
        rebind_confirmed: { type: "boolean", description: "已有绑定改到其他项目时，用户已明确确认切换" },
        binding_scope: {
          type: "string",
          enum: ["session"],
          description: "session 只影响当前原生 Session；省略时工作目录关系仅作为候选",
        },
      },
      required: ["project_id", "actor_id", "user_confirmed"],
    },
  },
  {
    name: "molis_work_v1_context_unbind",
    description:
      "用户明确要求后解除关联。默认只移除当前 Session 覆盖；binding_scope=workspace 时移除当前目录与指定项目的长期关联。不会删除项目或数据库。",
    inputSchema: {
      type: "object",
      properties: {
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确要求解除当前工作入口的绑定" },
        binding_scope: { type: "string", enum: ["session", "workspace"] },
        project_id: { type: "string", description: "解除 workspace 关联时必填" },
      },
      required: ["actor_id", "user_confirmed"],
    },
  },
  {
    name: "molis_work_v1_context_create_and_bind",
    description:
      "用户在当前 Runtime 对话明确要求新建项目时，在 Molis Work 自己的数据目录创建项目并绑定当前工作入口；不修改项目文件或 Runtime 配置。调用前必须先向用户复述项目名并取得明确确认。",
    inputSchema: {
      type: "object",
      properties: {
        display_name: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean", description: "当前对话中用户已明确要求创建这个项目" },
        rebind_confirmed: { type: "boolean", description: "已有绑定改到新项目时，用户已明确确认切换" },
        binding_scope: {
          type: "string",
          enum: ["session"],
          description: "只在当前原生 Session 使用；省略时工作目录关系仅作为候选",
        },
        idempotency_key: V1_STRING,
      },
      required: ["display_name", "actor_id", "user_confirmed", "idempotency_key"],
    },
  },
  {
    name: "molis_work_v1_project_delete",
    description:
      "在当前对话获得独立删除确认后，删除一个 Molis Work 托管项目、其绑定和数据库；有有效 Claim 或未结束 Run 时拒绝删除。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: V1_STRING,
        actor_id: V1_STRING,
        delete_confirmed: { type: "boolean", description: "用户已在当前对话单独明确确认删除此项目及其数据库" },
        idempotency_key: V1_STRING,
      },
      required: ["project_id", "actor_id", "delete_confirmed", "idempotency_key"],
    },
  },
];
