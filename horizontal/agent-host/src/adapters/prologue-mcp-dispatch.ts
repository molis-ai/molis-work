import { isDeepStrictEqual } from "node:util";
import { createPrologueError, isPrologueError, type ExactRef } from "@prologue/sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewDecisionControl } from "../review-decisions.js";
import type { DispatchGuards, NodeHost } from "./prologue-node-kit.js";

export type McpTransport = {
  readonly source: string;
  readonly connection: string;
  readonly control: ReviewDecisionControl;
  readonly identity?: string;
  session?: string;
} & ({ readonly kind: "stdio" } | { readonly kind: "http"; readonly endpoint: string; readonly credential?: ExactRef<"credential"> });

export interface HeldMcpTool extends ReviewDecisionControl {
  readonly transport: McpTransport;
  readonly tool: string;
  readonly digest: string;
  readonly args: Readonly<Record<string, unknown>>;
  onDispatch?(): void;
}

type MatchTransport = (transport: McpTransport) => boolean;
export interface McpDispatch {
  readonly maintenance?: McpTransport;
  tool?(tool: string, args: Readonly<Record<string, unknown>>, matches: MatchTransport): HeldMcpTool | undefined;
  read?(matches: MatchTransport): McpTransport | undefined;
}

type Request = Parameters<NodeHost["prepareModelNetwork"]>[0];
type HttpTransport = Extract<McpTransport, { kind: "http" }>;
type RpcFrame = {
  readonly method?: string;
  readonly id?: number;
  readonly params?: Readonly<Record<string, unknown>>;
};
const transportReads = new Set(["resources/read", "resources/list", "prompts/get", "prompts/list"]);
const maintenance = new Set(["initialize", "notifications/initialized", "tools/list", "resources/list", "prompts/list", "ping"]);
const denied = () => createPrologueError("EFFECT_NOT_AUTHORIZED", "原 MCP 调用、连接或工具已失效，未发送这次请求。");
const object = (value: unknown): value is Readonly<Record<string, unknown>> => !!value && typeof value === "object" && !Array.isArray(value);

function frameOf(body: string): RpcFrame {
  const value: unknown = JSON.parse(body);
  if (!object(value) || value.jsonrpc !== "2.0") throw denied();
  return { method: typeof value.method === "string" ? value.method : undefined, id: typeof value.id === "number" ? value.id : undefined,
    params: object(value.params) ? value.params : undefined };
}

function resolveFrame(guard: ReturnType<DispatchGuards["getStore"]>, frame: RpcFrame, matches: MatchTransport) {
  const dispatch = guard?.mcp;
  if (frame.method === "tools/call") {
    if (typeof frame.params?.name !== "string" || !object(frame.params.arguments)) throw denied();
    const tool = dispatch?.tool?.(frame.params.name, frame.params.arguments, matches);
    if (!tool || !matches(tool.transport)) throw denied();
    return { transport: tool.transport, control: tool, tool };
  }
  const owner = dispatch?.maintenance;
  if (owner && matches(owner) && frame.method && maintenance.has(frame.method)) return { transport: owner, control: owner.control };
  const read = frame.method && transportReads.has(frame.method) ? dispatch?.read?.(matches) : undefined;
  if (read && matches(read)) return { transport: read, control: read.control };
  throw denied();
}

function current(guard: ReturnType<DispatchGuards["getStore"]>, control: ReviewDecisionControl) {
  requireSynchronous(guard?.assertCurrent());
  requireSynchronous(control.assertCurrent());
}

function matchesHttp(transport: McpTransport, request: Request, method: string | undefined): transport is HttpTransport {
  return transport.kind === "http" && transport.endpoint === request.endpoint && isDeepStrictEqual(transport.credential, request.credentialRef)
    && (method === "initialize" ? transport.session === undefined : transport.session === request.extraHeaders?.["mcp-session-id"]);
}

type NetworkAuthorization = {
  readonly beforeDispatch: () => Promise<() => void>;
  readonly response?: NonNullable<Parameters<NodeHost["executeModelNetwork"]>[0]["onResponse"]>;
  readonly resultCurrent?: () => void;
  readonly cancellation?: Request;
  cancelling?: Promise<void>;
};

/** The existing Node Host maps App refusals to the dispatch contract and preserves cancellation. */
function dispatchRefusal(error: unknown) {
  if (isPrologueError(error) && (error.code === "CANCELLED" || error.code === "EFFECT_NOT_AUTHORIZED")) return error;
  return denied();
}

