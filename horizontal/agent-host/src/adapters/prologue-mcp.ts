import { createHash, randomUUID } from "node:crypto";
import { createPrologueError, isPrologueError, redactMcpError, type ExactRef, type Runtime, type ToolAbort } from "@prologue/sdk";
import { realpath } from "node:fs/promises";
import { realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import type { AgentMcpSourceRef, AgentMcpLibrary, AgentMcpServerInput, AgentMcpServerView, AgentMcpToolDescriptor, AgentMcpToolRef, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewDecisionControl } from "../review-decisions.js";
import type { DispatchControl } from "./prologue-node-kit.js";
import type { HeldMcpTool, McpTransport } from "./prologue-mcp-dispatch.js";

export type HostMcpConnection = string | { credentialRef?: string; revision: string;
  /** Trusted synchronous check of this resolution's original source; never saved in SDK configuration. */
  assertCurrent?: () => void } | null;
export type SaveMcpConnection = (input: { label: string; endpoint: string; secret: string }) => Promise<{ connection_id: string; discard(): void | Promise<void> }>;
const KIND = "molis-mcp";
/** Each configuration has a distinct SDK connection identity; old calls cannot target a replacement. */
export const mcpConnectionId = (ref: AgentMcpSourceRef) => `${ref.server}@${ref.configuration_version}`;
interface Saved extends Omit<AgentMcpServerInput, "auth" | "expected_version">, AgentSkillOwner {
  id: string; credential_ref?: ExactRef<"credential">; auth_connection_id?: string; removed?: boolean;
}
const sameOwner = (a: AgentSkillOwner, b: AgentSkillOwner) => a.project_id === b.project_id && a.plugin_id === b.plugin_id;
function text(value: unknown, label: string, max = 4096) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00\r\n]/.test(value)) throw new Error(`${label}格式无效`);
  return value.trim();
}
function endpoint(value: unknown) {
  const url = new URL(text(value, "MCP 地址"));
  if (url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => /^(auth|authorization|password|secret|token|access_token|refresh_token|api[_-]?key)$/i.test(key))) throw new Error("地址不能包含凭据；请使用独立认证字段");
  if (url.protocol !== "https:" && !isLoopbackHttpUrl(url)) throw new Error("外部 MCP 使用 HTTPS；HTTP 仅用于本机回环地址");
  return url.toString();
}

async function prepareMcpAuthentication(input: AgentMcpServerInput, previous: Saved | undefined, address: string,
  options: { resolveConnection?: (id: string, endpoint: string) => HostMcpConnection | Promise<HostMcpConnection>; saveConnection?: SaveMcpConnection }): Promise<{ connection_id?: string; discard?: () => void | Promise<void> }> {
  if (input.auth?.kind === "none") return {};
  if (input.auth?.kind === "keep-existing") {
    if (previous?.endpoint !== address || !previous.auth_connection_id) throw new Error("地址变化或没有可恢复的旧凭据，请重新输入认证信息");
    return { connection_id: previous.auth_connection_id };
  }
  if (input.auth?.kind === "replace-secret") {
    if (!options.saveConnection) throw new Error("Host 凭据保存服务未装配，请从服务连接入口添加认证");
    return options.saveConnection({ label: input.label, endpoint: address, secret: text(input.auth.secret, "认证信息", 16384) });
  }
  if (input.auth?.kind === "connection") {
    const connection_id = text(input.auth.connection_id, "账号连接", 128);
    if (!options.resolveConnection || !await options.resolveConnection(connection_id, address)) throw new Error("所选 MCP 连接不可用");
    return { connection_id };
  }
  throw new Error("请明确选择认证方式");
}

/** An HTTP server's tools touch no files; the runner still needs an authorized root, so it gets the system temporary directory. */
let temporaryRoot: Promise<string> | undefined;
const callRoot = () => temporaryRoot ??= realpath(tmpdir());

/** SDK invoke.signal cancels approval waits; the runner's public abort port cancels transport work. */
function callAbort(signal: AbortSignal, deadline?: ToolAbort): ToolAbort {
  return {
    requested: () => signal.aborted || deadline?.requested() === true,
    subscribe(listener) {
      const onAbort = () => { void Promise.resolve().then(listener).catch(() => undefined); };
      signal.addEventListener("abort", onAbort, { once: true });
      const stop = deadline?.subscribe(listener);
      if (signal.aborted) onAbort();
      return () => { signal.removeEventListener("abort", onAbort); stop?.(); };
    },
  };
}

