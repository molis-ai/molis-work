import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { prepareConnectorAuthorization, requireConnectorInitiator } from "./connector-authorization-status.js";
import { localMcpSetupPlan, type LocalMcpSetupInput } from "./connector-local-mcp-plan.js";
import { removeManagedConnectorTool } from "./connector-tool-install.js";
import { submitLocalMcpSetup } from "./connector-local-submission.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

const text = { type: "string", minLength: 1, maxLength: 4096 };
const packageFields = { package: text, version: text, bin: text, registry: text };
const metadata = { scope: "home", audiences: ["user", "agent", "mcp"], subject_kinds: ["connector"], kind: "operation", effect: "write", permissions: ["connectors:management:write"] } as const;
export const connectorLocalActions = {
  cleanup: { capability_id: "connectors.local.cleanup", version: 1, operation: "command", action: { ...metadata,
    title: "清理未使用的安装", description: "重试清理连接移除或更新后遗留的受管理安装，只接受安装 id。仍被连接引用时返回 in-use，不删除用户程序、共享运行时或工作文件。",
    input_schema: { type: "object", properties: { installation_id: { type: "string", format: "uuid" } }, required: ["installation_id"], additionalProperties: false }, output_schema: { type: "object" },
  } } as ActionDefinition,
  prepare: { capability_id: "connectors.local.prepare", version: 1, operation: "command", action: { ...metadata,
    title: "准备本地 MCP 安装或更新", description: "为已明确选定的本地程序、固定 npm/Python 包与运行时版本准备接入。先查看已有连接。新建由系统分配连接 id：省略 connection_id，expected_revision 传 null；更新才传查询得到的已有连接 id 和修订。参数和环境变量名不得包含凭据，密钥仅由本人在受保护页面填写。返回来源、版本、目录和本人步骤；此动作不安装、不运行程序。",
    input_schema: { type: "object", properties: {
      display_name: { ...text, maxLength: 100 },
      connection_id: { type: "string", format: "uuid", description: "仅更新时填写查询得到的已有连接 id。新建时省略，由系统生成，不自拟 id。" },
      expected_revision: { type: ["string", "null"], description: "新建传 null；更新传该连接查询结果的 revision。" },
      source: { oneOf: [
        { type: "object", properties: { kind: { const: "executable" }, executable: text }, required: ["kind", "executable"], additionalProperties: false },
        { type: "object", properties: { kind: { const: "npm" }, ...packageFields, node_version: text }, required: ["kind", "package", "version", "bin", "node_version"], additionalProperties: false },
        { type: "object", properties: { kind: { const: "python" }, ...packageFields, python_version: text }, required: ["kind", "package", "version", "bin", "python_version"], additionalProperties: false },
      ] }, args: { type: "array", maxItems: 64, items: { type: "string", maxLength: 8192 } }, cwd: text,
      environment_names: { type: "array", maxItems: 32, uniqueItems: true, items: { type: "string", pattern: "^[A-Z_][A-Z0-9_]{0,99}$" } },
    }, required: ["display_name", "expected_revision", "source", "args", "cwd", "environment_names"], additionalProperties: false },
    output_schema: { type: "object" }, result_view: { summary: "本地接入方案已准备", title_pointer: "/setup/display_name", link: { label: "继续接入", href_template: "/capabilities/connections?setup={/authorization_id}" } },
  } } as ActionDefinition,
  execute: { capability_id: "connectors.local.execute", version: 1, operation: "command", action: { ...metadata,
    title: "执行已准备的本地 MCP 接入", description: "按已准备且明确获准的来源、版本、目录安装并验证 MCP，成功后注册到共同目录。安装已完成但验证失败时，使用同一 id 从验证继续；只接受方案 id；需要凭据时返回本人页面，不在工具参数收密钥。更新先验证候选，失败保留原连接。不会执行业务工具。",
    scheduling: "concurrent", execution: { cost: "unknown" },
    input_schema: { type: "object", properties: { authorization_id: { type: "string", format: "uuid" } }, required: ["authorization_id"], additionalProperties: false }, output_schema: { type: "object" },
  } } as ActionDefinition,
};
export function connectorLocalHandlers(home: string, remember: ConnectorMcpDirectory["remember"]): ActionHandlerBinding[] {
  return [
    { capability_id: connectorLocalActions.cleanup.capability_id, version: 1, handle: async (caller, input) => {
      await caller.beforeEffect();
      return { status: removeManagedConnectorTool(home, (input as { installation_id: string }).installation_id) };
    } },
    { capability_id: connectorLocalActions.prepare.capability_id, version: 1, handle: async (caller, input) => {
      const setup = localMcpSetupPlan(home, input as LocalMcpSetupInput);
      await caller.beforeEffect();
      const request = prepareConnectorAuthorization(home, setup, { actor_id: caller.actor_id, project_id: caller.project_id,
        ...(caller.runtime_session_id ? { runtime_session_id: caller.runtime_session_id } : {}) });
      return { authorization_id: request.id, status: request.status, setup, url: `/capabilities/connections?setup=${request.id}` };
    } },
    { capability_id: connectorLocalActions.execute.capability_id, version: 1, handle: (caller, input) => {
      const id = (input as { authorization_id: string }).authorization_id;
      requireConnectorInitiator(home, id, caller);
      return submitLocalMcpSetup(home, id, undefined, remember, { signal: caller.signal, beforeEffect: caller.beforeEffect });
    } },
  ];
}
