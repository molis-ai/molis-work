import { createPrologueError, isPrologueError, type ExactRef, type McpOutboundRequest, type McpRequestGuard } from "@prologue/sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewDecisionControl } from "../review-decisions.js";
import type { DispatchGuards } from "./prologue-node-kit.js";
import { prepareDispatchFence } from "./prologue-dispatch.js";

export type McpTransport = {
  readonly source: string;
  readonly connection: string;
  readonly control: ReviewDecisionControl;
  readonly identity?: string;
} & ({ readonly kind: "stdio" }
  | { readonly kind: "http"; readonly endpoint: string; readonly credential?: ExactRef<"credential"> });

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

const transportReads = new Set(["resources/read", "resources/list", "prompts/get", "prompts/list"]);
const maintenance = new Set(["initialize", "notifications/initialized", "tools/list", "resources/list", "prompts/list", "ping"]);
const denied = () => createPrologueError("EFFECT_NOT_AUTHORIZED", "原 MCP 调用、连接或工具已失效，未发送这次请求。");

function resolveRequest(
  transport: McpTransport,
  guard: ReturnType<DispatchGuards["getStore"]>,
  request: McpOutboundRequest,
): { readonly control: ReviewDecisionControl; readonly tool?: HeldMcpTool } {
  const dispatch = guard?.mcp;
  const matches: MatchTransport = candidate => candidate === transport;
  if (request.method === "tools/call") {
    if (!request.tool) throw denied();
    const tool = dispatch?.tool?.(request.tool.name, request.tool.arguments, matches);
    if (!tool || tool.transport !== transport) throw denied();
    return { control: tool, tool };
  }
  const owner = dispatch?.maintenance;
  if (owner === transport && maintenance.has(request.method)) return { control: owner.control };
  const read = transportReads.has(request.method) ? dispatch?.read?.(matches) : undefined;
  if (read === transport) return { control: read.control };
  throw denied();
}

function current(guard: ReturnType<DispatchGuards["getStore"]>, control: ReviewDecisionControl) {
  requireSynchronous(guard?.assertCurrent());
  requireSynchronous(control.assertCurrent());
}

/** Preserve SDK cancellation / authorization / reconciliation codes across App refusals. */
function dispatchRefusal(error: unknown) {
  if (isPrologueError(error) && ["CANCELLED", "EFFECT_NOT_AUTHORIZED", "EFFECT_RECONCILE_REQUIRED"].includes(error.code)) return error;
  return denied();
}

/**
 * First-class SDK `McpRequestGuard` binding Molis Work's per-call dispatch authority directly to
 * each stdio or HTTP MCP transport without wire-level JSON-RPC re-parsing or Host monkey-patching.
 */
export function createMcpRequestGuard(transport: McpTransport, guards: DispatchGuards): McpRequestGuard {
  return {
    async authorizeRequest(request) {
      const guard = guards.getStore();
      const { control, tool } = resolveRequest(transport, guard, request);
      const assertCurrent = () => current(guard, control);
      let notified = false;
      const notifyDispatched = () => {
        if (notified) return;
        notified = true;
        tool?.onDispatch?.();
      };
      try {
        await prepareDispatchFence(guard);
        await control.beforeEffect();
        assertCurrent();
      } catch (error) {
        throw dispatchRefusal(error);
      }
      return {
        assertCurrent: () => {
          try { assertCurrent(); }
          catch (error) { throw dispatchRefusal(error); }
        },
        ...(tool?.onDispatch ? { onDispatched: notifyDispatched } : {}),
        ...(request.method === "tools/call"
          ? { assertResultCurrent: () => { notifyDispatched(); assertCurrent(); } }
          : {}),
      };
    },
  };
}
