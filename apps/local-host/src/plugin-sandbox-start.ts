import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertSandboxDeclarations } from "@molis-ai/molis-work-plugin-sandbox";

/**
 * A sandboxed definition that asks for what the sandbox is not given does not start, with `sandbox.service_not_given` and before anything is
 * built for it (S-60). Every executor that starts plugin code calls this first, so the rule holds for the project platforms and the Home alike.
 */
export function refuseUngivenSandboxServices(definition: PluginDefinition, context: Pick<PluginStartContext, "grants">): void {
  if (definition.execution === "sandbox") assertSandboxDeclarations(definition, context.grants);
}