async function listMcpConfigurations(runtime: Runtime, view: (saved: Saved, version: number) => AgentMcpServerView) {
  const rows: Array<{ owner: AgentSkillOwner; server: AgentMcpServerView }> = [];let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const listed = await runtime.store.list({ kind: KIND, limit: 100, ...(cursor ? { cursor } : {}) });
    for (const record of listed.records) {
      const saved = record.metadata as unknown as Saved;
      if (!record.tombstoned && !saved.removed) rows.push({ owner: { project_id: saved.project_id, plugin_id: saved.plugin_id }, server: view(saved, record.version) });
    }
    if (!listed.cursor) return rows;cursor = listed.cursor;
  }
  throw new Error("MCP 配置目录过大，无法完整读取");
}

interface McpLibraryOptions {
  withDispatchGuard<T>(guard: DispatchControl, operation: () => Promise<T>): Promise<T>;
  resolveConnection?: (connectionId: string, endpoint: string) => HostMcpConnection | Promise<HostMcpConnection>;
  subscribeConnections?: (listener: (connectionId: string) => void) => () => void;
  saveConnection?: SaveMcpConnection;
  directoryAuthorized?: (projectId: string, directory: string) => Promise<boolean>;
  holdDirectory?: (projectId: string, directory: string) => Promise<(ReviewDecisionControl & { identity: string }) | undefined>;
  credentialRefFor?: (ref: string) => Promise<ExactRef<"credential">>;
}
type Held = { saved: Saved; version: number };
const findConnection = (runtime: Runtime, id: string) => runtime.mcp.list().find(item => item.id === id);

async function heldConfiguration(runtime: Runtime, owner: AgentSkillOwner, id: string): Promise<Held> {
  const record = await runtime.store.get({ kind: KIND, id });
  if (!record || record.tombstoned || record.metadata.removed || !sameOwner(record.metadata as unknown as Saved, owner)) throw new Error("当前项目找不到这个 MCP 配置");
  return { saved: record.metadata as unknown as Saved, version: record.version };
}

async function closeConnections(state: Pick<McpState, "runtime" | "transports" | "withDispatchGuard">, id: string) {
  const { runtime, transports, withDispatchGuard } = state;
  for (const conn of runtime.mcp.list().filter(item => item.id === id || item.id.startsWith(id + "@"))) {
    const transport = transports.get(conn.id);
    transports.delete(conn.id);
    const disconnect = () => runtime.disconnectMcp(conn.ref);
    if (transport) await withDispatchGuard({ beforeEffect: () => {}, assertCurrent: () => {}, mcp: { maintenance: transport } }, disconnect);
    else await disconnect();
    runtime.mcp.remove(conn.ref);
  }
}

function serverView(runtime: Runtime, saved: Saved, version: number, busy: ReadonlyMap<string, { action: string }>, errors: ReadonlyMap<string, string>): AgentMcpServerView {
  const conn = findConnection(runtime, mcpConnectionId({ server: saved.id, configuration_version: version }));
  const tools = conn?.health === "connected" ? runtime.mcp.snapshotOf(conn.ref).tools.map(tool => ({ server: saved.id, tool: tool.name, version: tool.shapeFingerprint, configuration_version: version, description: tool.description })) : [];
  return { id: saved.id, version, label: saved.label, enabled: saved.enabled, transport: saved.transport, timeout_ms: saved.timeout_ms,
    ...(saved.transport === "stdio" ? { directory: saved.directory, executable: saved.executable, argv: saved.argv } : { endpoint: saved.endpoint }),
    credential: saved.credential_ref || saved.auth_connection_id ? "present" : "none",
    ...(saved.auth_connection_id ? { auth_connection_id: saved.auth_connection_id } : {}),
    health: conn?.health ?? "disconnected", tools, resources: conn?.health === "connected" ? [...runtime.mcp.snapshotOf(conn.ref).resources] : [],
    ...(busy.has(saved.id) ? { busy: busy.get(saved.id)!.action } : {}), ...(errors.has(saved.id) ? { error: errors.get(saved.id)! } : {}) };
}

