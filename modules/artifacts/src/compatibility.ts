import type { ArtifactConsumptionCompatibility, ArtifactConsumerType, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
/** One owner policy for both an already-read page and an exact-version lookup. */
export function versionConsumptionCompatibility(artifact: Pick<FixedVersionRecord, "artifact_id" | "version" | "artifact_type_id" | "schema_version" | "lifecycle_state" | "availability">, supportedTypes: readonly ArtifactConsumerType[]): ArtifactConsumptionCompatibility {
  const reference = { artifact_id: artifact.artifact_id, version: artifact.version };
  if (artifact.lifecycle_state === "archived") return { artifact: reference, consumable: false, reason: "artifact_archived" };
  if (artifact.availability === "unavailable") return { artifact: reference, consumable: false, reason: "artifact_unavailable" };
  const compatible = supportedTypes.some(type => type.artifact_type_id === artifact.artifact_type_id && type.schema_version === artifact.schema_version);
  return { artifact: reference, consumable: compatible, reason: compatible ? "compatible_consumer" : "consumer_missing" };
}
