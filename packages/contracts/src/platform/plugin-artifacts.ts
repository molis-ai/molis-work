import type {
  ArtifactContentInput, ArtifactMetadata, ArtifactOrigin, ArtifactReference, ArtifactVersionRecord, ArtifactVersionResult,
  ProcessItemRecord, ProcessItemResult,
} from "../modules/artifacts.js";
import type { ArtifactLineHead } from "./artifact-pins.js";

/** What a Plugin writes for one version, in either store; identity, owner and producer come from the Host. */
export interface PluginProcessItemInput extends ArtifactReference {
  artifact_type_id: string;
  schema_version: number;
  content: ArtifactContentInput;
  metadata?: ArtifactMetadata;
  supersedes_version?: number | null;
}

/** A 成果 also says where it came from, what it is called and what its content is (specs/artifact-positioning A1). */
export interface PluginArtifactPublishInput extends PluginProcessItemInput {
  origin: ArtifactOrigin;
  title: string;
  media_type: string;
  /** Process items this version was made from. */
  trace?: ArtifactReference[];
}

/** Host-bound author surface: project, user and producer identity cannot be supplied by a Plugin. */
export interface PluginArtifactClient {
  /** Pin a version into the 成果库; the type must be in `artifacts.produces`. */
  publish(input: PluginArtifactPublishInput): ArtifactVersionResult;
  /** Read one fixed version by reference, whether it is a 成果 or a process item (only a 成果 has an `origin`). */
  read(reference: ArtifactReference): ArtifactVersionRecord | ProcessItemRecord | null;
  /**
   * The newest version of one of this Plugin's own lines of 成果 in the project, and the revision of the object it pinned
   * (null when the project holds none), so the next pin asks for a version the 成果库 does not have yet. A line another
   * producer started is refused.
   */
  head(artifactId: string): ArtifactLineHead | null;
}

/**
 * Process items are the exchange data a Plugin hands to others (a file snapshot, a change set, a run's receipt). They
 * keep the same immutable versions as 成果 but live in the producing Plugin's own store and never appear in the 成果库;
 * a 成果 can trace back to them (specs/artifact-positioning A2). The type must be in `process_items.produces`.
 */
export interface PluginProcessItemClient {
  record(input: PluginProcessItemInput): ProcessItemResult;
}