async function resolveHostCredential(options: McpLibraryOptions, saved: Saved) {
  const resolved = await options.resolveConnection?.(saved.auth_connection_id!, saved.endpoint!);
  if (!resolved) throw new Error("所选 MCP 连接不可用，请在服务连接中重新授权");
  const ref = typeof resolved === "string" ? resolved : resolved.credentialRef;
  if (ref && !options.credentialRefFor) throw new Error("MCP 凭据解析不可用");
  const credentialRef = ref ? await options.credentialRefFor!(ref) : undefined;
  const assertCurrent = typeof resolved === "string" ? undefined : resolved.assertCurrent;
  assertCurrent?.();
  return { credentialRef, revision: typeof resolved === "string" ? undefined : resolved.revision, assertCurrent };
}

/** The configuration a save stores, checked per transport; an HTTP server's new credential is handed back to discard if the save fails. */
async function savedConfiguration(owner: AgentSkillOwner, id: string, input: AgentMcpServerInput, previous: Saved | undefined, options: McpLibraryOptions): Promise<{ saved: Saved; discard?: () => void | Promise<void> }> {
  const base = { ...owner, id, label: text(input.label, "名称", 128), enabled: input.enabled, timeout_ms: input.timeout_ms };
  if (input.transport === "stdio") {
    if (!input.directory?.realpath_verified || !input.directory.canonical_path) throw new Error("请指定已授权工作区");
    if (!Array.isArray(input.argv) || input.argv.length > 64 || input.argv.some(arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))) throw new Error("参数必须是最多 64 项的文本数组");
    return { saved: { ...base, transport: "stdio", directory: { ...input.directory }, executable: text(input.executable, "可执行文件"), argv: [...input.argv] } };
  }
  if (input.transport === "http") {
    const address = endpoint(input.endpoint);
    const prepared = await prepareMcpAuthentication(input, previous, address, options);
    return { saved: { ...base, transport: "http", endpoint: address, ...(prepared.connection_id ? { auth_connection_id: prepared.connection_id } : {}) }, discard: prepared.discard };
  }
  throw new Error("不支持这个 MCP 传输方式");
}

/** What connecting and checking a configuration share with the library that owns it. */
interface McpState {
  runtime: Runtime;
  transports: Map<string, McpTransport>;
  linked: Map<string, { account: string; credential?: string; revision?: string }>;
  invalidated: Set<string>;
  held(owner: AgentSkillOwner, id: string): Promise<Held>;
  assertDirectory(saved: Saved): Promise<void>;
  holdDirectory(saved: Saved): Promise<ReviewDecisionControl & { identity?: string }>;
  resolveHost(saved: Saved): ReturnType<typeof resolveHostCredential>;
  withDispatchGuard: McpLibraryOptions["withDispatchGuard"];
  refreshSelected(saved: Saved): Promise<void>;
}

async function connectTransport(state: McpState, transport: McpTransport, dispatch: ReviewDecisionControl,
  connect: () => ReturnType<Runtime["connectMcp"]>) {
  state.transports.set(transport.connection, transport);
  try {
    await dispatch.beforeEffect();
    await state.withDispatchGuard({ ...dispatch, mcp: { maintenance: transport } }, connect);
    dispatch.assertCurrent();
  } catch (error) {
    await closeConnections(state, transport.connection);
    throw error;
  }
}

