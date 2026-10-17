import { randomUUID } from "node:crypto";
import { createPrologueError, isPrologueError, redactMcpError, type ExactRef, type Runtime, type ToolAbort } from "@prologue/sdk";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AgentMcpSourceRef, AgentMcpLibrary, AgentMcpServerInput, AgentMcpServerView, AgentMcpToolDescriptor, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";

export type HostMcpConnection = string | { credentialRef?: string; revision: string } | null;
export type SaveMcpConnection = (input: { label: string; endpoint: string; secret: string }) => Promise<{ connection_id: string; discard(): void | Promise<void> }>;
const KIND = "molis-mcp";
/** Each configuration has a distinct SDK connection identity; old calls cannot target a replacement. */
export const mcpConnectionId = (ref: AgentMcpSourceRef) => ref.configuration_version === undefined ? ref.server : `${ref.server}@${ref.configuration_version}`;
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

/** Configuration belongs to the project; connection, tools and effects belong to SDK. */
export function createPrologueMcpLibrary(runtime: Runtime, options: {
  withDispatchGuard<T>(guard: () => Promise<void>, operation: () => Promise<T>): Promise<T>;
  resolveConnection?: (connectionId: string, endpoint: string) => HostMcpConnection | Promise<HostMcpConnection>;
  subscribeConnections?: (listener: (connectionId: string) => void) => () => void;
  saveConnection?: SaveMcpConnection;
  directoryAuthorized?: (projectId: string, directory: string) => Promise<boolean>;
  credentialRefFor?: (ref: string) => Promise<ExactRef<"credential">>;
}): AgentMcpLibrary & { dispose(): void } {
  const linked = new Map<string, { account: string; credential?: string; revision?: string }>();
  const invalidated = new Set<string>();
  const busy = new Map<string, { action: string; abort: AbortController }>();
  const errors = new Map<string, string>();
  const connection = (id: string) => runtime.mcp.list().find(item => item.id === id);
  const held = async (owner: AgentSkillOwner, id: string) => {
    const record = await runtime.store.get({ kind: KIND, id });
    if (!record || record.tombstoned || record.metadata.removed || !sameOwner(record.metadata as unknown as Saved, owner)) throw new Error("当前项目找不到这个 MCP 配置");
    return { saved: record.metadata as unknown as Saved, version: record.version };
  };
  const view = (saved: Saved, version: number): AgentMcpServerView => {
    const conn = connection(mcpConnectionId({ server: saved.id, configuration_version: version }));
    const tools = conn?.health === "connected" ? runtime.mcp.snapshotOf(conn.ref).tools.map(tool => ({ server: saved.id, tool: tool.name, version: tool.shapeFingerprint, configuration_version: version, description: tool.description })) : [];
    return { id: saved.id, version, label: saved.label, enabled: saved.enabled, transport: saved.transport, timeout_ms: saved.timeout_ms,
      ...(saved.transport === "stdio" ? { directory: saved.directory, executable: saved.executable, argv: saved.argv } : { endpoint: saved.endpoint }),
      credential: saved.credential_ref || saved.auth_connection_id ? "present" : "none",
      ...(saved.auth_connection_id ? { auth_connection_id: saved.auth_connection_id } : {}),
      health: conn?.health ?? "disconnected", tools, resources: conn?.health === "connected" ? [...runtime.mcp.snapshotOf(conn.ref).resources] : [],
      ...(busy.has(saved.id) ? { busy: busy.get(saved.id)!.action } : {}), ...(errors.has(saved.id) ? { error: errors.get(saved.id)! } : {}) };
  };
  const close = async (id: string) => {
    for (const conn of runtime.mcp.list().filter(item => item.id === id || item.id.startsWith(id + "@"))) {
      await runtime.disconnectMcp(conn.ref); runtime.mcp.remove(conn.ref);
    }
  };
  const unsubscribe = options.subscribeConnections?.(account => {
    for (const [id, link] of linked) if (link.account === account) {
      invalidated.add(id);
      void close(id).catch(() => { errors.set(id, "账号已变更，请重新连接"); });
    }
  });
  const resolveHost = async (saved: Saved) => {
    const resolved = await options.resolveConnection?.(saved.auth_connection_id!, saved.endpoint!);
    if (!resolved) throw new Error("所选 MCP 连接不可用，请在服务连接中重新授权");
    const ref = typeof resolved === "string" ? resolved : resolved.credentialRef;
    if (ref && !options.credentialRefFor) throw new Error("MCP 凭据解析不可用");
    const credentialRef = ref ? await options.credentialRefFor!(ref) : undefined;
    return { credentialRef, revision: typeof resolved === "string" ? undefined : resolved.revision };
  };
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
        const base = { ...owner, id, label: text(input.label, "名称", 128), enabled: input.enabled, timeout_ms: input.timeout_ms };
        let saved: Saved;
        let discard: (() => void | Promise<void>) | undefined;
        if (input.transport === "stdio") {
          if (!input.directory?.realpath_verified || !input.directory.canonical_path) throw new Error("请指定已授权工作区");
          if (!Array.isArray(input.argv) || input.argv.length > 64 || input.argv.some(arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))) throw new Error("参数必须是最多 64 项的文本数组");
          saved = { ...base, transport: "stdio", directory: { ...input.directory }, executable: text(input.executable, "可执行文件"), argv: [...input.argv] };
        } else if (input.transport === "http") {
          const address = endpoint(input.endpoint);
          const prepared = await prepareMcpAuthentication(input, previous?.saved, address, options);
          discard = prepared.discard;
          saved = { ...base, transport: "http", endpoint: address, ...(prepared.connection_id ? { auth_connection_id: prepared.connection_id } : {}) };
        } else throw new Error("不支持这个 MCP 传输方式");
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
      if (action === "refresh") { await callOptions.beforeDispatch?.(); callOptions.signal?.throwIfAborted(); await refreshSelected((await held(owner, id)).saved, callOptions); }
      await locked(id, action, async abort => {
        const cancelled = () => abort.abort();
        callOptions.signal?.addEventListener("abort", cancelled, { once: true });
        const dispatch = async () => { await callOptions.beforeDispatch?.(); if (callOptions.signal?.aborted || abort.signal.aborted) throw createPrologueError("CANCELLED", "MCP connection cancelled before dispatch."); };
        try {
        const record = await held(owner, id);
        if (callOptions.expected_version !== undefined && record.version !== callOptions.expected_version) throw new Error("MCP 配置已变化，请重新读取后操作");
        if (action !== "connect") await dispatch();
        const connectionId = mcpConnectionId({server:id,configuration_version:record.version});
        if (action === "connect") {
          if (!record.saved.enabled) throw new Error("请先启用这个 MCP 服务");
          if (connection(connectionId)?.health === "connected") throw new Error("这个 MCP 已连接");
          invalidated.delete(id);
          linked.delete(id);
          const saved = record.saved;
          const conn = connection(connectionId) ?? runtime.mcp.add({ id: connectionId, label: saved.label, transport: saved.transport, enabled: true, protocolMajor: 1 });
          if (saved.transport === "stdio") {
            await assertDirectory(saved);
            const root = await runtime.workspace.authorize({ path: saved.directory!.canonical_path });
            await dispatch(); await assertDirectory(saved);
            await runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "stdio", rootRef: root.ref, executable: saved.executable!, argv: saved.argv!, cwd: ".", requestTimeoutMs: saved.timeout_ms, envAllowlist: [] } });
          } else {
            if (saved.credential_ref) throw new Error("这个 MCP 的凭据没有持久保存，请重新填写认证信息或选择已有连接");
            let credentialRef: ExactRef<"credential"> | undefined;
            if (saved.auth_connection_id) {
              linked.set(saved.id, { account: saved.auth_connection_id });
              const host = await resolveHost(saved);
              credentialRef = host.credentialRef;
              linked.set(saved.id, { account: saved.auth_connection_id, credential: JSON.stringify(credentialRef), revision: host.revision });
            }
            if (invalidated.has(id)) throw new Error("MCP 账号已改变，请重新连接");
            await dispatch();
            await runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "http", endpoint: saved.endpoint!, requestTimeoutMs: saved.timeout_ms, ...(credentialRef ? { credentialRef } : {}) } });
          }
          if (invalidated.has(id)) { await close(id); throw new Error("MCP 账号已改变，请重新连接"); }
          if (abort.signal.aborted) { await close(id);throw new Error("连接已取消"); }
          runtime.adoptMcpTools(conn.ref);
        } else if (action === "refresh") {
          if (!record.saved.enabled) throw new Error("请先启用这个 MCP 服务");
          await assertDirectory(record.saved);
          const conn = connection(connectionId);
          if (conn?.health !== "connected") throw new Error("这个 MCP 已断开，请重新连接");
          await runtime.refreshMcp({ ref: conn.ref, signal: abort.signal });
          await dispatch(); await assertDirectory(record.saved);
          runtime.adoptMcpTools(conn.ref);
        } else if (action === "disconnect") await close(id);
        else if (action === "remove") {
          await close(id);
          await runtime.store.commit({ kind: KIND, id, expectedVersion: record.version, metadata: { ...record.saved, enabled: false, removed: true } });
        } else throw new Error("不支持这个 MCP 操作");
        } finally { callOptions.signal?.removeEventListener("abort", cancelled); }
      });
    },
    async validateSources(owner, selected) {
      const resolved: AgentMcpSourceRef[] = [];
      for (const ref of selected) {
        const {saved,version} = await held(owner,ref.server);
        if(ref.configuration_version !== version) throw new Error("MCP 服务配置版本已变化，请重新选择资料来源");
        if(!saved.enabled || connection(mcpConnectionId(ref))?.health !== "connected") throw new Error("MCP 资料来源已断开或停用，请重新连接");
        await refreshSelected(saved);
        resolved.push({server:saved.id,configuration_version:version,server_label:saved.label});
      }
      return resolved;
    },
    async tools(owner) {
      const rows: AgentMcpToolDescriptor[] = [];
      for (const server of await library.list(owner)) {
        const conn = server.health === "connected" ? connection(mcpConnectionId({ server: server.id, configuration_version: server.version })) : undefined;
        if (!conn || !server.enabled) continue;
        for (const tool of runtime.mcp.snapshotOf(conn.ref).tools) rows.push({ server: server.id, server_label: server.label, configuration_version: server.version,
          tool: tool.name, version: tool.shapeFingerprint, description: tool.description ?? "", input_schema: structuredClone(tool.inputShape as Record<string, unknown>) });
      }
      return rows;
    },
    live(ref) {
      const conn = connection(mcpConnectionId(ref));
      return conn?.health === "connected" && runtime.mcp.snapshotOf(conn.ref).tools.some(tool => tool.name === ref.tool && tool.shapeFingerprint === ref.version);
    },
    call: (...args) => callMcpTool(runtime, library, held, prepare, assertDirectory, options.withDispatchGuard, ...args),
    async validate(owner, selected) {
      const resolved = [];
      for (const ref of selected) {
        const { saved, version } = await held(owner, ref.server);
        if (ref.configuration_version !== version) throw new Error("MCP 服务配置版本已变化或未固定，请重新选择");
        const conn = connection(mcpConnectionId(ref));
        if (!saved.enabled || conn?.health !== "connected") throw new Error("选中的 MCP 服务已停用或断开，请重新连接或取消选择");
        await assertDirectory(saved);
        await refreshSelected(saved);
        const refreshed = connection(mcpConnectionId(ref));
        if (!refreshed || refreshed.health !== "connected") throw new Error("MCP 连接已改变，请重新连接");
        const tool = runtime.mcp.snapshotOf(refreshed.ref).tools.find(tool => tool.name === ref.tool && tool.shapeFingerprint === ref.version);
        if (!ref.version || !tool) throw new Error("MCP 工具形状版本已经变化，请查看新参数并重新选择");
        resolved.push({ server: saved.id, tool: tool.name, version: tool.shapeFingerprint, configuration_version: version, server_label: saved.label });
      }
      return resolved;
    },
  };
  return Object.assign(library, { dispose: () => { unsubscribe?.(); linked.clear(); } });
}

