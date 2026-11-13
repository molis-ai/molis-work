/**
 * The official coding pack's symbol tool, added to the round's own pack.
 *
 * The pack declares `coding.find-symbol` and names `coding.symbol-index` as the executor the App supplies; this module
 * merges that one tool into the pack a round already carries (its action tools and after-write check), so the SDK still
 * binds one pack per session. The tool is offered only to a role that names `find-symbol`.
 */

import { CODING_EXECUTORS, OFFICIAL_CODING_PACK, type ScenarioPack, type ToolRunner } from "@prologue/sdk";

/** The Host tool name a role declares; `prologueToolName` maps it to the pack tool below. */
export const FIND_SYMBOL_HOST_TOOL = "find-symbol";
/** The pack tool the model calls. */
export const FIND_SYMBOL_TOOL = "coding.find-symbol";

/** `pack` with the symbol tool and its executor added; everything else in the pack is untouched. */
export function withSymbolTool(input: {
  readonly pack: ScenarioPack;
  readonly executors: Readonly<Record<string, ToolRunner>>;
  readonly symbolIndex: ToolRunner;
}): { readonly pack: ScenarioPack; readonly executors: Record<string, ToolRunner> } {
  const tool = OFFICIAL_CODING_PACK.tools.find((one) => one.registration.name === FIND_SYMBOL_TOOL);
  if (tool === undefined) throw new Error("the vendored coding pack no longer declares coding.find-symbol");
  const executor = CODING_EXECUTORS.symbols;
  return {
    pack: {
      ...input.pack,
      needs: { ...input.pack.needs, executors: [...new Set([...(input.pack.needs.executors ?? []), executor])] },
      permissions: { ...input.pack.permissions, tools: [...new Set([...input.pack.permissions.tools, tool.registration.name])] },
      tools: [...input.pack.tools, tool],
    },
    executors: { ...input.executors, [executor]: input.symbolIndex },
  };
}
