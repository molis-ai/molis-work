import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { prepareConnectorAuthorization } from "./connector-authorization-status.js";
import { cliSetupPlan, installPreparedCli, connectPreparedCli, type CliSetupInput } from "./connector-cli-setup.js";

const text = { type: "string", minLength: 1, maxLength: 4096 };
const metadata = { scope: "home", audiences: ["user", "agent", "mcp"], subject_kinds: ["connector"], kind: "operation", effect: "write", permissions: ["connectors:management:write"] } as const;
const request = { type: "object", properties: { authorization_id: { type: "string", format: "uuid" } }, required: ["authorization_id"], additionalProperties: false };
export const connectorCliActions = {
  prepare: { capability_id: "connectors.cli.prepare", version: 1, operation: "command", action: { ...metadata,
    title: "准备官方 CLI 安装", scheduling: "concurrent", description: "按已有适配的正式包或原生发布源准备固定版本。npm、Python、Microsoft Graph 必须另选运行时版本；原生客户端固定官方校验和。先检查已有客户端；此动作不安装或登录。npm/Python 可明确选择包源，默认官方。",
    input_schema: { type: "object", properties: { service_id: text, display_name: { ...text, maxLength: 100 }, version: text, runtime_version: text, registry: text }, required: ["service_id", "display_name", "version"], additionalProperties: false },
    output_schema: { type: "object" }, result_view: { summary: "客户端安装方案已准备", title_pointer: "/setup/display_name", link: { label: "继续接入", href_template: "/capabilities/connections?setup={/authorization_id}" } },
  } } as ActionDefinition,
  install: { capability_id: "connectors.cli.install", version: 1, operation: "command", action: { ...metadata,
    title: "安装已准备的官方 CLI", description: "只按已明确获准的请求 id 安装固定客户端与所需运行时。保留安装并返回本人登录入口，安装成功不代表账号授权完成。重复执行不重新安装已完成的包。",
    scheduling: "concurrent", execution: { cost: "unknown" }, input_schema: request, output_schema: { type: "object" },
  } } as ActionDefinition,
  connect: { capability_id: "connectors.cli.connect", version: 1, operation: "command", action: { ...metadata,
    title: "验证 CLI 账号并完成接入", description: "本人在官方 CLI 登录后，按原请求检查真实账号并保存连接；不会在工具参数接收凭据。失败保留已完成安装，可从同一请求重试。",
    scheduling: "concurrent", execution: { cost: "unknown" }, input_schema: request, output_schema: { type: "object" },
  } } as ActionDefinition,
};
export function connectorCliHandlers(home: string): ActionHandlerBinding[] {
  return [
    { capability_id: connectorCliActions.prepare.capability_id, version: 1, handle: async (caller, input) => {
      await caller.beforeEffect();
      const setup = await cliSetupPlan(home, input as CliSetupInput, caller.signal); await caller.beforeEffect();
      const prepared = prepareConnectorAuthorization(home, setup, { actor_id: caller.actor_id, project_id: caller.project_id, ...(caller.runtime_session_id ? { runtime_session_id: caller.runtime_session_id } : {}) });
      return { authorization_id: prepared.id, setup, status: prepared.status, url: `/capabilities/connections?setup=${prepared.id}` };
    } },
    ...(["install", "connect"] as const).map(operation => ({ capability_id: connectorCliActions[operation].capability_id, version: 1,
      handle: (caller, input) => (operation === "install" ? installPreparedCli : connectPreparedCli)(home, (input as { authorization_id: string }).authorization_id, { signal: caller.signal, beforeEffect: caller.beforeEffect }),
    } satisfies ActionHandlerBinding)),
  ];
}