async function callMcpTool(runtime: Runtime, library: AgentMcpLibrary,
  held: (owner: AgentSkillOwner, id: string) => Promise<{ saved: Saved; version: number }>,
  prepare: (owner: AgentSkillOwner, ref: AgentMcpSourceRef, options: NonNullable<Parameters<NonNullable<AgentMcpLibrary["call"]>>[3]>) => Promise<void>,
  assertDirectory: (saved: Saved) => Promise<void>,
  withDispatchGuard: <T>(guard: () => Promise<void>, operation: () => Promise<T>) => Promise<T>,
  ...[owner, ref, args, callOptions = {}]: Parameters<NonNullable<AgentMcpLibrary["call"]>>
) {
  const connection = (id: string) => runtime.mcp.list().find(item => item.id === id);
  const assertActive = () => {
    // This guard runs before dispatch. Preserve cancellation through the SDK's
    // public error contract; an arbitrary DOM AbortError is otherwise an App denial.
    if (callOptions.signal?.aborted) throw createPrologueError("CANCELLED", "MCP call cancelled before dispatch.");
  };
  const beforeDispatch = async () => {
    assertActive();
    try { await callOptions.beforeDispatch?.(); await assertDirectory((await held(owner, ref.server)).saved); }
    finally { assertActive(); }
  };
  return withDispatchGuard(beforeDispatch, async () => {
    await beforeDispatch();
    await prepare(owner, ref, callOptions);
    const [checked] = await library.validate(owner, [ref]);
    const { saved } = await held(owner, checked!.server);
    const name = `mcp:${mcpConnectionId(checked!)}/${checked!.tool}`;
    // Adopted on connect; adopting again after a reconnect keeps the catalog on the live shape.
    const conn = connection(mcpConnectionId(checked!));
    if (!conn || !runtime.tools.get(name)) runtime.adoptMcpTools(conn!.ref);
    const root = await runtime.workspace.authorize({ path: saved.transport === "stdio" ? saved.directory!.canonical_path : await callRoot() });
    const run = runtime.createSystemToolRunner(root.ref);
    const observation = await runtime.createToolInvoker().invoke({
      request: { name, version: checked!.version!, args: { ...args } },
      run: async request => {
        await beforeDispatch();
        callOptions.onBusinessDispatch?.();
        try {
          const result = await run(callOptions.signal ? { ...request, abort: callAbort(callOptions.signal, request.abort) } : request);
          callOptions.onBusinessResult?.("succeeded"); return result;
        } catch (error) {
          callOptions.onBusinessResult?.(isPrologueError(error) && error.code === "MCP_CALL_FAILED" ? "failed" : "unknown"); throw error;
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
    return { text: observation.text, truncated: observation.truncated };
  });
}