/** Connect one saved configuration over its transport and adopt its tools; a changed account or a cancel closes it again. */
async function connectConfiguration(state: McpState, { saved }: Held, connectionId: string, abort: AbortController, dispatch: ReviewDecisionControl) {
  const { runtime, linked, invalidated } = state, id = saved.id;
  if (!saved.enabled) throw new Error("请先启用这个 MCP 服务");
  if (findConnection(runtime, connectionId)?.health === "connected") throw new Error("这个 MCP 已连接");
  invalidated.delete(id);
  linked.delete(id);
  const conn = findConnection(runtime, connectionId) ?? runtime.mcp.add({ id: connectionId, label: saved.label, transport: saved.transport, enabled: true, protocolMajor: 1 });
  if (saved.transport === "stdio") {
    const control = await state.holdDirectory(saved);
    const root = await runtime.workspace.authorize({ path: saved.directory!.canonical_path });
    const identity = control.identity && connectionDigest([connectionId, saved.transport, control.identity]);
    const transport: Extract<McpTransport, { kind: "stdio" }> = { source: id, connection: connectionId, kind: "stdio", control, identity, responses: new Map() };
    await connectTransport(state, transport, dispatch,
      () => runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "stdio", rootRef: root.ref,
        executable: saved.executable!, argv: saved.argv!, cwd: ".", requestTimeoutMs: saved.timeout_ms, envAllowlist: [],
        assertResponseCurrent: request => {
          if (request.method !== "tools/call") return;
          const check = transport.responses.get(request.requestId);
          transport.responses.delete(request.requestId);
          if (transport.session !== request.sessionId || !check) throw createPrologueError("EFFECT_NOT_AUTHORIZED", "The original MCP reply is no longer authorized.");
          check();
        },
      } }));
  } else {
    if (saved.credential_ref) throw new Error("这个 MCP 的凭据没有持久保存，请重新填写认证信息或选择已有连接");
    let credentialRef: ExactRef<"credential"> | undefined;
    let sourceCurrent: (() => void) | undefined, revision: string | undefined;
    if (saved.auth_connection_id) {
      linked.set(saved.id, { account: saved.auth_connection_id });
      const host = await state.resolveHost(saved);
      credentialRef = host.credentialRef;
      sourceCurrent = host.assertCurrent;
      revision = host.revision;
      linked.set(saved.id, { account: saved.auth_connection_id, credential: JSON.stringify(credentialRef), revision: host.revision });
    }
    if (invalidated.has(id)) throw new Error("MCP 账号已改变，请重新连接");
    const assertCurrent = () => {
      requireSynchronous(sourceCurrent?.());
      if (invalidated.has(id)) throw new Error("MCP 账号已改变，请重新连接");
    };
    const identity = !saved.auth_connection_id || revision && sourceCurrent
      ? connectionDigest([connectionId, saved.transport, saved.auth_connection_id, revision]) : undefined;
    const transport: McpTransport = { source: id, connection: connectionId, kind: "http", endpoint: saved.endpoint!, credential: credentialRef, identity,
      control: { beforeEffect: assertCurrent, assertCurrent } };
    await connectTransport(state, transport, dispatch,
      () => runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "http", endpoint: saved.endpoint!, requestTimeoutMs: saved.timeout_ms, ...(credentialRef ? { credentialRef } : {}) } }));
  }
  if (invalidated.has(id)) { await closeConnections(state, id); throw new Error("MCP 账号已改变，请重新连接"); }
  if (abort.signal.aborted) { await closeConnections(state, id);throw new Error("连接已取消"); }
  runtime.adoptMcpTools(conn.ref);
}

const connectionDigest = (identity: readonly (string | undefined)[]) => createHash("sha256").update(JSON.stringify(identity)).digest("hex");

function holdMcpTransport(state: McpState, owner: AgentSkillOwner, ref: AgentMcpSourceRef): Promise<McpTransport> {
  return state.held(owner, ref.server).then(({ saved, version }) => {
    const id = mcpConnectionId(ref), transport = state.transports.get(id);
    if (!saved.enabled || version !== ref.configuration_version || !transport || findConnection(state.runtime, id)?.health !== "connected") {
      throw new Error("原 MCP 连接已改变，请重新选择");
    }
    transport.control.assertCurrent();
    return transport;
  });
}

async function holdMcpTool(state: McpState, owner: AgentSkillOwner, ref: AgentMcpToolRef, args: Readonly<Record<string, unknown>>): Promise<HeldMcpTool> {
  const transport = await holdMcpTransport(state, owner, ref);
  const assertCurrent = () => {
    const conn = findConnection(state.runtime, transport.connection);
    if (state.transports.get(transport.connection) !== transport || conn?.health !== "connected"
      || !state.runtime.mcp.snapshotOf(conn.ref).tools.some(tool => tool.name === ref.tool && tool.shapeFingerprint === ref.version)) {
      throw new Error("原 MCP 工具或连接已改变，请重新选择");
    }
    transport.control.assertCurrent();
  };
  const beforeEffect = async () => { assertCurrent(); await transport.control.beforeEffect(); assertCurrent(); };
  assertCurrent();
  return { transport, tool: ref.tool, digest: ref.version, args: structuredClone(args), beforeEffect, assertCurrent };
}

