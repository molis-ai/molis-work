import { isDeepStrictEqual } from "node:util";
import type { EffectOrigin, ExactRef, Runtime } from "@prologue/sdk";
import type { AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ReviewDecisionControl } from "../review-decisions.js";
import { mcpConnectionId, type createPrologueMcpLibrary } from "./prologue-mcp.js";
import type { HeldMcpTool, McpDispatch, McpTransport } from "./prologue-mcp-dispatch.js";
import type { PrologueStartInput } from "./prologue-ports.js";

interface Call {
  readonly name: string;
  readonly origin: EffectOrigin;
  readonly held: HeldMcpTool;
  effect?: ExactRef<"effect">;
  permission?: ReviewDecisionControl;
  used: boolean;
}

/** One round's original tool and source references. A reviewed tool is consumed once by the original SDK transport. */
export function roundMcp(runtime: Runtime, library: ReturnType<typeof createPrologueMcpLibrary>, owner: AgentSkillOwner, input: PrologueStartInput) {
  const refs = new Map(input.mcp_tools?.map(ref => [`mcp:${mcpConnectionId(ref)}/${ref.tool}`, ref]));
  const sources = new Map([...(input.mcp_tools ?? []), ...(input.mcp_sources ?? [])].map(ref => [mcpConnectionId(ref), ref]));
  const calls = new Map<string, Call>(), readers = new Map<string, McpTransport>();
  const dispatch: McpDispatch = {
    tool(name, args, matches) {
      const choices = [...calls.values()].filter(call => !call.used && call.held.tool === name && matches(call.held.transport)
        && isDeepStrictEqual(call.held.args, args)
        && call.effect && runtime.effects.get(call.effect)?.state === "dispatching");
      if (choices.length !== 1) return undefined;
      const call = choices[0]!, held = call.held;
      call.used = true;
      return { ...held, assertCurrent: () => { held.assertCurrent(); call.permission?.assertCurrent(); },
        beforeEffect: async () => { await held.beforeEffect(); await call.permission?.beforeEffect(); } };
    },
    read(matches) {
      const possible = [...readers.values()].filter(matches);
      return possible.length === 1 ? possible[0] : undefined;
    },
  };

  return {
    dispatch,
    async prepare(origin: EffectOrigin | undefined, name: string, args: unknown) {
      if (name === "read-mcp-resource") {
        const connection = args && typeof args === "object" && "connection" in args ? args.connection : undefined;
        const source = typeof connection === "string" ? sources.get(connection) : undefined;
        if (!source) throw new Error("原轮没有选用这条 MCP 资料来源");
        const transport = await library.holdTransport(owner, source);
        await transport.control.beforeEffect(); transport.control.assertCurrent();
        readers.set(transport.connection, transport);
        return;
      }
      if (!name.startsWith("mcp:")) return;
      const ref = refs.get(name), key = origin?.toolCall;
      if (!ref || !key || !origin?.run || origin.session !== input.session_id || !args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("原轮没有选用这条 MCP 工具或原调用不可读");
      }
      if (calls.has(key)) throw new Error("原 MCP 调用编号正在使用");
      const held = await library.holdTool(owner, ref, args as Record<string, unknown>);
      await held.beforeEffect(); held.assertCurrent();
      calls.set(key, { name, origin, held, used: false });
    },
    approval(effect: ExactRef<"effect">, origin: EffectOrigin | undefined, name: string, args: unknown) {
      const call = origin?.toolCall && calls.get(origin.toolCall);
      if (!call || call.name !== name || call.origin.run !== origin?.run || call.origin.session !== origin?.session
        || !isDeepStrictEqual(args, call.held.args) || call.effect && call.effect.id !== effect.id) return undefined;
      call.effect = effect;
      const activate = (permission: ReviewDecisionControl) => {
        if (call.used || calls.get(origin!.toolCall!) !== call) throw new Error("原 MCP 操作已结束");
        call.permission = permission;
      };
      return { ...call.held, activate };
    },
    release(callId: string) { calls.delete(callId); },
  };
}

export type RoundMcp = ReturnType<typeof roundMcp>;
