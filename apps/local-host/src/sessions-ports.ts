import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import {
  EXTERNAL_SESSION_NATIVE_ID_PATTERN,
  EXTERNAL_TOOLS,
  type ExternalToolEntry,
  type ExternalToolId,
  type ExternalToolPath,
} from "@molis-ai/molis-work-contracts/platform/external-tools";
import { fencedMaterials, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { ExternalSessionConnectionChoice } from "@molis-ai/molis-work-contracts/services/sessions";
import {
  EXTERNAL_SESSION_SUGGESTION_REASON_MAX_CHARS,
  externalSessionConnectionRoute,
  sessionsErrors,
} from "@molis-ai/molis-work-contracts/services/sessions";
import type { PrologueStructuredRequest } from "@molis-ai/molis-work-service-agent-host";
import {
  identifySessionDirectory,
  sessionSourceFailure,
  type SessionAttributionSuggester,
  type SessionCommandResult,
  type SessionDirectoryIdentity,
  type SessionProjectSnapshot,
  type SessionServiceRequest,
  type SessionServiceResponse,
  type SessionSuggestDraft,
  type SessionSuggestInput,
  type SessionsPorts,
} from "@molis-ai/molis-work-service-sessions";
import { SESSIONS_SUGGEST } from "./agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { CONNECTOR_CLIS } from "./connector-cli.js";
import { managedCliLaunch } from "./connector-cli-launch.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { refreshRefused } from "./connector-refresh-refusals.js";
import { hostTextGeneration, type HostTextGeneration } from "./host-complete-text.js";
import { createHostCodexProtocolsPort } from "./sessions-codex-rpc.js";
import { createHostSessionFilesPort } from "./sessions-file-roots.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const VERSION_TIMEOUT_MS = 8_000;
const VERSION_MAX_BUFFER_BYTES = 256 * 1024;

interface CliProtocolRecord extends ConnectorProtocolConfiguration {
  protocol: "cli";
  fingerprint: string;
  binary: string;
  installation_id?: string;
}

export interface HostSessionsOptions {
  homeRoot?: string;
  env?: NodeJS.ProcessEnv;
  commandPath?: string;
  clock?: () => Date;
  textGeneration?: () => HostTextGeneration | undefined;
  onGitFileRead?: (filePath: string) => void;
  ports?: Partial<SessionsPorts>;
}

function findTool(entryId: ExternalToolId): ExternalToolEntry | undefined {
  return EXTERNAL_TOOLS.find(item => item.id === entryId);
}

function declaredReadTemplates(tool: ExternalToolEntry): readonly (readonly string[])[] {
  const templates: (readonly string[])[] = [];
  for (const route of [tool.sessions.discover, tool.sessions.list, tool.sessions.read, tool.sessions.search]) {
    if (route && route.via === "command") templates.push(route.argv);
  }
  return templates;
}

function matchesTemplateArg(templateArg: string, actualArg: string): boolean {
  if (actualArg.includes("\0")) return false;
  if (templateArg === "{session_id}") {
    return !actualArg.startsWith("-") && EXTERNAL_SESSION_NATIVE_ID_PATTERN.test(actualArg);
  }
  if (templateArg === "{query}") {
    const trimmed = actualArg.trim();
    return trimmed.length > 0 && actualArg.length <= 400 && !trimmed.startsWith("-");
  }
  return templateArg === actualArg;
}

/** S-sessions-read-only-commands: verifies `argv` comes strictly from declared read-only routes in `EXTERNAL_TOOLS`. */
export function assertReadOnlyToolArgv(tool: ExternalToolEntry, argv: readonly string[]): void {
  const matched = declaredReadTemplates(tool).some(
    template => template.length === argv.length && template.every((arg, index) => matchesTemplateArg(arg, argv[index]!)),
  );
  if (!matched) {
    throw sessionsErrors.not_allowed("外部会话只允许执行登记表声明的只读命令");
  }
}

function findExecutableOnPath(commands: readonly string[], searchPath: string): string | null {
  for (const name of commands) {
    if (!name || name.includes("/") || name.includes("\\") || name.includes("\0")) continue;
    for (const dir of searchPath.split(path.delimiter)) {
      if (!dir) continue;
      const candidate = path.join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue PATH scan.
      }
    }
  }
  return null;
}

