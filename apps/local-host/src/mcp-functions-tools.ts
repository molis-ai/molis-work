import { FunctionsError, functionsActions } from "@molis-ai/molis-work-module-functions";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

/** Stable public names retained for existing clients, derived from system action contracts. */
export const LEGACY_FUNCTIONS_MCP = [
  { name: "molis_work_v1_functions_list", action: functionsActions.list },
  { name: "molis_work_v1_functions_describe", action: functionsActions.describe },
  { name: "molis_work_v1_functions_invoke", action: functionsActions.invoke },
] as const;

export async function callLegacyFunctionsMcp(actions: BoundActionClient, name: string, arguments_: Record<string, unknown>): Promise<string> {
  const binding = LEGACY_FUNCTIONS_MCP.find(item => item.name === name);
  if (!binding) throw new MolisWorkV1Error("mcp.tool_unknown", `未知判断方法：${name}`);
  try { return JSON.stringify(await actions.invoke<unknown, unknown>(binding.action, arguments_), null, 2); }
  catch (error) {
    if (error instanceof FunctionsError) throw new MolisWorkV1Error(error.code, error.message);
    throw error;
  }
}
