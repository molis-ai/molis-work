import { defineErrorCodes, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { noProjectMcp, listProjectMcpConnections, manageProjectMcp, type ProjectMcpManagementPort } from "./connector-project-mcp.js";
import { controlConnectorConnection } from "./connector-management-service.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { cancelConnectorAuthorization, connectorAuthorizationStatus } from "./connector-authorization-status.js";
import { inspectMcpConnection } from "./connector-mcp.js";
import { inspectApiConnection } from "./connector-access.js";
import { inspectCliConnection } from "./connector-cli.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

const managementErrors = defineErrorCodes("connector.management", { authorization_unknown: "not_found", changed: "conflict" });

export const CONNECTOR_MANAGEMENT_READ = "connectors:management:read";
export const CONNECTOR_MANAGEMENT_WRITE = "connectors:management:write";
const serviceFilter = { type: "object", properties: { service_id: { type: "string", pattern: "^[a-z0-9-]{1,100}$" } }, additionalProperties: false };
const authorizationInput = { type: "object", properties: { authorization_id: { type: "string", format: "uuid" } }, required: ["authorization_id"], additionalProperties: false };
const output = { type: "object" };
const metadata = { scope: "home", audiences: ["user", "agent", "mcp"], subject_kinds: ["connector"] } as const;

/** Management exists before a connection or project exists. It never accepts or returns credentials. */
export const connectorManagementActions = {
  catalog: { capability_id: "connectors.methods.read", version: 1, operation: "query", action: { ...metadata,
    title: "查询服务接入方式", description: "读取产品已有的连接方式、本人前置条件和正式入口。in_app 是已有处理器，external 只是说明链接；账号验证不等于业务操作可用。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ], input_schema: serviceFilter, output_schema: output } } as ActionDefinition,
  list: { capability_id: "connectors.connections.read", version: 1, operation: "query", action: { ...metadata,
    title: "查看服务连接", description: "列出本人已有服务连接和账号标签。记录中的 connected 表示保存的授权状态；是否此刻连通须调用检查连接，不能把保存配置当成调用成功。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ], input_schema: serviceFilter, output_schema: output } } as ActionDefinition,
  check: { capability_id: "connectors.connection.check", version: 1, operation: "query", action: { ...metadata,
    title: "检查服务连接", description: "检查所选连接的真实账号或 MCP 握手与能力；刷新共同目录。只作连接与身份检查，不执行服务业务工具或业务写入。失败保留原任务和连接，不换账号。",
    kind: "query", effect: "read", scheduling: "concurrent", permissions: [CONNECTOR_MANAGEMENT_READ],
    input_schema: { type: "object", properties: { connection_id: { type: "string", pattern: "^[a-z0-9-]{1,100}$" } }, required: ["connection_id"], additionalProperties: false }, output_schema: output } } as ActionDefinition,
  control: { capability_id: "connectors.connection.control", version: 1, operation: "command", action: { ...metadata,
    title: "启用、停用或移除连接", description: "按明确的连接和读取到的修订操作。停用保留凭据；移除只清理本产品持有的配置和凭据，保留业务成果，不表示已撤销服务端授权。启用后检查连接再使用。",
    kind: "operation", effect: "write", scheduling: "concurrent", permissions: [CONNECTOR_MANAGEMENT_WRITE],
    input_schema: { type: "object", properties: { connection_id: { type: "string", pattern: "^[a-z0-9-]{1,100}$" }, expected_revision: { type: "string", minLength: 1 }, action: { type: "string", enum: ["enable", "disable", "remove"] } }, required: ["connection_id", "expected_revision", "action"], additionalProperties: false }, output_schema: output } } as ActionDefinition,
  authorization: { capability_id: "connectors.authorization.read", version: 1, operation: "query", action: { ...metadata,
    title: "查看接入授权状态", description: "按本次授权请求 id 读取真实状态。关闭登录页不取消授权；connected 只表示连接提交，不能据此认定原任务完成。等待可由任务运行时检查此只读状态，不持续请求模型。",
    kind: "query", effect: "read", permissions: [CONNECTOR_MANAGEMENT_READ], input_schema: authorizationInput, output_schema: output } } as ActionDefinition,
  cancel: { capability_id: "connectors.authorization.cancel", version: 1, operation: "command", action: { ...metadata,
    title: "取消这次接入授权", description: "仅取消指定的待提交授权请求。已提交则如实返回 connected，不删除已有连接，不撤销服务端已独立授予的权限，也不停止其他任务。",
    kind: "operation", effect: "write", permissions: [CONNECTOR_MANAGEMENT_WRITE], input_schema: authorizationInput, output_schema: output } } as ActionDefinition,
};

export function connectorManagementHandlers(home: string, remember: ConnectorMcpDirectory["remember"], projectMcp: ProjectMcpManagementPort = noProjectMcp): ActionHandlerBinding[] {
  const binding = (definition: ActionDefinition, handle: ActionHandlerBinding["handle"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle });
  const authorization = (id: string) => {
    const result = connectorAuthorizationStatus(home, id);
    if (!result) throw managementErrors.authorization_unknown("授权记录已失效，请重新发起接入");
    return result;
  };
  return [
    binding(connectorManagementActions.catalog, (_caller, input) => {
      const id = (input as { service_id?: string }).service_id;
      return { services: listConnectorSettingsCards().filter(entry => !id || entry.connector_id === id) };
    }),
    binding(connectorManagementActions.list, async (_caller, input) => {
      const service = (input as { service_id?: string }).service_id;
      const projects = !service || service === "mcp-bearer" ? await listProjectMcpConnections(projectMcp) : [];
      const revisions = withConnectorConnections(home, store => new Map(store.list(service).map(row => [row.connection_id, row.updated_at])));
      return { connections: [...listConnectorConnectionViews(home, service).map(row => ({ ...row, revision: revisions.get(row.connection_id) })), ...projects] };
    }),
    binding(connectorManagementActions.check, async (caller, input) => {
      const id = (input as { connection_id: string }).connection_id;
      if (id.startsWith("mcp-")) return manageProjectMcp(projectMcp, caller, { connection_id: id, action: "check" });
      const row = withConnectorConnections(home, store => store.require(id));
      await caller.beforeEffect();
      if (row.auth_method === "mcp") {
        const result = await inspectMcpConnection(home, id, { signal: caller.signal });
        await caller.beforeEffect();
        remember(id, result.tools, result.resources);
        return { connection_id: id, checked_at: new Date().toISOString(), ...result };
      }
      const result = row.auth_method === "cli" ? await inspectCliConnection(home, id) : await inspectApiConnection(home, id);
      await caller.beforeEffect();
      return { connection_id: id, checked_at: new Date().toISOString(), ...result };
    }),
    binding(connectorManagementActions.control, async (caller, input) => {
      const command = input as { connection_id: string; expected_revision: string; action: "enable" | "disable" | "remove" };
      if (command.connection_id.startsWith("mcp-")) return manageProjectMcp(projectMcp, caller, command);
      await caller.beforeEffect();
      const current = withConnectorConnections(home, store => store.require(command.connection_id));
      if (current.updated_at !== command.expected_revision) throw managementErrors.changed("连接已变化，请重新读取后操作");
      return controlConnectorConnection(home, command.connection_id, command.action);
    }),
    binding(connectorManagementActions.authorization, (_caller, input) => authorization((input as { authorization_id: string }).authorization_id)),
    binding(connectorManagementActions.cancel, async (caller, input) => {
      const id = (input as { authorization_id: string }).authorization_id;
      authorization(id); await caller.beforeEffect();
      return cancelConnectorAuthorization(home, id)!;
    }),
  ];
}
