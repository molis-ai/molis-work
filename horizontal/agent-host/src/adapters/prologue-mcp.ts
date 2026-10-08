import { randomUUID } from "node:crypto";
import { createPrologueError, redactMcpError, type ExactRef, type Runtime, type ToolAbort } from "@prologue/sdk";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AgentMcpSourceRef, AgentMcpLibrary, AgentMcpServerInput, AgentMcpServerView, AgentMcpToolDescriptor, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";

export type HostMcpConnection = string | { credentialRef?: string; revision: string } | null;
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
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("外部 MCP 使用 HTTPS；HTTP 仅用于本机回环地址");
  return url.toString();
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

/** Configuration belongs to the project; connection, tools and effects belong to SDK. */
export function createPrologueMcpLibrary(runtime: Runtime, options: {
  withDispatchGuard<T>(guard: () => Promise<void>, operation: () => Promise<T>): Promise<T>;
  resolveConnection?: (connectionId: string, endpoint: string) => HostMcpConnection | Promise<HostMcpConnection>;
  subscribeConnections?: (listener: (connectionId: string) => void) => () => void;
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
  const refreshSelected = async (saved: Saved) => {
    if (!saved.auth_connection_id) return;
    try {
      if (invalidated.has(saved.id)) throw new Error("MCP 账号已改变，请重新连接");
      const current = await resolveHost(saved);
      const previous = linked.get(saved.id);
      if (!previous || previous.revision !== current.revision) throw new Error("MCP 账号已改变，请重新连接");
      if (previous.credential !== JSON.stringify(current.credentialRef)) {
        await close(saved.id);
        await library.control(saved, saved.id, "connect");
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
  const library: AgentMcpLibrary = {
    async list(owner) {
      const rows: AgentMcpServerView[] = [];let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const listed = await runtime.store.list({ kind: KIND, limit: 100, ...(cursor ? { cursor } : {}) });
        for (const record of listed.records) {
          const saved = record.metadata as unknown as Saved;
          if (!record.tombstoned && !saved.removed && sameOwner(saved, owner)) rows.push(view(saved, record.version));
        }
        if (!listed.cursor) return rows;cursor = listed.cursor;
      }
      throw new Error("MCP 配置目录过大，无法完整读取");
    },
    async save(owner, input) {
      const id = input.id ?? `mcp-${randomUUID()}`;
      return locked(id, "save", async () => {
        const previous = input.id ? await held(owner, id) : undefined;
        if (!Number.isInteger(input.expected_version) || input.expected_version !== (previous?.version ?? 0)) throw new Error("配置已变化，请重新读取后保存");
        if (typeof input.enabled !== "boolean" || !Number.isInteger(input.timeout_ms) || input.timeout_ms < 1000 || input.timeout_ms > 600_000) throw new Error("启用状态或超时无效（1000–600000 毫秒）");
        const base = { ...owner, id, label: text(input.label, "名称", 128), enabled: input.enabled, timeout_ms: input.timeout_ms };
        let saved: Saved;
        if (input.transport === "stdio") {
          if (!input.directory?.realpath_verified || !input.directory.canonical_path) throw new Error("请指定已授权工作区");
          if (!Array.isArray(input.argv) || input.argv.length > 64 || input.argv.some(arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))) throw new Error("参数必须是最多 64 项的文本数组");
          saved = { ...base, transport: "stdio", directory: { ...input.directory }, executable: text(input.executable, "可执行文件"), argv: [...input.argv] };
        } else if (input.transport === "http") {
          const address = endpoint(input.endpoint);let credential_ref: ExactRef<"credential"> | undefined;
          let auth_connection_id: string | undefined;
          if (input.auth?.kind === "keep-existing") {
            if (previous?.saved.endpoint !== address || (!previous.saved.credential_ref && !previous.saved.auth_connection_id)) throw new Error("地址变化或没有旧凭据，请重新输入认证信息");
            credential_ref = previous.saved.credential_ref;
            auth_connection_id = previous.saved.auth_connection_id;
          } else if (input.auth?.kind === "replace-secret") {
            const secret = text(input.auth.secret, "认证信息", 16384);
            credential_ref = (await runtime.credentials.write({ label: `mcp:${id}`, secret: { plaintext: new TextEncoder().encode(secret) } })).ref;
          } else if (input.auth?.kind === "connection") {
            auth_connection_id = text(input.auth.connection_id, "账号连接", 128);
            if (!options.resolveConnection || !await options.resolveConnection(auth_connection_id, address)) throw new Error("所选 MCP 连接不可用");
          } else if (input.auth?.kind !== "none") throw new Error("请明确选择认证方式");
          saved = { ...base, transport: "http", endpoint: address,
            ...(credential_ref ? { credential_ref } : {}), ...(auth_connection_id ? { auth_connection_id } : {}) };
        } else throw new Error("不支持这个 MCP 传输方式");
        // Changing configuration first closes the old transport; a failed save never implies it is still connected.
        await close(id);
        const committed = await runtime.store.commit({ kind: KIND, id, expectedVersion: input.expected_version, metadata: { ...saved } });
        return view(saved, committed.version);
      });
    },
    async control(owner, id, action) {
      if (action === "cancel") { await held(owner, id);if (busy.get(id)?.action === "connect") busy.get(id)!.abort.abort();return; }
      await locked(id, action, async abort => {
        const record = await held(owner, id);
        const connectionId = mcpConnectionId({server:id,configuration_version:record.version});
        if (action === "connect") {
          if (!record.saved.enabled) throw new Error("请先启用这个 MCP 服务");
          if (connection(connectionId)?.health === "connected") throw new Error("这个 MCP 已连接");
          invalidated.delete(id);
          linked.delete(id);
          const saved = record.saved;
          const conn = connection(connectionId) ?? runtime.mcp.add({ id: connectionId, label: saved.label, transport: saved.transport, enabled: true, protocolMajor: 1 });
          if (saved.transport === "stdio") {
            const root = await runtime.workspace.authorize({ path: saved.directory!.canonical_path });
            await runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "stdio", rootRef: root.ref, executable: saved.executable!, argv: saved.argv!, cwd: ".", requestTimeoutMs: saved.timeout_ms, envAllowlist: [] } });
          } else {
            let credentialRef = saved.credential_ref;
            if (saved.auth_connection_id) {
              linked.set(saved.id, { account: saved.auth_connection_id });
              const host = await resolveHost(saved);
              credentialRef = host.credentialRef;
              linked.set(saved.id, { account: saved.auth_connection_id, credential: JSON.stringify(credentialRef), revision: host.revision });
            }
            if (invalidated.has(id)) throw new Error("MCP 账号已改变，请重新连接");
            await runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "http", endpoint: saved.endpoint!, requestTimeoutMs: saved.timeout_ms, ...(credentialRef ? { credentialRef } : {}) } });
          }
          if (invalidated.has(id)) { await close(id); throw new Error("MCP 账号已改变，请重新连接"); }
          if (abort.signal.aborted) { await close(id);throw new Error("连接已取消"); }
          runtime.adoptMcpTools(conn.ref);
        } else if (action === "disconnect") await close(id);
        else if (action === "remove") {
          await close(id);
          await runtime.store.commit({ kind: KIND, id, expectedVersion: record.version, metadata: { ...record.saved, enabled: false, removed: true } });
        } else throw new Error("不支持这个 MCP 操作");
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
    async call(owner, ref, args, callOptions = {}) {
      const assertActive = () => {
        // This guard runs before dispatch. Preserve cancellation through the SDK's
        // public error contract; an arbitrary DOM AbortError is otherwise an App denial.
        if (callOptions.signal?.aborted) throw createPrologueError("CANCELLED", "MCP call cancelled before dispatch.");
      };
      const beforeDispatch = async () => {
        assertActive();
        try { await callOptions.beforeDispatch?.(); }
        finally { assertActive(); }
      };
      return options.withDispatchGuard(beforeDispatch, async () => {
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
            return run(callOptions.signal ? { ...request, abort: callAbort(callOptions.signal, request.abort) } : request);
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
    },
    async validate(owner, selected) {
      const resolved = [];
      for (const ref of selected) {
        const { saved, version } = await held(owner, ref.server);
        if (ref.configuration_version !== version) throw new Error("MCP 服务配置版本已变化或未固定，请重新选择");
        const conn = connection(mcpConnectionId(ref));
        if (!saved.enabled || conn?.health !== "connected") throw new Error("选中的 MCP 服务已停用或断开，请重新连接或取消选择");
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
