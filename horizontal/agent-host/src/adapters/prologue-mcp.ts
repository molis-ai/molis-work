import { randomUUID } from "node:crypto";
import { redactMcpError, type ExactRef, type Runtime } from "@prologue/sdk";
import type { AgentMcpSourceRef, AgentMcpLibrary, AgentMcpServerInput, AgentMcpServerView, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";

const KIND = "molis-mcp";
/** Each configuration has a distinct SDK connection identity; old calls cannot target a replacement. */
export const mcpConnectionId = (ref: AgentMcpSourceRef) => ref.configuration_version === undefined ? ref.server : `${ref.server}@${ref.configuration_version}`;
interface Saved extends Omit<AgentMcpServerInput, "auth" | "expected_version">, AgentSkillOwner {
  id: string; credential_ref?: ExactRef<"credential">; removed?: boolean;
}
const sameOwner = (a: AgentSkillOwner, b: AgentSkillOwner) => a.board_id === b.board_id && a.plugin_id === b.plugin_id;
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

/** Configuration belongs to the project; connection, tools and effects belong to SDK. */
export function createPrologueMcpLibrary(runtime: Runtime): AgentMcpLibrary {
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
      credential: saved.credential_ref ? "present" : "none", health: conn?.health ?? "disconnected", tools, resources: conn?.health === "connected" ? [...runtime.mcp.snapshotOf(conn.ref).resources] : [],
      ...(busy.has(saved.id) ? { busy: busy.get(saved.id)!.action } : {}), ...(errors.has(saved.id) ? { error: errors.get(saved.id)! } : {}) };
  };
  const close = async (id: string) => {
    for (const conn of runtime.mcp.list().filter(item => item.id === id || item.id.startsWith(id + "@"))) {
      await runtime.disconnectMcp(conn.ref); runtime.mcp.remove(conn.ref);
    }
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
          if (input.auth?.kind === "keep-existing") {
            if (previous?.saved.endpoint !== address || !previous.saved.credential_ref) throw new Error("地址变化或没有旧凭据，请重新输入认证信息");
            credential_ref = previous.saved.credential_ref;
          } else if (input.auth?.kind === "replace-secret") {
            const secret = text(input.auth.secret, "认证信息", 16384);
            credential_ref = (await runtime.credentials.write({ label: `mcp:${id}`, secret: { plaintext: new TextEncoder().encode(secret) } })).ref;
          } else if (input.auth?.kind !== "none") throw new Error("请明确选择认证方式");
          saved = { ...base, transport: "http", endpoint: address, ...(credential_ref ? { credential_ref } : {}) };
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
          const saved = record.saved;
          const conn = connection(connectionId) ?? runtime.mcp.add({ id: connectionId, label: saved.label, transport: saved.transport, enabled: true, protocolMajor: 1 });
          if (saved.transport === "stdio") {
            const root = await runtime.workspace.authorize({ path: saved.directory!.canonical_path });
            await runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "stdio", rootRef: root.ref, executable: saved.executable!, argv: saved.argv!, cwd: ".", requestTimeoutMs: saved.timeout_ms, envAllowlist: [] } });
          } else await runtime.connectMcp({ ref: conn.ref, signal: abort.signal, transport: { kind: "http", endpoint: saved.endpoint!, requestTimeoutMs: saved.timeout_ms, ...(saved.credential_ref ? { credentialRef: saved.credential_ref } : {}) } });
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
        resolved.push({server:saved.id,configuration_version:version,server_label:saved.label});
      }
      return resolved;
    },
    async validate(owner, selected) {
      const resolved = [];
      for (const ref of selected) {
        const { saved, version } = await held(owner, ref.server);
        if (ref.configuration_version !== version) throw new Error("MCP 服务配置版本已变化或未固定，请重新选择");
        const conn = connection(mcpConnectionId(ref));
        if (!saved.enabled || conn?.health !== "connected") throw new Error("选中的 MCP 服务已停用或断开，请重新连接或取消选择");
        const tool = runtime.mcp.snapshotOf(conn.ref).tools.find(tool => tool.name === ref.tool && tool.shapeFingerprint === ref.version);
        if (!ref.version || !tool) throw new Error("MCP 工具形状版本已经变化，请查看新参数并重新选择");
        resolved.push({ server: saved.id, tool: tool.name, version: tool.shapeFingerprint, configuration_version: version, server_label: saved.label });
      }
      return resolved;
    },
  };
  return library;
}
