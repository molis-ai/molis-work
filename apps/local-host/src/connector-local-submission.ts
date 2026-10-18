import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorAuthorizationStatus, retryLocalConnectorAuthorization, cancelConnectorAuthorization } from "./connector-authorization-status.js";
import { bindConnectorAuthorizationInstallation, connectorAuthorizationInstallation } from "./connector-authorization-presentation.js";
import { startConnectorSetupSubmission } from "./connector-setup-submission.js";
import { installManagedConnectorTool, readManagedConnectorTool } from "./connector-tool-install.js";
import { cleanupConnectorInstallation } from "./connector-tool-cleanup.js";
import { localMcpEnvironment } from "./connector-local-mcp.js";
import { connectLocalMcp } from "./connector-local-mcp-setup.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import type { ToolInstallControl } from "./connector-tool-process.js";

/** Both the protected form and credential-free execution action consume the same prepared authority. */
export async function submitLocalMcpSetup(home: string, id: string, environment: Record<string, string> | undefined,
  remember: ConnectorMcpDirectory["remember"], control: ToolInstallControl) {
  const request = connectorAuthorizationStatus(home, id), setup = request?.setup, plan = setup?.local_setup;
  const retained = connectorAuthorizationInstallation(home, id);
  if (environment === undefined && plan && request?.commit_held && ["prepared", "pending"].includes(request.status)) return {
    status: "pending" as const, authorization_id: id, awaiting_intent: true, intent_revision: request.intent_revision,
    reason: "接入因新要求暂缓；请结合最新要求，使用“按最新要求保留或取消接入”确认意图，再继续。",
  };
  if (!setup || !plan || (request?.status !== "prepared" && !(request?.status === "failed" && retained?.ready))) throw connectorErrors["connector.connection.invalid"]("本地接入请求已开始或结束，请查看当前状态");
  if (environment === undefined && plan.environment_names.length) return { status: "needs_person" as const, authorization_id: id, url: `/capabilities/connections?setup=${id}` };
  const values = localMcpEnvironment({ ...plan, executable: "" }, environment ?? {});
  await control.beforeEffect(); control.signal?.throwIfAborted();
  if (request.status === "failed") retryLocalConnectorAuthorization(home, id);
  const pending = startConnectorSetupSubmission(home, id, setup)!;
  let installationId = retained?.id, installationReady = retained?.ready === true;
  const current = async () => {
    await control.beforeEffect(); control.signal?.throwIfAborted(); pending.assertCurrent();
    if (setup.connection_id && withConnectorConnections(home, store => store.get(setup.connection_id!)?.updated_at) !== setup.expected_revision) throw connectorErrors["connector.connection.invalid"]("原连接已变化，请重新准备安装");
  };
  try {
    return await withConnectorRequest(home, id, control.signal, async signal => {
      const installed = plan.source.kind === "executable" ? undefined : retained?.ready ? readManagedConnectorTool(home, retained.id, plan.source) : await installManagedConnectorTool(home, plan.source, {
        signal, beforeEffect: current, onPrepared: value => { installationId = value; bindConnectorAuthorizationInstallation(home, id, value); },
      });
      if (installed) { installationReady = true; bindConnectorAuthorizationInstallation(home, id, installed.id, true); }
      const executable = plan.source.kind === "executable" ? plan.source.executable : installed!.executable;
      const result = await connectLocalMcp(home, { displayName: setup.display_name, environment: values,
        connectionId: setup.connection_id, expectedRevision: setup.expected_revision, installationId,
        launch: { executable, args: plan.args, cwd: plan.cwd, environment_names: plan.environment_names, ...(installed ? { runtime_path: installed.runtime_path } : {}) } },
      { signal, beforeDispatch: current, submission: pending });
      if (result.status === "connected") remember(result.connectionId, result.tools, result.resources);
      return result;
    });
  } catch (error) {
    if (control.signal?.aborted) cancelConnectorAuthorization(home, id); else pending.fail();
    const status = connectorAuthorizationStatus(home, id)?.status;
    if (!installationReady || status !== "failed") cleanupConnectorInstallation(home, installationId);
    if (installationReady && status === "failed") throw connectorErrors["connector.mcp.provider"]("包已安装，但 MCP 启动或能力发现未通过。安装与方案已保留；修复所需条件后可从原接入页面重试验证，原连接未更改");
    throw error;
  }
}
