import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginManifestDigest } from "./identity.js";

export interface PluginRuntimeReleaseArtifact {
  plugin_id: string;
  publisher_signature: string;
  version: string;
  manifest_digest: string;
  manifest: PluginManifest;
  module_source: string;
}

export interface PluginRuntimeReleaseArtifactRepository {
  get(pluginId: string, publisherSignature: string, version: string, manifestDigest: string): PluginRuntimeReleaseArtifact | null;
  list(pluginId: string, publisherSignature: string): PluginRuntimeReleaseArtifact[];
  save(artifact: PluginRuntimeReleaseArtifact): void;
}

export interface PluginRuntimeReleaseArtifactDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): unknown;
  };
}

/** Code shipped by a trusted Native factory, stored inside the project Runtime database. */
export class SqlitePluginRuntimeReleaseArtifactRepository implements PluginRuntimeReleaseArtifactRepository {
  constructor(private readonly db: PluginRuntimeReleaseArtifactDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_runtime_release_artifacts (
      plugin_id TEXT NOT NULL,
      publisher_signature TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest_digest TEXT NOT NULL,
      artifact_json TEXT NOT NULL,
      PRIMARY KEY (plugin_id, publisher_signature, version, manifest_digest)
    )`);
  }

  get(pluginId: string, publisherSignature: string, version: string, manifestDigest: string): PluginRuntimeReleaseArtifact | null {
    const row = this.db.prepare(`SELECT artifact_json FROM plugin_runtime_release_artifacts
      WHERE plugin_id = ? AND publisher_signature = ? AND version = ? AND manifest_digest = ?`)
      .get(pluginId, publisherSignature, version, manifestDigest) as { artifact_json: string } | undefined;
    return row ? JSON.parse(row.artifact_json) as PluginRuntimeReleaseArtifact : null;
  }

  list(pluginId: string, publisherSignature: string): PluginRuntimeReleaseArtifact[] {
    return this.db.prepare(`SELECT artifact_json FROM plugin_runtime_release_artifacts
      WHERE plugin_id = ? AND publisher_signature = ? ORDER BY version`)
      .all(pluginId, publisherSignature)
      .map(row => JSON.parse((row as { artifact_json: string }).artifact_json) as PluginRuntimeReleaseArtifact);
  }

  save(artifact: PluginRuntimeReleaseArtifact): void {
    validateArtifact(artifact);
    this.db.prepare(`INSERT INTO plugin_runtime_release_artifacts
      (plugin_id, publisher_signature, version, manifest_digest, artifact_json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (plugin_id, publisher_signature, version, manifest_digest) DO NOTHING`)
      .run(artifact.plugin_id, artifact.publisher_signature, artifact.version, artifact.manifest_digest, JSON.stringify(artifact));
  }
}

export class MemoryPluginRuntimeReleaseArtifactRepository implements PluginRuntimeReleaseArtifactRepository {
  private readonly artifacts = new Map<string, PluginRuntimeReleaseArtifact>();

  get(pluginId: string, publisherSignature: string, version: string, manifestDigest: string): PluginRuntimeReleaseArtifact | null {
    const artifact = this.artifacts.get(artifactKey(pluginId, publisherSignature, version, manifestDigest));
    return artifact ? structuredClone(artifact) : null;
  }

  list(pluginId: string, publisherSignature: string): PluginRuntimeReleaseArtifact[] {
    return [...this.artifacts.values()]
      .filter(item => item.plugin_id === pluginId && item.publisher_signature === publisherSignature)
      .sort((left, right) => left.version.localeCompare(right.version))
      .map(item => structuredClone(item));
  }

  save(artifact: PluginRuntimeReleaseArtifact): void {
    validateArtifact(artifact);
    const key = artifactKey(artifact.plugin_id, artifact.publisher_signature, artifact.version, artifact.manifest_digest);
    if (!this.artifacts.has(key)) this.artifacts.set(key, structuredClone(artifact));
  }
}

export function createPluginRuntimeReleaseArtifact(manifest: PluginManifest, moduleSource: string): PluginRuntimeReleaseArtifact {
  return {
    plugin_id: manifest.plugin_id,
    publisher_signature: manifest.publisher.signature,
    version: manifest.version,
    manifest_digest: pluginManifestDigest(manifest),
    manifest,
    module_source: moduleSource,
  };
}

function validateArtifact(artifact: PluginRuntimeReleaseArtifact): void {
  if (artifact.plugin_id !== artifact.manifest.plugin_id
    || artifact.publisher_signature !== artifact.manifest.publisher.signature
    || artifact.version !== artifact.manifest.version
    || artifact.manifest_digest !== pluginManifestDigest(artifact.manifest)
    || !artifact.module_source.trim()) {
    throw new Error("Plugin Runtime 发行物身份不一致");
  }
}

function artifactKey(pluginId: string, publisherSignature: string, version: string, manifestDigest: string): string {
  return `${pluginId}\u0000${publisherSignature}\u0000${version}\u0000${manifestDigest}`;
}
