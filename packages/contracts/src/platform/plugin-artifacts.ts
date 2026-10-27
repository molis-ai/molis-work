import type {
  ArtifactContentInput, ArtifactMetadata, ArtifactOrigin, ArtifactReference, ArtifactVersionRecord, ArtifactVersionResult,
  ProcessItemRecord, ProcessItemResult,
} from "../modules/artifacts.js";
import type { ArtifactLineHead } from "./artifact-pins.js";
import type { PluginDatabaseTransaction } from "./plugin-database.js";

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

/** A process line has fixed versions without a pinned work object's source revision. */
export interface PluginProcessItemHead { version: number }

/** A consumable fixed version's summary, without content, owner or storage details. */
export interface PluginConsumableVersion extends ArtifactReference {
  kind: "artifact" | "process_item";
  artifact_type_id: string;
  schema_version: number;
  title: string | null;
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
  /**
   * One version this Plugin pinned itself, whatever it consumes and archived or not (null when the project does not hold it),
   * so it can recover or check its own pin; `read` answers only what the Plugin consumes and can still use. A version
   * another producer pinned is refused.
   */
  readOwn(reference: ArtifactReference): ArtifactVersionRecord | null;
  /** All consumable fixed versions: 成果 first, then process items, in each owner's listing order. */
  listConsumable(): PluginConsumableVersion[];
  /**
   * Runs `write` inside the plugin's current project transaction (`PluginDatabase.transaction`), like `services.attention.join`: a version
   * it pins is committed or rolled back with the plugin's own rows, and the writer is refused once the transaction ends. Only a plugin with
   * a project database has it.
   */
  join?<T>(transaction: PluginDatabaseTransaction, write: (writer: PluginArtifactWriter) => T): T;
}

/** The 成果库 inside one plugin transaction (`PluginArtifactClient.join`); every call asks the grants and the original caller again. */
export interface PluginArtifactWriter {
  /** The newest version of one of this Plugin's own lines, the transaction's own pins included; a line another producer started is refused. */
  head(artifactId: string): ArtifactLineHead | null;
  /** Pin a version in the transaction; the type must be in `artifacts.produces`, and the producer and author are the platform's. */
  publish(input: PluginArtifactPublishInput): ArtifactVersionResult;
}

/**
 * Process items are the exchange data a Plugin hands to others (a file snapshot, a change set, a run's receipt). They
 * keep the same immutable versions as 成果 but live in the producing Plugin's own store and never appear in the 成果库;
 * a 成果 can trace back to them (specs/artifact-positioning A2). The type must be in `process_items.produces`.
 */
export interface PluginProcessItemClient {
  record(input: PluginProcessItemInput): ProcessItemResult;
  /** Latest own process version, including archived/unavailable versions, or null. Checks producer signature and personal owner. */
  head(artifactId: string): PluginProcessItemHead | null;
  /** Recover an own process version without consumes; producer upgrades with the same signature keep access. */
  readOwn(reference: ArtifactReference): ProcessItemRecord | null;
}
