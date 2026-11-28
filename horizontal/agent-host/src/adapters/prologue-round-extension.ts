import type { Runtime, ScenarioPack, ToolRunner } from "@prologue/sdk";
import type { AgentFrozenStart } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createCodeIntelligence, unavailableSymbolIndex, unconfiguredSymbolIndex } from "../code-intelligence/index.js";
import { FIND_SYMBOL_HOST_TOOL, FIND_SYMBOL_TOOL, withSymbolTool } from "../code-intelligence/coding-tools.js";
import type { PrologueNodeAdapterOptions, RoundState } from "./prologue-node-kit.js";
import type { PrologueStartInput } from "./prologue.js";
import { registerWriteChecks } from "./prologue-write-checks.js";

/** Context handed to a round extension when preparing per-round tools, hooks, and resources. */
export interface RoundExtensionPrepareContext {
  readonly runtime: Runtime;
  readonly state: RoundState;
  readonly options: PrologueNodeAdapterOptions;
  readonly input: Pick<PrologueStartInput, "action_gateway" | "actions" | "character" | "root_path" | "session_id">;
  readonly none: boolean;
  readonly hasGateway: boolean;
  readonly packScope: string | undefined;
}

/** A single scoped dynamic tool augmentation contributed by a round extension. */
export interface RoundExtensionToolAugmentation {
  readonly hostTool?: string;
  readonly name: string;
  apply(target: { readonly pack: ScenarioPack; readonly executors: Readonly<Record<string, ToolRunner>> }): {
    readonly pack: ScenarioPack;
    readonly executors: Record<string, ToolRunner>;
  };
}

/** Live resources prepared by a round extension for one round, with idempotent teardown. */
export interface PreparedRoundExtension {
  readonly tools: readonly RoundExtensionToolAugmentation[];
  readonly hooks: readonly (() => void)[];
  readonly excludedHostTools?: readonly string[];
  readonly codeIntelligenceReadiness?: () => Promise<AgentFrozenStart["code_intelligence"] | undefined>;
  close(): Promise<void>;
}

/**
 * Per-round lifecycle extension attached to generic round setup (`prologue-round-gateway.ts`), keeping
 * scenario-specific tools, hooks, and background resources out of the generic gateway.
 */
export interface RoundExtension {
  readonly id: string;
  contributesTools(context: Omit<RoundExtensionPrepareContext, "packScope">): boolean;
  prepare(context: RoundExtensionPrepareContext): PreparedRoundExtension;
}

/**
 * Workspace code intelligence + pre-review write-check hook extension.
 *
 * The symbol tool is always declared to a role that names `find-symbol` in a workspace round (without a gateway):
 * a person with no language server configured gets an explicit error rather than a silently vanishing tool.
 * Servers start on first use and are closed idempotently when the round ends or fails setup.
 */
export const codeIntelligenceRoundExtension: RoundExtension = {
  id: "code-intelligence",
  contributesTools(context) {
    return !context.none
      && !context.hasGateway
      && context.input.root_path !== undefined
      && context.input.character.tools.includes(FIND_SYMBOL_HOST_TOOL);
  },
  prepare(context) {
    const wantsSymbols = this.contributesTools(context) && context.packScope !== undefined;
    if (!wantsSymbols) {
      return {
        tools: [],
        hooks: [],
        excludedHostTools: [FIND_SYMBOL_HOST_TOOL],
        close: async () => {},
      };
    }
    const { runtime, state, options, input, packScope } = context;
    const codeServers = options.codeIntelligence;
    const codeProblem = codeServers?.problem;
    const codeIntelligence = codeServers !== undefined
      ? createCodeIntelligence({
        servers: codeServers.servers,
        rootPath: input.root_path!,
        // Q5: a server that is not installed is fetched into this Home's isolated tools root, only if the person allowed it.
        ...(codeServers.toolsRoot === undefined ? {} : {
          tools: {
            root: codeServers.toolsRoot,
            allow: () => codeServers.downloadsAllowed === true,
            ...(codeServers.registry === undefined ? {} : { registry: codeServers.registry }),
          },
        }),
      })
      : undefined;
    const hooks: Array<() => void> = [];
    // A round that writes also has its writes formatted and checked before review (A4-2), with the same servers; off when it ends.
    const writes = codeIntelligence !== undefined && input.character.tools.some(tool => tool === "write" || tool === "edit-file");
    if (writes) {
      try {
        hooks.push(registerWriteChecks(runtime, state.writeChecks, {
          sessionId: input.session_id,
          rootPath: input.root_path!,
          intelligence: codeIntelligence,
        }));
      } catch (error) {
        void codeIntelligence.close().catch(() => undefined);
        throw error;
      }
    }
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      for (const unhook of hooks) unhook();
      await codeIntelligence?.close();
    };
    const symbolToolName = `${FIND_SYMBOL_TOOL}-${packScope}`;
    const symbolIndex = codeProblem !== undefined
      ? unavailableSymbolIndex(codeProblem)
      : codeIntelligence === undefined
        ? unconfiguredSymbolIndex
        : codeIntelligence.symbolIndex;
    const tools: readonly RoundExtensionToolAugmentation[] = [{
      hostTool: FIND_SYMBOL_HOST_TOOL,
      name: symbolToolName,
      apply: target => withSymbolTool({
        pack: target.pack,
        executors: target.executors,
        symbolIndex,
        name: symbolToolName,
      }),
    }];
    const codeIntelligenceReadiness = codeIntelligence
      ? () => (codeProblem !== undefined
        ? Promise.resolve({ problem: codeProblem, languages: [] })
        : codeIntelligence.readiness().catch(() => undefined))
      : undefined;
    return { tools, hooks, ...(codeIntelligenceReadiness ? { codeIntelligenceReadiness } : {}), close };
  },
};

export const DEFAULT_ROUND_EXTENSIONS: readonly RoundExtension[] = [codeIntelligenceRoundExtension];

/**
 * Prepare a list of round extensions into a single composite handle. If any extension throws during preparation,
 * all already-prepared extensions are closed before rethrowing.
 */
export function prepareRoundExtensions(
  extensions: readonly RoundExtension[],
  context: RoundExtensionPrepareContext,
): PreparedRoundExtension {
  const prepared: PreparedRoundExtension[] = [];
  try {
    for (const extension of extensions) {
      prepared.push(extension.prepare(context));
    }
  } catch (error) {
    for (const item of prepared.reverse()) {
      for (const unhook of item.hooks) unhook();
      void item.close().catch(() => undefined);
    }
    throw error;
  }
  const tools = prepared.flatMap(item => item.tools);
  const hooks = prepared.flatMap(item => item.hooks);
  const excludedHostTools = prepared.flatMap(item => item.excludedHostTools ?? []);
  const readinessEntry = prepared.find(item => item.codeIntelligenceReadiness !== undefined);
  let closed = false;
  return {
    tools,
    hooks,
    ...(excludedHostTools.length ? { excludedHostTools } : {}),
    ...(readinessEntry?.codeIntelligenceReadiness ? { codeIntelligenceReadiness: readinessEntry.codeIntelligenceReadiness } : {}),
    async close() {
      if (closed) return;
      closed = true;
      const failures: unknown[] = [];
      for (const item of [...prepared].reverse()) {
        try {
          await item.close();
        } catch (failure) {
          failures.push(failure);
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "关闭本轮扩展资源失败");
    },
  };
}