function declaredEnvKeysForTool(tool: ExternalToolEntry): string[] {
  const keys = new Set<string>();
  const collect = (spec: ExternalToolPath | null | undefined): void => {
    if (spec?.env) keys.add(spec.env);
  };
  collect(tool.data_root);
  for (const route of [tool.sessions.discover, tool.sessions.list, tool.sessions.read]) {
    if (route && "root" in route) collect(route.root);
  }
  if (externalSessionConnectionRoute(tool)?.via === "cli") {
    keys.add("GH_CONFIG_DIR");
    keys.add("GH_HOST");
  }
  return [...keys];
}

function minimalToolEnv(
  tool: ExternalToolEntry,
  homeRoot: string,
  searchPath: string,
  sourceEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { PATH: searchPath, HOME: homeRoot, NO_COLOR: "1" };
  for (const safeKey of ["USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "SystemRoot", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME"]) {
    const val = sourceEnv[safeKey];
    if (typeof val === "string" && !val.includes("\0")) out[safeKey] = val;
  }
  for (const toolKey of declaredEnvKeysForTool(tool)) {
    const val = sourceEnv[toolKey];
    if (typeof val === "string" && !val.includes("\0")) out[toolKey] = val;
  }
  return out;
}

async function resolveVerifiedToolBinary(
  tool: ExternalToolEntry,
  explicitCommand: string | undefined,
  homeRoot: string,
  searchPath: string,
  sourceEnv: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ binary: string; env: NodeJS.ProcessEnv }> {
  signal.throwIfAborted();
  const candidates = explicitCommand
    ? [explicitCommand]
    : (tool.detect?.commands?.length ? tool.detect.commands : tool.terminal ? [tool.terminal.command] : []);
  const found = findExecutableOnPath(candidates, searchPath);
  if (!found) {
    throw sessionSourceFailure("tool_missing", `本机未找到 ${tool.display_name} 可执行文件`, false);
  }

  let realBinary: string;
  try {
    realBinary = await fs.realpath(found);
  } catch {
    throw sessionSourceFailure("tool_missing", `无法解析 ${tool.display_name} 可执行文件路径`, false);
  }

  if (tool.detect?.real_path_pattern && !new RegExp(tool.detect.real_path_pattern, "u").test(realBinary)) {
    throw sessionSourceFailure("tool_missing", `${tool.display_name} 可执行文件路径不匹配已核对的发行形态`, false);
  }

  const childEnv = minimalToolEnv(tool, homeRoot, searchPath, sourceEnv);
  if (tool.detect?.version_argv && tool.detect.version_pattern) {
    let versionOut = "";
    try {
      const res = await execFileAsync(realBinary, [...tool.detect.version_argv], {
        timeout: VERSION_TIMEOUT_MS, maxBuffer: VERSION_MAX_BUFFER_BYTES, cwd: homeRoot, env: childEnv, signal, windowsHide: true,
      });
      versionOut = `${res.stdout}\n${res.stderr}`;
    } catch (error) {
      signal.throwIfAborted();
      const err = error as { killed?: boolean; code?: string | number };
      if (err.killed || err.code === "ETIMEDOUT") {
        throw sessionSourceFailure("timed_out", `检查 ${tool.display_name} 版本超时`, true);
      }
      throw sessionSourceFailure("version_mismatch", `无法读取 ${tool.display_name} 版本信息`, false);
    }
    if (!new RegExp(tool.detect.version_pattern, "u").test(versionOut)) {
      throw sessionSourceFailure("version_mismatch", `${tool.display_name} 当前版本输出不匹配已核对格式`, false);
    }
  }
  return { binary: realBinary, env: childEnv };
}

