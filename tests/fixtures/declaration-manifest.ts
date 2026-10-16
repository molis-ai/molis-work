import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";

export const DECLARATION_PLUGIN_ID = "io.molis.work.declaration-rules";

/**
 * The smallest v2 Manifest that parses, with `parts` laid over it field by field (a part replaces the field it names,
 * it is not merged into it). A test names exactly the declarations it wants checked: `agent`, `methods`, `actions`,
 * `action_scenes`, `ports`, `events`, `routes`, `requires`, `ui`, `permissions`, `artifacts`, `capabilities`.
 */
export function declarationManifest(parts: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: DECLARATION_PLUGIN_ID,
    version: "1.0.0",
    name: "Declaration rules",
    kind: "native",
    publisher: { publisher_id: "molis", signature: "declaration-rules-binding" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ...parts,
  };
}

/**
 * What the author is told about a Manifest: "" when it parses, the whole message of the Manifest error when it does not
 * (every declaration problem, in the order the checks ran, joined by the Manifest's own separator). Any other error is
 * not a verdict about the Manifest and propagates.
 */
export function manifestProblems(input: unknown): string {
  try {
    parsePluginManifest(input);
    return "";
  } catch (error) {
    if ((error instanceof ActionError && ["plugin.manifest_invalid","plugin.entrypoint_missing","plugin.permission_invalid","plugin.declaration_invalid"].includes(error.code) && error.kind === "invalid")) return error.message;
    throw error;
  }
}