async function validateMcpSources(state: McpState, owner: AgentSkillOwner, selected: readonly AgentMcpSourceRef[]) {
  const resolved: AgentMcpSourceRef[] = [];
  for (const ref of selected) {
    const {saved,version} = await state.held(owner,ref.server);
    if(ref.configuration_version !== version) throw new Error("MCP 服务配置版本已变化，请重新选择资料来源");
    if(!saved.enabled || findConnection(state.runtime, mcpConnectionId(ref))?.health !== "connected") throw new Error("MCP 资料来源已断开或停用，请重新连接");
    await state.refreshSelected(saved);
    resolved.push({server:saved.id,configuration_version:version,server_label:saved.label});
  }
  return resolved;
}

async function validateMcpTools(state: McpState, owner: AgentSkillOwner, selected: readonly AgentMcpToolRef[]) {
  const { runtime } = state, resolved = [];
  for (const ref of selected) {
    const { saved, version } = await state.held(owner, ref.server);
    if (ref.configuration_version !== version) throw new Error("MCP 服务配置版本已变化或未固定，请重新选择");
    const conn = findConnection(runtime, mcpConnectionId(ref));
    if (!saved.enabled || conn?.health !== "connected") throw new Error("选中的 MCP 服务已停用或断开，请重新连接或取消选择");
    await state.assertDirectory(saved);
    await state.refreshSelected(saved);
    const refreshed = findConnection(runtime, mcpConnectionId(ref));
    if (!refreshed || refreshed.health !== "connected") throw new Error("MCP 连接已改变，请重新连接");
    const tool = runtime.mcp.snapshotOf(refreshed.ref).tools.find(tool => tool.name === ref.tool && tool.shapeFingerprint === ref.version);
    if (!ref.version || !tool) throw new Error("MCP 工具形状版本已经变化，请查看新参数并重新选择");
    resolved.push({ server: saved.id, tool: tool.name, version: tool.shapeFingerprint, configuration_version: version, server_label: saved.label });
  }
  return resolved;
}

function connectedTools(runtime: Runtime, servers: readonly AgentMcpServerView[]) {
  const rows: AgentMcpToolDescriptor[] = [];
  for (const server of servers) {
    const conn = server.health === "connected" ? findConnection(runtime, mcpConnectionId({ server: server.id, configuration_version: server.version })) : undefined;
    if (!conn || !server.enabled) continue;
    for (const tool of runtime.mcp.snapshotOf(conn.ref).tools) rows.push({ server: server.id, server_label: server.label, configuration_version: server.version,
      tool: tool.name, version: tool.shapeFingerprint, description: tool.description ?? "", input_schema: structuredClone(tool.inputShape as Record<string, unknown>) });
  }
  return rows;
}