async function runExecFileCapture(
  binary: string,
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<SessionCommandResult> {
  signal.throwIfAborted();
  try {
    const res = await execFileAsync(binary, [...argv], {
      timeout: COMMAND_TIMEOUT_MS, maxBuffer: COMMAND_MAX_BUFFER_BYTES, cwd, env, signal, windowsHide: true,
    });
    return { stdout: res.stdout, stderr: res.stderr, exit_code: 0 };
  } catch (error) {
    signal.throwIfAborted();
    const err = error as { code?: string | number; killed?: boolean; stdout?: string; stderr?: string };
    if (err.killed || err.code === "ETIMEDOUT") {
      throw sessionSourceFailure("timed_out", "外部工具命令执行超时", true);
    }
    if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw sessionSourceFailure("read_error", "外部工具命令输出超出大小上限", false);
    }
    if (typeof err.code === "number") {
      return {
        stdout: typeof err.stdout === "string" ? err.stdout : "",
        stderr: typeof err.stderr === "string" ? err.stderr : "",
        exit_code: err.code,
      };
    }
    throw sessionSourceFailure("read_error", "外部工具命令执行失败", true);
  }
}

function cliServiceForBinary(binary: string): string | null {
  for (const [serviceId, spec] of Object.entries(CONNECTOR_CLIS)) {
    if (spec.binary === binary) return serviceId;
  }
  return null;
}

function computeCliFingerprint(serviceId: string, parsedIdentity: unknown): string | null {
  if (!parsedIdentity || typeof parsedIdentity !== "object" || Array.isArray(parsedIdentity)) return null;
  const obj = parsedIdentity as Record<string, unknown>;
  const data = (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data) ? obj.data : obj) as Record<string, unknown>;
  const stable = data.id ?? data.user_id ?? data.login ?? data.username ?? data.email;
  if (!stable || (typeof stable === "string" && !stable.trim())) return null;
  return createHash("sha256").update(JSON.stringify([serviceId, stable])).digest("hex");
}

