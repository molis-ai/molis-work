import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CODING_CHANGESET_TYPE, CODING_PLAN_TYPE, CODING_REPORT_TYPE, codingArtifacts } from "./artifacts.js";

/**
 * The fixed versions of one kind that this project's Coding pinned itself, as the platform lists what the Manifest consumes. A
 * version of the same type that another producer pinned is not Coding's output and is left out.
 */
export function codingOutputReferences(context: PluginStartContext, type: string): ArtifactReference[] {
  const artifacts = codingArtifacts(context);
  return artifacts.listConsumable().filter(row => row.artifact_type_id === type && row.schema_version === 1).flatMap(row => {
    const reference = { artifact_id: row.artifact_id, version: row.version };
    return artifacts.read(reference)?.producer_plugin_id === context.plugin_id ? [reference] : [];
  });
}

/** Every fixed output of this project's Coding sessions (reports, then change sets, then plans), with the session it came from. */
export const sessionOutputs = (context: PluginStartContext) => [CODING_REPORT_TYPE, CODING_CHANGESET_TYPE, CODING_PLAN_TYPE]
  .flatMap(type => codingOutputReferences(context, type))
  .flatMap(reference => { const [, encoded] = reference.artifact_id.split(":"); return encoded ? [{ reference, session_id: decodeURIComponent(encoded) }] : []; });
