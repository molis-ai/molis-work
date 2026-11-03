import { defineErrorCodes, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { prepareConnectorAuthorization, type ConnectorSetupPlan } from "./connector-authorization-status.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { CUSTOM_MCP_SERVICE, mcpEndpointFor } from "./connector-mcp-endpoint.js";
import { MCP_SERVERS } from "./connector-mcp.js";

const errors = defineErrorCodes("connector.setup", { unsupported: "unavailable", invalid: "invalid", changed: "conflict" });
const id = { type: "string", pattern: "^[a-z0-9-]{1,100}$" };

export const connectorSetupAction: ActionDefinition = {
  capability_id: "connectors.setup.prepare", version: 1, operation: "command", action: {
    title: "准备服务接入", description: "根据明确选定的服务和已有方式准备接入，在同一授权记录中保存非敏感方案并给出受保护表单入口。先查看已有连接；候选只表示可能重复，不自动合并账号。凭据只能由本人在表单填写，禁止作为工具参数或聊天内容。准备完成不代表连接成功。",
    scope: "home", audiences: ["user", "agent", "mcp"], subject_kinds: ["connector"], kind: "operation", effect: "write", permissions: ["connectors:management:write"],
    input_schema: { type: "object", properties: {
      service_id: { ...id, description: `取 connectors.methods.read 返回的 connector_id，不填显示名或自拟标识。通用 HTTP/SSE MCP 地址使用 ${CUSTOM_MCP_SERVICE}；传空对象给 methods.read 可列出全部方式。` }, method: { type: "string", enum: ["token", "oauth", "mcp", "cli"] }, display_name: { type: "string", minLength: 1, maxLength: 100 },
      connection_id: { ...id, description: "仅重新授权时填写查询得到的已有连接 id。新建时省略，由系统生成，不填写服务 id 或自拟 id。" }, expected_revision: { type: ["string", "null"], minLength: 1, description: "新连接填 null；重新授权填读取到的原连接修订" }, endpoint: { type: "string", maxLength: 4096 },
      authentication: { type: "string", enum: ["none", "bearer", "oauth"] }, transport: { type: "string", enum: ["http", "sse"] },
    }, required: ["service_id", "method", "display_name", "expected_revision"], additionalProperties: false },
    output_schema: { type: "object", properties: { authorization_id: { type: "string", format: "uuid" }, status: { type: "string" },
      setup: { type: "object" }, url: { type: "string" }, possible_duplicates: { type: "array", items: { type: "object" } } },
      required: ["authorization_id", "status", "setup", "url", "possible_duplicates"], additionalProperties: false },
    result_view: { summary: "接入方案已准备", title_pointer: "/setup/display_name", link: { label: "继续接入", href_template: "/capabilities/connections?setup={/authorization_id}" } },
  },
};

type ConnectorSetupInput = Omit<ConnectorSetupPlan, "expected_revision"> & { expected_revision: string | null };
async function selectedPlan(home: string, input: ConnectorSetupInput): Promise<ConnectorSetupPlan> {
  const service = (await listConnectorSettingsCards(home)).find(row => row.connector_id === input.service_id);
  const method = service?.method_options?.find(row => row.kind === input.method);
  if (!method || !["in_app", "paste"].includes(method.support)) throw errors.unsupported(`所选服务标识或方式没有可执行接入处理器。请向 connectors.methods.read 传入 {}，从完整目录读取 connector_id；通用 HTTP/SSE MCP 地址使用 service_id: ${CUSTOM_MCP_SERVICE}、method: mcp，不需另行登记服务。`);
  if (!input.display_name.trim()) throw errors.invalid("请填写连接名称");
  if (input.method !== "mcp" && [input.endpoint, input.authentication, input.transport].some(value => value !== undefined)) throw errors.invalid("服务地址与 MCP 认证选项只适用于 MCP 接入");
  const endpoint = input.method === "mcp" ? mcpEndpointFor(MCP_SERVERS, input.service_id, input.endpoint) : undefined;
  const server = MCP_SERVERS[input.service_id];
  const authentication = input.service_id === "figma" && endpoint?.startsWith("https:") ? "oauth" : server?.auth;
  if (input.authentication && server && (authentication === "none" && input.authentication !== "none" || authentication === "oauth" && input.authentication !== "oauth" || server.stdio && input.authentication === "oauth")) {
    throw errors.invalid("所选认证方式不适用于该服务的这个地址");
  }
  if (input.connection_id) {
    const previous = withConnectorConnections(home, store => store.require(input.connection_id!, input.service_id));
    if (previous.updated_at !== input.expected_revision) throw errors.changed("原连接已变化，请读取当前修订后重新准备");
    if (previous.auth_method !== input.method || !["token", "oauth"].includes(input.method)) throw errors.invalid("请使用原连接的接入方式；无法验证原账号的 MCP 新授权应单独准备");
  } else if (input.expected_revision) throw errors.invalid("修订必须对应一条已有连接");
  return { service_id: input.service_id, method: input.method, display_name: input.display_name.trim(),
    ...(input.connection_id ? { connection_id: input.connection_id, expected_revision: input.expected_revision! } : {}),
    ...(input.method === "mcp" ? { endpoint,
      ...(input.authentication ? { authentication: input.authentication } : {}), transport: input.transport ?? "http" } : {}) };
}

export function connectorSetupHandler(home: string): ActionHandlerBinding {
  return { capability_id: connectorSetupAction.capability_id, version: 1, handle: async (caller, input) => {
    const plan = await selectedPlan(home, input as ConnectorSetupInput);
    await caller.beforeEffect();
    const request = prepareConnectorAuthorization(home, plan, { actor_id: caller.actor_id, project_id: caller.project_id,
      ...(caller.runtime_session_id ? { runtime_session_id: caller.runtime_session_id } : {}) });
    return { authorization_id: request.id, status: request.status, setup: plan, url: `/capabilities/connections?setup=${request.id}`,
      possible_duplicates: listConnectorConnectionViews(home, plan.service_id).filter(row => row.auth_method === plan.method)
        .map(row => ({ connection_id: row.connection_id, display_name: row.display_name, account_label: row.account_label, state: row.state, enabled: row.enabled })) };
  } };
}