function createHostConnectionsPort(
  homeDirectory: string,
  homeRoot: string,
  searchPath: string,
  sourceEnv: NodeJS.ProcessEnv,
): SessionsPorts["connections"] {
  return {
    current(connectionId: string): { enabled: boolean; account_label?: string | null } | null {
      const row = withConnectorConnections(homeDirectory, store => store.get(connectionId), true);
      if (!row) return null;
      const oauthRefused = row.auth_method === "oauth" && refreshRefused(homeDirectory, row);
      return { enabled: Boolean(row.enabled && !row.disconnected_at && !oauthRefused), account_label: row.account_label };
    },
    choices(tool: ExternalToolEntry): { choices: ExternalSessionConnectionChoice[]; connect_service_id: string | null } {
      const route = externalSessionConnectionRoute(tool);
      if (!route) return { choices: [], connect_service_id: null };
      const serviceId = route.via === "service" ? route.service_id : cliServiceForBinary(route.program);
      if (!serviceId) return { choices: [], connect_service_id: null };
      const rows = withConnectorConnections(
        homeDirectory,
        store => store.list().filter(item => item.service_id === serviceId && (route.via === "cli" ? item.auth_method === "cli" : item.auth_method !== "cli")),
        true,
      ) ?? [];
      const choices: ExternalSessionConnectionChoice[] = rows
        .filter(row => Boolean(row.enabled && !row.disconnected_at && !(row.auth_method === "oauth" && refreshRefused(homeDirectory, row))))
        .map(row => ({
          connection_id: row.connection_id,
          display_name: row.display_name || row.connection_id,
          account_label: row.account_label ?? null,
        }));
      return { choices, connect_service_id: serviceId };
    },
    async request(_connectionId: string, _request: SessionServiceRequest, _signal: AbortSignal): Promise<SessionServiceResponse> {
      throw sessionSourceFailure("read_error", "当前没有使用直连 HTTP 会话接口的外部工具适配", false);
    },
    async command(connectionId: string, entry: ExternalToolId, argv: readonly string[], signal: AbortSignal): Promise<SessionCommandResult> {
      const tool = findTool(entry);
      if (!tool) throw sessionsErrors.source_unsupported(`未知的外部工具：${entry}`);
      assertReadOnlyToolArgv(tool, argv);

      const connection = withConnectorConnections(homeDirectory, store => store.get(connectionId), true);
      if (!connection) throw sessionSourceFailure("connection_removed", "所选服务连接已不存在", false);
      if (!connection.enabled || connection.disconnected_at || connection.auth_method !== "cli") {
        throw sessionSourceFailure("login_expired", "所选官方 CLI 连接已停用或已断开", false);
      }
      const config = withConnectorProtocols(homeDirectory, store => store.get<CliProtocolRecord>(connectionId), true);
      if (!config || config.protocol !== "cli") {
        throw sessionSourceFailure("login_expired", "请重新连接官方 CLI", false);
      }
      const cliSpec = CONNECTOR_CLIS[connection.service_id];
      if (!cliSpec || cliSpec.binary !== config.binary) {
        throw sessionSourceFailure("login_expired", "官方 CLI 连接配置无效", false);
      }

      const launch = config.installation_id ? managedCliLaunch(homeDirectory, config.installation_id) : undefined;
      const effectiveSearchPath = launch?.executable ? `${path.dirname(launch.executable)}${path.delimiter}${searchPath}` : searchPath;
      const effectiveEnv = launch?.environment ? { ...sourceEnv, ...launch.environment } : sourceEnv;
      const { binary, env } = await resolveVerifiedToolBinary(tool, cliSpec.binary, homeRoot, effectiveSearchPath, effectiveEnv, signal);
      const cwd = launch?.cwd ?? homeRoot;

      const verifyIdentityFingerprint = async (): Promise<void> => {
        const currentConn = withConnectorConnections(homeDirectory, store => store.get(connectionId), true);
        if (!currentConn) throw sessionSourceFailure("connection_removed", "读取期间服务连接已被移除", false);
        if (!currentConn.enabled || currentConn.disconnected_at || currentConn.updated_at !== connection.updated_at) {
          throw sessionSourceFailure("login_expired", "读取期间服务连接状态已变化", false);
        }
        const idRes = await runExecFileCapture(binary, cliSpec.identity, cwd, env, signal);
        if (idRes.exit_code !== 0) throw sessionSourceFailure("login_expired", `${cliSpec.binary} 登录已失效，请重新登录`, false);
        let parsed: unknown;
        try {
          parsed = JSON.parse(idRes.stdout);
        } catch {
          throw sessionSourceFailure("login_expired", `无法验证 ${cliSpec.binary} 当前登录账号`, false);
        }
        const fingerprint = computeCliFingerprint(connection.service_id, parsed);
        if (!fingerprint || fingerprint !== config.fingerprint) {
          throw sessionSourceFailure("account_changed", `${cliSpec.binary} 当前登录账号已切换，请重新核对连接`, false);
        }
      };

      await verifyIdentityFingerprint();
      const cmdRes = await runExecFileCapture(binary, argv, cwd, env, signal);
      await verifyIdentityFingerprint();
      return cmdRes;
    },
  };
}

function buildSuggestionOutputSchema(groupCount: number, projectCount: number) {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        maxItems: Math.max(1, groupCount),
        items: {
          type: "object",
          properties: {
            group: { type: "integer", minimum: 0, maximum: Math.max(0, groupCount - 1) },
            project: {
              anyOf: [
                { type: "integer", minimum: 0, maximum: Math.max(0, projectCount - 1) },
                { type: "null" },
              ],
            },
            alternatives: {
              type: "array",
              maxItems: 3,
              items: { type: "integer", minimum: 0, maximum: Math.max(0, projectCount - 1) },
            },
            reason: { type: "string", maxLength: EXTERNAL_SESSION_SUGGESTION_REASON_MAX_CHARS },
            evidence: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["directory", "title", "message"] },
                  text: { type: "string", maxLength: 200 },
                },
                required: ["kind", "text"],
                additionalProperties: false,
              },
            },
          },
          required: ["group", "project", "alternatives", "reason", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  } satisfies NonNullable<PrologueStructuredRequest["schema"]>;
}

