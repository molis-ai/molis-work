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

/**
 * `pack` with the symbol tool and its executor added; everything else in the pack is untouched.
 *
 * The tool keeps the coding pack's parameters and executor contract but takes a **scoped name**: Molis binds one pack per
 * session and the tool catalog keeps one registration per name for the Runtime's whole life, so a fixed name could only
 * ever belong to the first round. Action tools and the after-write check are scoped the same way.
 */
export function withSymbolTool(input: {
  readonly pack: ScenarioPack;
  readonly executors: Readonly<Record<string, ToolRunner>>;
  readonly symbolIndex: ToolRunner;
  readonly name: string;
}): { readonly pack: ScenarioPack; readonly executors: Record<string, ToolRunner> } {
  const tool = OFFICIAL_CODING_PACK.tools.find((one) => one.registration.name === FIND_SYMBOL_TOOL);
  if (tool === undefined) throw new Error("the vendored coding pack no longer declares coding.find-symbol");
  const executor = CODING_EXECUTORS.symbols;
  return {
    pack: {
      ...input.pack,
      needs: { ...input.pack.needs, executors: [...new Set([...(input.pack.needs.executors ?? []), executor])] },
      permissions: { ...input.pack.permissions, tools: [...new Set([...input.pack.permissions.tools, input.name])] },
      tools: [...input.pack.tools, { ...tool, registration: { ...tool.registration, name: input.name } }],
    },
    executors: { ...input.executors, [executor]: input.symbolIndex },
  };
}

/**
 * The executor a role that names `find-symbol` gets when the person configured no language server: it refuses, and says
 * which file type nobody configured. The tool stays in the model's list — a tool that disappears makes the model think it
 * remembered the name wrong and try another spelling.
 */
export const unconfiguredSymbolIndex: ToolRunner = async (call) => {
  const path = (call.args as { readonly path?: unknown })?.path;
  const extension = typeof path === "string" ? path.slice(path.lastIndexOf(".")) : "";
  throw new Error(`no language server is configured${extension ? ` for ${extension}` : ""}; add one in the Home's language-servers.json`);
};
