import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorProtocolSecrets, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { PRODUCT_VERSION } from "./product-version.js";

export interface LocalMcpLaunch {
  executable: string;
  args: string[];
  cwd: string;
  environment_names: string[];
  runtime_path?: string[];
}
export interface LocalMcpConfiguration extends ConnectorProtocolConfiguration {
  protocol: "mcp";
  transport: "stdio";
  mode: "none" | "environment";
  displayName: string;
  launch: LocalMcpLaunch;
  installation_id?: string;
}
const invalid = () => connectorErrors["connector.mcp.configuration"]("本地 MCP 的程序、参数、工作目录或环境变量无效，请重新准备接入");
// A runtime reads options, module paths and start-up code from its own family of names (JDK_JAVA_OPTIONS, CLASSPATH, PERL5LIB, RUBYLIB,
// PYTHONUSERBASE, NODE_EXTRA_CA_CERTS, DOTNET_STARTUP_HOOKS, PHP_INI_SCAN_DIR, LUA_INIT, NPM_CONFIG_SCRIPT_SHELL…), and new ones appear
// between releases: each family is refused by its prefix, not name by name. ZDOTDIR and GCONV_PATH are one-off shell and glibc start-up
// hooks, so they are named.
const reservedEnvironment = /^(?:PATH|HOME|SHELL|ENV|BASH_ENV|CLASSPATH|_JAVA_OPTIONS|JAVA_.*|JDK_.*|PYTHON.*|PERL.*|RUBY.*|NODE_.*|LD_.*|DYLD_.*|DOTNET_.*|PHP.*|LUA_.*|NPM_CONFIG_.*|ZDOTDIR|GCONV_PATH)$/u;

/** Persist canonical paths, so a later symlink change cannot redirect a previously selected launch. */
export function validateLocalMcpLaunch(input: LocalMcpLaunch): LocalMcpLaunch {
  if (!isAbsolute(input.executable) || !isAbsolute(input.cwd) || input.args.length > 64 || input.args.some(arg => typeof arg !== "string" || arg.length > 8192 || arg.includes("\0"))) throw invalid();
  if (input.environment_names.length > 32 || new Set(input.environment_names).size !== input.environment_names.length || input.environment_names.some(name => !/^[A-Z_][A-Z0-9_]{0,99}$/u.test(name) || reservedEnvironment.test(name))) throw invalid();
  try {
    const executable = realpathSync(input.executable), cwd = realpathSync(input.cwd);
    if (!statSync(executable).isFile() || !statSync(cwd).isDirectory()) throw invalid();
    accessSync(executable, constants.X_OK);
    if (input.runtime_path?.some(path => !isAbsolute(path) || realpathSync(path) !== path || !statSync(path).isDirectory())) throw invalid();
    return { executable, cwd, args: [...input.args], environment_names: [...input.environment_names], ...(input.runtime_path ? { runtime_path: [...input.runtime_path] } : {}) };
  } catch { throw invalid(); }
}

/** Values are accepted only by the protected form and kept in the existing secret owner. */
export function localMcpEnvironment(launch: LocalMcpLaunch, values: Record<string, string>): Record<string, string> {
  if (Object.keys(values).length !== launch.environment_names.length || launch.environment_names.some(name => typeof values[name] !== "string" || !values[name] || values[name].includes("\0") || values[name].length > 65536)) throw invalid();
  return Object.fromEntries(launch.environment_names.map(name => [name, values[name]!]));
}

export async function useLocalMcpClient<T>(config: LocalMcpConfiguration, environment: Record<string, string>,
  options: { signal?: AbortSignal; beforeDispatch?(): void | Promise<void> }, run: (client: Client) => Promise<T>): Promise<{ result: T }> {
  const launch = validateLocalMcpLaunch(config.launch);
  if (launch.executable !== config.launch.executable || launch.cwd !== config.launch.cwd) throw invalid();
  const values = localMcpEnvironment(launch, environment);
  const client = new Client({ name: "molis-work", version: PRODUCT_VERSION }, { capabilities: {} });
  const env = { ...values, ...(launch.runtime_path ? { PATH: [...launch.runtime_path, "/usr/bin", "/bin"].join(delimiter) } : {}) };
  const transport = new StdioClientTransport({ command: launch.executable, args: launch.args, cwd: launch.cwd, env, stderr: "pipe" });
  // Child diagnostics may contain credentials. Drain without logging or returning their bytes.
  transport.stderr?.on("data", () => undefined);
  const abort = () => { void client.close().catch(() => {}); };
  try {
    await options.beforeDispatch?.(); options.signal?.throwIfAborted();
    options.signal?.addEventListener("abort", abort, { once: true });
    await client.connect(transport, { timeout: 30_000, signal: options.signal });
    await options.beforeDispatch?.(); options.signal?.throwIfAborted();
    const result = await run(client);
    await options.beforeDispatch?.(); options.signal?.throwIfAborted();
    return { result };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await client.close().catch(() => {}); // The business result/error already owns the outcome.
  }
}

export function useLocalMcpConnection<T>(home: string, config: LocalMcpConfiguration,
  options: { signal?: AbortSignal; beforeDispatch?(): void | Promise<void> }, run: (client: Client) => Promise<T>) {
  const initial = withConnectorConnections(home, store => store.require(config.connectionId));
  const raw = connectorProtocolSecrets(home, config.connectionId).get("environment");
  const environment: Record<string, string> = raw ? JSON.parse(raw) : {};
  return useLocalMcpClient(config, environment, { signal: options.signal, beforeDispatch: async () => {
    await options.beforeDispatch?.();
    const current = withConnectorConnections(home, store => store.require(config.connectionId));
    if (!current.enabled || current.disconnected_at || current.updated_at !== initial.updated_at) throw connectorErrors["connector.mcp.disconnected"]("本地 MCP 连接已停用或改变，请重新读取");
  } }, run);
}