export function createHostSessionsSuggester(
  homeDirectory: string,
  generation: () => HostTextGeneration | undefined = () => hostTextGeneration({ homeDirectory }),
): () => SessionAttributionSuggester | null {
  return () => {
    const generate = generation();
    if (!generate) return null;
    return {
      promptVersion: () => SESSIONS_SUGGEST.version,
      async suggest(input: SessionSuggestInput, signal: AbortSignal, beforeDispatch?: () => void | Promise<void>): Promise<SessionSuggestDraft> {
        if (input.groups.length === 0 || input.projects.length === 0) return { items: [] };
        const outputSchema = buildSuggestionOutputSchema(input.groups.length, input.projects.length);
        const wrapped = instructed(SESSIONS_SUGGEST, fencedMaterials(input, `MATERIALS_${randomUUID()}`));
        const prompt = resolveModelPrompt(homeDirectory, wrapped, SESSIONS_SUGGEST.prompt_id);
        const result = await generate(prompt, {
          structured: { mode: "local", name: "session_attribution_suggestions", schema: outputSchema },
          signal, timeoutMs: 30_000, maxOutputTokens: 1200, beforeDispatch,
        });
        result.validateResult();
        signal.throwIfAborted();
        if (!compileActionSchema(outputSchema)(result.structured)) {
          throw new Error("模型未返回合格式的外部会话归属建议");
        }
        return result.structured as SessionSuggestDraft;
      },
    };
  };
}

export function createHostSessionsPorts(
  homeDirectory: string,
  catalogRunner: () => LocalWebCatalogRunner | undefined,
  onSearchChanged: () => void,
  options: HostSessionsOptions = {},
): SessionsPorts {
  const homeRoot = path.resolve(options.homeRoot ?? os.homedir());
  const sourceEnv = options.env ?? process.env;
  const searchPath = options.commandPath ?? sourceEnv.PATH ?? "";

  const defaultPorts: SessionsPorts = {
    files: createHostSessionFilesPort(homeRoot, sourceEnv),
    commands: {
      async run(entry: ExternalToolId, argv: readonly string[], signal: AbortSignal): Promise<SessionCommandResult> {
        const tool = findTool(entry);
        if (!tool) throw sessionsErrors.source_unsupported(`未知的外部工具：${entry}`);
        assertReadOnlyToolArgv(tool, argv);
        const { binary, env } = await resolveVerifiedToolBinary(tool, undefined, homeRoot, searchPath, sourceEnv, signal);
        return runExecFileCapture(binary, argv, homeRoot, env, signal);
      },
    },
    protocols: createHostCodexProtocolsPort({
      homeRoot,
      searchPath,
      sourceEnv,
      resolveBinary: (tool, envWithRoot, signal) =>
        resolveVerifiedToolBinary(tool, undefined, homeRoot, searchPath, envWithRoot, signal),
    }),
    connections: createHostConnectionsPort(homeDirectory, homeRoot, searchPath, sourceEnv),
    projects: {
      async read<T>(operation: (snapshot: SessionProjectSnapshot) => T): Promise<T> {
        const runner = catalogRunner();
        if (!runner) return operation({ directories: [], projects: [], bindings: [] });
        return runner({ homeDirectory }, catalog =>
          operation({
            directories: catalog.listWorkspaceDirectory(),
            projects: catalog.listProjects().map(project => ({ project_id: project.project_id, display_name: project.display_name })),
            bindings: catalog.listRuntimeContextBindings(),
          }),
        );
      },
    },
    directories: {
      identify(dirPath: string): SessionDirectoryIdentity | null {
        return identifySessionDirectory(dirPath, {
          homeDir: homeRoot,
          ...(options.onGitFileRead ? { onFileRead: options.onGitFileRead } : {}),
        });
      },
    },
    suggester: createHostSessionsSuggester(homeDirectory, options.textGeneration),
    searchChanged: onSearchChanged,
    ...(options.clock ? { clock: options.clock } : {}),
  };

  return {
    ...defaultPorts,
    ...options.ports,
  };
}
