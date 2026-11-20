import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CODING_CHANGESET_TYPE, CODING_PLAN_TYPE, CODING_REPORT_TYPE, codingArtifacts, CODING_ARTIFACT_SCHEMA_VERSIONS } from "./artifacts.js";

type CodingOutputRecord = NonNullable<ReturnType<PluginArtifactClient["read"]>>;

/**
 * The fixed versions of the given kinds that this project's Coding pinned itself, in the order of `types`, as the platform lists
 * what the Manifest consumes. The platform keeps only the versions it recorded Coding as producing (BL-375), so a version of the same
 * type another producer pinned is neither listed nor read. The list is asked for once and each own version read once: a page refreshes
 * these while a session is open.
 */
export function codingOutputs(context: PluginStartContext, types: readonly string[]): Array<{ reference: ArtifactReference; record: CodingOutputRecord }> {
  const artifacts = codingArtifacts(context), rows = artifacts.listConsumable({ producer_plugin_id: context.plugin_id });
  return types.flatMap(type => rows.filter(row => row.artifact_type_id === type && row.schema_version === CODING_ARTIFACT_SCHEMA_VERSIONS[type]).flatMap(row => {
    const reference = { artifact_id: row.artifact_id, version: row.version }, record = artifacts.read(reference);
    return record ? [{ reference, record }] : [];
  }));
}

/** The references of one kind of Coding's own fixed versions. */
export const codingOutputReferences = (context: PluginStartContext, type: string): ArtifactReference[] => codingOutputs(context, [type]).map(output => output.reference);

/** Every fixed output of this project's Coding sessions (reports, then change sets, then plans), with the session it came from. */
export const sessionOutputs = (context: PluginStartContext) => codingOutputs(context, [CODING_REPORT_TYPE, CODING_CHANGESET_TYPE, CODING_PLAN_TYPE])
  .flatMap(({ reference }) => { const [, encoded] = reference.artifact_id.split(":"); return encoded ? [{ reference, session_id: decodeURIComponent(encoded) }] : []; });