/** Configuration belongs to the project; connection, tools and effects belong to SDK. */
export function createPrologueMcpLibrary(runtime: Runtime, options: McpLibraryOptions) {
  const linked = new Map<string, { account: string; credential?: string; revision?: string }>();
  const transports = new Map<string, McpTransport>();
  const invalidated = new Set<string>();
  const busy = new Map<string, { action: string; abort: AbortController }>();
  const errors = new Map<string, string>();
  const connection = (id: string) => findConnection(runtime, id);
  const held = (owner: AgentSkillOwner, id: string) => heldConfiguration(runtime, owner, id);
  const view = (saved: Saved, version: number) => serverView(runtime, saved, version, busy, errors);
  const close = (id: string) => closeConnections({ runtime, transports, withDispatchGuard: options.withDispatchGuard }, id);
  const unsubscribe = options.subscribeConnections?.(account => {
    for (const [id, link] of linked) if (link.account === account) {
      invalidated.add(id);
      void close(id).catch(() => { errors.set(id, "账号已变更，请重新连接"); });
    }
  });
  const resolveHost = (saved: Saved) => resolveHostCredential(options, saved);
  const refreshSelected = async (saved: Saved, callOptions?: Parameters<AgentMcpLibrary["control"]>[3]) => {
    if (!saved.auth_connection_id) return;
    try {
      if (invalidated.has(saved.id)) throw new Error("MCP 账号已改变，请重新连接");
      const current = await resolveHost(saved);
      const previous = linked.get(saved.id);
      if (!previous || previous.revision !== current.revision) throw new Error("MCP 账号已改变，请重新连接");
      if (previous.credential !== JSON.stringify(current.credentialRef)) {
        await close(saved.id);
        await library.control(saved, saved.id, "connect", callOptions);
      }
      current.assertCurrent?.();
      return current.assertCurrent;
    } catch (error) { await close(saved.id); throw error; }
  };
  const locked = async <T>(id: string, action: string, work: (abort: AbortController) => Promise<T>) => {
    if (busy.has(id)) throw new Error("这个 MCP 正在处理另一项操作，请等待或取消连接");
    const abort = new AbortController();busy.set(id, { action, abort });errors.delete(id);
    try { return await work(abort); }
    catch (error) { const safe = redactMcpError(error);errors.set(id, safe);throw new Error(safe); }
    finally { busy.delete(id); }
  };
  const assertDirectory = async (saved: Saved) => {
    if (saved.transport === "stdio" && options.directoryAuthorized && !await options.directoryAuthorized(saved.project_id, saved.directory!.canonical_path)) throw new Error("MCP 的原工作区已取消授权，请重新配置");
  };
  const holdDirectory = async (saved: Saved) => {
    const directory = saved.directory!.canonical_path;
    if (options.holdDirectory) {
      const control = await options.holdDirectory(saved.project_id, directory);
      if (!control) throw new Error("MCP 的原工作区已取消授权，请重新配置");
      return control;
    }
    const original = statSync(directory, { bigint: true });
    const assertCurrent = () => {
      const current = statSync(directory, { bigint: true });
      if (!current.isDirectory() || current.dev !== original.dev || current.ino !== original.ino || current.birthtimeNs !== original.birthtimeNs
        || realpathSync.native(directory) !== directory) throw new Error("MCP 的原工作区已变化");
    };
    await assertDirectory(saved);
    assertCurrent();
    return { assertCurrent, beforeEffect: async () => { await assertDirectory(saved); assertCurrent(); } };
  };
  const state: McpState = { runtime, transports, linked, invalidated, held, assertDirectory, holdDirectory, resolveHost, withDispatchGuard: options.withDispatchGuard,
    refreshSelected: async saved => { await refreshSelected(saved); } };
  const reconnecting = new Map<string, Promise<void>>();
  const prepare = async (owner: AgentSkillOwner, ref: AgentMcpSourceRef, callOptions: NonNullable<Parameters<NonNullable<AgentMcpLibrary["call"]>>[3]>) => {
    const { saved, version } = await held(owner, ref.server);
    if (ref.configuration_version !== version || !saved.enabled) throw new Error("MCP 配置已变化或已停用，请重新选择");
    await assertDirectory(saved);
    if (connection(mcpConnectionId(ref))?.health !== "connected") {
      let pending = reconnecting.get(saved.id);
      if (!pending) {
        pending = library.control(owner, saved.id, "connect", callOptions).finally(() => reconnecting.delete(saved.id));
        reconnecting.set(saved.id, pending);
      }
      await pending;
    }
    await callOptions.beforeDispatch?.(); await assertDirectory(saved);
  };
  const library: AgentMcpLibrary = {
    catalog: () => listMcpConfigurations(runtime, view),
    async list(owner) { return (await library.catalog!()).filter(entry => sameOwner(entry.owner, owner)).map(entry => entry.server); },
    async save(owner, input) {
      const id = input.id ?? `mcp-${randomUUID()}`;
      return locked(id, "save", async () => {
        const previous = input.id ? await held(owner, id) : undefined;
        if (!Number.isInteger(input.expected_version) || input.expected_version !== (previous?.version ?? 0)) throw new Error("配置已变化，请重新读取后保存");
        if (typeof input.enabled !== "boolean" || !Number.isInteger(input.timeout_ms) || input.timeout_ms < 1000 || input.timeout_ms > 600_000) throw new Error("启用状态或超时无效（1000–600000 毫秒）");
        const { saved, discard } = await savedConfiguration(owner, id, input, previous?.saved, options);
        // Changing configuration first closes the old transport; a failed save never implies it is still connected.
        try {
          await close(id);
          const committed = await runtime.store.commit({ kind: KIND, id, expectedVersion: input.expected_version, metadata: { ...saved } });
          return view(saved, committed.version);
        } catch (error) { await discard?.(); throw error; }
      });
    },
    async control(owner, id, action, callOptions = {}) {
      if (action === "cancel") { await held(owner, id);if (["connect", "refresh"].includes(busy.get(id)?.action ?? "")) busy.get(id)!.abort.abort();return; }
      let assertCurrent: (() => void) | undefined;
      if (action === "refresh") { await callOptions.beforeDispatch?.(); callOptions.signal?.throwIfAborted(); assertCurrent = await refreshSelected((await held(owner, id)).saved, callOptions); }
      await locked(id, action, async abort => {
        const cancelled = () => abort.abort();
        callOptions.signal?.addEventListener("abort", cancelled, { once: true });
        const current = () => {
          if (callOptions.signal?.aborted || abort.signal.aborted) throw createPrologueError("CANCELLED", "MCP connection cancelled before dispatch.");
          requireSynchronous(assertCurrent?.());
        };
        const dispatch: ReviewDecisionControl = { assertCurrent: current, beforeEffect: async () => { await callOptions.beforeDispatch?.(); current(); } };
        try {
        const record = await held(owner, id);
        if (callOptions.expected_version !== undefined && record.version !== callOptions.expected_version) throw new Error("MCP 配置已变化，请重新读取后操作");
        if (action !== "connect") await dispatch.beforeEffect();
        const connectionId = mcpConnectionId({server:id,configuration_version:record.version});
        if (action === "connect") await connectConfiguration(state, record, connectionId, abort, dispatch);
        else if (action === "refresh") {
          if (!record.saved.enabled) throw new Error("请先启用这个 MCP 服务");
          await assertDirectory(record.saved);
          const conn = connection(connectionId);
          const transport = transports.get(connectionId);
          if (conn?.health !== "connected" || !transport) throw new Error("这个 MCP 已断开，请重新连接");
          await options.withDispatchGuard({ ...dispatch, mcp: { maintenance: transport } }, () => runtime.refreshMcp({ ref: conn.ref, signal: abort.signal }));
          await dispatch.beforeEffect(); await assertDirectory(record.saved);
          assertCurrent?.();
          runtime.adoptMcpTools(conn.ref);
        } else if (action === "disconnect") await close(id);
        else if (action === "remove") {
          await close(id);
          await runtime.store.commit({ kind: KIND, id, expectedVersion: record.version, metadata: { ...record.saved, enabled: false, removed: true } });
        } else throw new Error("不支持这个 MCP 操作");
        } finally { callOptions.signal?.removeEventListener("abort", cancelled); }
      });
    },
    validateSources: (owner, selected) => validateMcpSources(state, owner, selected),
    async tools(owner) { return connectedTools(runtime, await library.list(owner)); },
    live(ref) {
      const conn = connection(mcpConnectionId(ref));
      return conn?.health === "connected" && runtime.mcp.snapshotOf(conn.ref).tools.some(tool => tool.name === ref.tool && tool.shapeFingerprint === ref.version);
    },
    call: (...args) => callMcpTool(state, library, prepare, ...args),
    validate: (owner, selected) => validateMcpTools(state, owner, selected),
  };
  return Object.assign(library, {
    holdTransport: (owner: AgentSkillOwner, ref: AgentMcpSourceRef) => holdMcpTransport(state, owner, ref),
    holdTool: (owner: AgentSkillOwner, ref: AgentMcpToolRef, args: Readonly<Record<string, unknown>>) => holdMcpTool(state, owner, ref, args),
    async dispose() {
      unsubscribe?.();
      await Promise.all([...new Set([...transports.values()].map(transport => transport.source))].map(close));
      linked.clear();
    },
  });
}

