import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { CONNECTOR_CLIS, connectCli } from "./connector-cli.js";
import { connectorAuthorizationStatus, retryLocalConnectorAuthorization, type ConnectorSetupPlan } from "./connector-authorization-status.js";
import { bindConnectorAuthorizationInstallation, connectorAuthorizationInstallation } from "./connector-authorization-presentation.js";
import { startConnectorSetupSubmission } from "./connector-setup-submission.js";
import { managedCliLaunch } from "./connector-cli-launch.js";
import { runToolInstallProcess } from "./connector-tool-process.js";
import { installManagedConnectorTool, readManagedConnectorTool } from "./connector-tool-install.js";
import { exactToolVersion, validateManagedToolSource } from "./connector-tool-source.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import type { ToolInstallControl } from "./connector-tool-process.js";

export interface CliSetupInput { service_id: string; display_name: string; version: string; runtime_version?: string; registry?: string }
export async function cliSetupPlan(home: string, input: CliSetupInput, signal?: AbortSignal): Promise<ConnectorSetupPlan> {
  if (!exactToolVersion(input.version)) throw connectorErrors["connector.connection.invalid"]("请选择正式客户端的固定版本");
  const cli = Object.hasOwn(CONNECTOR_CLIS, input.service_id) ? CONNECTOR_CLIS[input.service_id] : undefined, distribution = cli?.distribution;
  if (!distribution) throw connectorErrors["connector.connection.invalid"]("此 CLI 需要原生发行物或额外模块；请查看该客户端的正式安装条件");
  if (!input.display_name.trim() || input.display_name.length > 100) throw connectorErrors["connector.connection.invalid"]("请填写连接名称");
  if ((distribution.kind === "native" || distribution.kind === "powershell") && input.registry) throw connectorErrors["connector.connection.invalid"]("原生客户端只从此适配已声明的官方发布源安装");
  const source = validateManagedToolSource(distribution.kind === "native" ? await distribution.resolve(input.version, signal) : distribution.kind === "powershell" ? await distribution.resolve(input.version, input.runtime_version ?? "", signal) : { ...distribution, bin: cli.binary, version: input.version, registry: input.registry,
    ...(distribution.kind === "npm" ? { kind: "npm", node_version: input.runtime_version ?? "" } : { kind: "python", python_version: input.runtime_version ?? "" }) });
  return { service_id: input.service_id, display_name: input.display_name.trim(), method: "cli", cli_setup: source,
    installation: { platform: process.platform, architecture: process.arch, directory: join(realpathSync(home), "runtime", "connectors"), requires_credentials: false } };
}

export function preparedCliRequest(home: string, id: string, service?: string) {
  const request = connectorAuthorizationStatus(home, id), setup = request?.setup;
  if (!setup || setup.method !== "cli" || service && service !== setup.service_id || !(request.status === "prepared" || request.status === "failed" && request.installation_ready)) throw connectorErrors["connector.connection.invalid"]("CLI 接入请求已开始、取消或过期，请查看当前状态");
  return { request, setup };
}
export function cliRequestInstallation(home: string, id: string, service: string): string | undefined {
  const { setup } = preparedCliRequest(home, id, service);
  if (!setup.cli_setup) return undefined;
  const installed = connectorAuthorizationInstallation(home, id);
  if (!installed?.ready) throw connectorErrors["connector.connection.invalid"]("请先完成本次 CLI 安装");
  return installed.id;
}

export async function installPreparedCli(home: string, id: string, control: ToolInstallControl) {
  const { request, setup } = preparedCliRequest(home, id);
  if (!setup.cli_setup) throw connectorErrors["connector.connection.invalid"]("此请求没有 CLI 安装方案");
  await control.beforeEffect(); control.signal?.throwIfAborted();
  if (request.installation_ready && request.status === "prepared") return { status: "needs_person", authorization_id: id, url: `/capabilities/connections?setup=${id}` };
  if (request.status === "failed") retryLocalConnectorAuthorization(home, id);
  const retained = connectorAuthorizationInstallation(home, id);
  const pending = startConnectorSetupSubmission(home, id, setup)!;
  try {
    await withConnectorRequest(home, id, control.signal, async signal => {
      const installed = retained?.ready ? readManagedConnectorTool(home, retained.id, setup.cli_setup!) : await installManagedConnectorTool(home, setup.cli_setup!, { signal,
        beforeEffect: async () => { await control.beforeEffect(); pending.assertCurrent(); },
        onPrepared: value => bindConnectorAuthorizationInstallation(home, id, value),
      });
      pending.assertCurrent(); bindConnectorAuthorizationInstallation(home, id, installed.id, true);
      const launch = managedCliLaunch(home, installed.id);
      const version = await runToolInstallProcess(launch.executable, [...(CONNECTOR_CLIS[setup.service_id]!.version ?? ["--version"])], {
        signal, beforeEffect: async () => { await control.beforeEffect(); pending.assertCurrent(); }, cwd: launch.cwd, env: launch.environment, stage: "验证已安装的 CLI", timeout: 15_000,
      });
      const exact = setup.cli_setup!.version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      if (!new RegExp(`(^|[^0-9])${exact}([^0-9]|$)`, "u").test(version)) {
        const actual = /(?:^|\s)v?(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)/u.exec(version)?.[1];
        throw connectorErrors["connector.connection.invalid"](actual ? `客户端实际版本为 ${actual}，与所选 ${setup.cli_setup!.version} 不符；安装已保留，请重新核对方案` : "客户端未确认所选版本；安装已保留，请核对该版本的运行条件");
      }
      pending.assertCurrent(); pending.installed();
    });
    return { status: "needs_person", authorization_id: id, url: `/capabilities/connections?setup=${id}` };
  } catch (error) { pending.fail(); throw error; }
}

/** A real account check consumes the same prepared request after the person finishes the official CLI login. */
export async function connectPreparedCli(home: string, id: string, control: ToolInstallControl, service?: string) {
  const previous = connectorAuthorizationStatus(home, id);
  if (previous?.setup?.method !== "cli" || service && previous.setup.service_id !== service) throw connectorErrors["connector.connection.invalid"]("CLI 账号与本次接入请求不同");
  await control.beforeEffect(); control.signal?.throwIfAborted();
  if (previous.status === "connected") return { status: "connected", connection: withConnectorConnections(home, store => store.view(store.require(previous.connection_id))) };
  const { request, setup } = preparedCliRequest(home, id), installationId = cliRequestInstallation(home, id, setup.service_id);
  await control.beforeEffect(); control.signal?.throwIfAborted();
  if (request.status === "failed") retryLocalConnectorAuthorization(home, id);
  const pending = startConnectorSetupSubmission(home, id, setup)!;
  try {
    return await withConnectorRequest(home, id, control.signal, signal => connectCli(home, { serviceId: setup.service_id, displayName: setup.display_name, installationId }, signal,
      async () => { await control.beforeEffect(); pending.assertCurrent(); }, completion => { pending.assertCurrent(); return pending.submit(completion); }));
  } catch (error) { pending.fail(); throw error; }
}