/** Preserve the SDK's original transport and request handle. Business denials enter NodeNetwork's own dispatch bookkeeping. */
export function guardMcpDispatch(host: NodeHost, guards: DispatchGuards): NodeHost {
  const network = new WeakMap<Awaited<ReturnType<NodeHost["prepareModelNetwork"]>>, NetworkAuthorization>();
  const pipes = new Map<string, { transport: McpTransport; written: Set<number> }>();
  const cleanup = { beforeDispatch: async () => () => undefined };

  function authorizeNetwork(request: Request, guard: ReturnType<DispatchGuards["getStore"]>): NetworkAuthorization {
    if (request.method === "DELETE") {
      const owner = guard?.mcp?.maintenance;
      if (owner && owner.session && matchesHttp(owner, request, undefined) && request.body.length === 0) return cleanup;
      throw denied();
    }
    const frame = frameOf(new TextDecoder("utf-8", { fatal: true }).decode(request.body));
    const { transport, control, tool } = resolveFrame(guard, frame, candidate => matchesHttp(candidate, request, frame.method));
    const assert = () => current(guard, control);
    let sent = false;
    return {
      beforeDispatch: async () => {
        try { await guard?.beforeEffect(); await control.beforeEffect(); }
        catch (error) { throw dispatchRefusal(error); }
        return () => {
          try {
            assert();
            if (tool && sent) throw denied();
            sent = true;
            tool?.onDispatch?.();
          } catch (error) { throw dispatchRefusal(error); }
        };
      },
      ...(frame.method === "initialize" ? { response: (info: Parameters<NonNullable<NetworkAuthorization["response"]>>[0]) => {
        if (info.status >= 200 && info.status < 300) transport.session = info.mcpSessionId;
      } } : {}),
      ...(frame.method === "tools/call" ? { resultCurrent: assert } : {}),
      ...(frame.id === undefined || frame.method === "initialize" ? {} : {
        cancellation: { ...request, timeoutMs: Math.min(request.timeoutMs, 2_000),
          body: new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: frame.id } })) },
      }),
    };
  }

  return { ...host,
    async prepareModelNetwork(request) {
      if (request.channel !== "mcp") return host.prepareModelNetwork(request);
      let authorization: NetworkAuthorization;
      try { authorization = authorizeNetwork(request, guards.getStore()); }
      catch (error) { authorization = { beforeDispatch: async () => { throw error; } }; }
      const handle = await host.prepareModelNetwork(request);
      network.set(handle, authorization);
      return handle;
    },
    executeModelNetwork(input) {
      const held = network.get(input.handle);
      if (!held) return host.executeModelNetwork(input);
      return guards.exit(() => host.executeModelNetwork({ ...input,
        beforeDispatch: async () => {
          const original = await input.beforeDispatch?.();
          const assert = await held.beforeDispatch();
          return () => { requireSynchronous(original?.()); assert(); };
        },
        onResponse: info => { held.resultCurrent?.(); held.response?.(info); input.onResponse?.(info); },
        onFrame: chunk => { held.resultCurrent?.(); input.onFrame(chunk); },
      }));
    },
    async cancelModelNetwork(handle) {
      const held = network.get(handle), request = held?.cancellation;
      if (!held || !request) { await host.cancelModelNetwork(handle); return; }
      // This Node host reads and cancels synchronously before returning its promises.
      const inspection = host.inspectModelNetwork(handle);
      await host.cancelModelNetwork(handle);
      const previous = await inspection;
      if (!previous.dispatched || previous.status !== "running") { await held.cancelling; return; }
      // Stop can arrive outside the original async context. Only its original network handle can identify the sent request.
      // An SDK cancellation frame by itself has no handle and is refused by resolveFrame.
      held.cancelling ??= guards.exit(async () => {
        const notice = await host.prepareModelNetwork(request);
        let sent = false;
        await host.executeModelNetwork({ handle: notice, onFrame: () => undefined, onResponse: () => undefined,
          beforeDispatch: async () => () => { if (sent) throw denied(); sent = true; } });
      }).catch(() => undefined);
      await held.cancelling;
    },
    async openInteractive(request) {
      const guard = guards.getStore(), transport = guard?.mcp?.maintenance;
      if (transport?.kind !== "stdio") return host.openInteractive(request);
      current(guard, transport.control);
      const opened = await host.openInteractive(request);
      transport.session = opened.sessionId;
      pipes.set(opened.sessionId, { transport, written: new Set() });
      return opened;
    },
    async writeInteractive(input) {
      const pipe = pipes.get(input.sessionId);
      if (!pipe) return host.writeInteractive(input);
      const frame = frameOf(input.text);
      if (frame.method === "notifications/cancelled") {
        if (typeof frame.params?.requestId !== "number" || !pipe.written.delete(frame.params.requestId)) throw denied();
      } else {
        const guard = guards.getStore();
        // The SDK answers unsupported elicitation with "decline". This cannot start a tool or submit user data.
        if (frame.method === undefined && frame.id !== undefined) {
          const answer: unknown = JSON.parse(input.text);
          if (!object(answer) || !object(answer.result) || answer.result.action !== "decline" || Object.keys(answer.result).length !== 1) throw denied();
        } else {
          const selected = resolveFrame(guard, frame, transport => transport === pipe.transport);
          current(guard, selected.control);
          selected.tool?.onDispatch?.();
        }
        // The SDK has just checked this request's cancellation. Keep this check and stdin.write on that same stack.
      }
      const sent = host.writeInteractive(input);
      await sent;
      if (frame.id !== undefined && frame.method && frame.method !== "initialize") {
        pipe.written.add(frame.id);
        if (pipe.written.size > 256) pipe.written.delete(pipe.written.values().next().value!);
      }
    },
    async closeInteractive(id) {
      const pipe = pipes.get(id);
      await host.closeInteractive(id);
      if (pipes.get(id) === pipe) pipes.delete(id);
    },
  };
}