async function callMcpTool(state: McpState, library: AgentMcpLibrary,
  prepare: (owner: AgentSkillOwner, ref: AgentMcpSourceRef, options: NonNullable<Parameters<NonNullable<AgentMcpLibrary["call"]>>[3]>) => Promise<void>,
  ...[owner, ref, args, callOptions = {}]: Parameters<NonNullable<AgentMcpLibrary["call"]>>
) {
  const { runtime, held, assertDirectory, resolveHost, withDispatchGuard } = state;
  const connection = (id: string) => runtime.mcp.list().find(item => item.id === id);
  let assertSourceCurrent: (() => void) | undefined;
  const assertCurrent = () => {
    // This guard runs before dispatch. Preserve cancellation through the SDK's
    // public error contract; an arbitrary DOM AbortError is otherwise an App denial.
    if (callOptions.signal?.aborted) throw createPrologueError("CANCELLED", "MCP call cancelled before dispatch.");
    requireSynchronous(callOptions.assertCurrent?.());
    requireSynchronous(assertSourceCurrent?.());
  };
  const beforeDispatch = async () => {
    assertCurrent();
    try { await callOptions.beforeDispatch?.(); await assertDirectory((await held(owner, ref.server)).saved); }
    finally { assertCurrent(); }
  };
  return withDispatchGuard({ beforeEffect: beforeDispatch, assertCurrent }, async () => {
    await beforeDispatch();
    const { saved: initial } = await held(owner, ref.server);
    if (initial.auth_connection_id) assertSourceCurrent = (await resolveHost(initial)).assertCurrent;
    assertSourceCurrent?.();
    await prepare(owner, ref, callOptions);
    assertSourceCurrent?.();
    const [checked] = await library.validate(owner, [ref]);
    assertSourceCurrent?.();
    let dispatched = false;
    const tool = { ...await holdMcpTool(state, owner, checked!, args), onDispatch: () => {
      if (dispatched) throw createPrologueError("EFFECT_RECONCILE_REQUIRED", "The original MCP request was already dispatched.");
      dispatched = true;
      callOptions.onBusinessDispatch?.();
    } };
    const { saved } = await held(owner, checked!.server);
    assertSourceCurrent?.();
    const name = `mcp:${mcpConnectionId(checked!)}/${checked!.tool}`;
    // Adopted on connect; adopting again after a reconnect keeps the catalog on the live shape.
    const conn = connection(mcpConnectionId(checked!));
    if (!conn || !runtime.tools.get(name)) runtime.adoptMcpTools(conn!.ref);
    const root = await runtime.workspace.authorize({ path: saved.transport === "stdio" ? saved.directory!.canonical_path : await callRoot() });
    assertSourceCurrent?.();
    const run = runtime.createSystemToolRunner(root.ref);
    const observation = await runtime.createToolInvoker().invoke({
      request: { name, version: checked!.version!, args: { ...args } },
      run: async request => {
        await beforeDispatch();
        try {
          await tool.beforeEffect();
          const result = await withDispatchGuard({ beforeEffect: () => {}, assertCurrent: () => {}, mcp: {
            tool: (name, actual, matches) => name === tool.tool && matches(tool.transport) && isDeepStrictEqual(actual, tool.args) ? tool : undefined,
          } }, () => run(callOptions.signal ? { ...request, abort: callAbort(callOptions.signal, request.abort) } : request));
          try { assertCurrent(); tool.assertCurrent(); }
          catch (error) {
            if (!dispatched) throw error;
            throw createPrologueError("EFFECT_RECONCILE_REQUIRED", "The original MCP request was dispatched but its result can no longer be used.");
          }
          callOptions.onBusinessResult?.("succeeded"); return result;
        } catch (error) {
          if (dispatched) callOptions.onBusinessResult?.(isPrologueError(error) && error.code === "MCP_CALL_FAILED" ? "failed" : "unknown");
          throw error;
        }
      },
      recheck: async () => { await beforeDispatch(); return library.live!(checked!); },
      now: await runtime.readClock(),
      ...(callOptions.signal ? { signal: callOptions.signal } : {}),
      // This call was already authorized by the Molis action directory for its caller (local user, workflow or granted client);
      // the SDK still records it as an external write and runs it through its own chain.
      onAwaiting: effect => {
        if (!effect.pending) return;
        void runtime.readClock().then(clock => runtime.effects.pendings.answer(effect.pending!.ref, { kind: "effect-approval", answer: "allow" }, clock));
      },
    });
    assertSourceCurrent?.();
    return { text: observation.text, truncated: observation.truncated };
  });
}
