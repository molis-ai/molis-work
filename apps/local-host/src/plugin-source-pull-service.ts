import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  PLUGIN_EVIDENCE_READ_PERMISSION, PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION, PLUGIN_SOURCE_PULL_FEED_PERMISSION, PLUGIN_SOURCE_PULL_QUERY_PERMISSION, PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION,
  type PluginSourcePullClient, type SourcePullResult,
} from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { createPluginSourcePullClient, type PluginSourcePullPort } from "@molis-ai/molis-work-plugin-runtime";
import { createEvidenceContentStore, createLazyFileSecretStore, resolveMolisWorkHome, runWithMolisWorkHome, type EvidenceContentStore, type SecretStore, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createSourcePullRuntime, type SourcePullRuntime } from "./source-pull-runtime.js";
import type { PluginDatabaseConnection } from "./plugin-database-client.js";
import { readResearchRepository, type ResearchGit } from "./research-repository-read.js";
import { forgetIntelligenceOperations, type IntelligenceCollectResult } from "./search-intelligence-client.js";
import { buildSourcePullIntent, sourcePullFingerprint } from "./source-pull-intent.js";
import { createSourceVocabulary } from "./source-vocabulary.js";
import { createConnectorSourcePort } from "./connector-source-pull.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import type { IntegrationRegistry } from "./integration-registry.js";

type FetchPort = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** The Manifest permissions that make the Host build `services.sourcePull` (`HOST_SERVICE_PERMISSIONS`). */
export const SOURCE_PULL_PERMISSIONS: readonly string[] = [PLUGIN_SOURCE_PULL_FEED_PERMISSION, PLUGIN_SOURCE_PULL_QUERY_PERMISSION, PLUGIN_EVIDENCE_READ_PERMISSION, PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION, PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION];

export interface SourcePullPortOptions {
  /** The project's library: where the platform keeps the search records of a pull. */
  db: SqliteDatabase;
  /** Test seams. Production never passes them: the transports are the ones `createSourcePullRuntime` makes. */
  fetch?: FetchPort;
  secretStore?: SecretStore;
  content?: EvidenceContentStore;
  /** The Home directory whose cache holds the research library clones; absent: the process's own Home. */
  home?: string;
  /** Test seam for `repository.read`: the `git` it runs. */
  git?: ResearchGit;
  /** Test seam for the account sources: the Home's integration registry, with providers of the test's own. Production uses the Home's. */
  integrations?: () => Promise<IntegrationRegistry>;
}

/**
 * `services.sourcePull`'s Host side (FI-4 step 4c, S-97 provisional): the transports, the search records and the evidence store of a plugin's pull.
 * Every body is announced to the plugin (`run.hold`) before it is written, so what the plugin keeps always includes every body that exists.
 */
export function createSourcePullPort(options: SourcePullPortOptions): PluginSourcePullPort {
  const home = options.home ?? resolveMolisWorkHome();
  // The bodies and the key that seals them are the Home's this port serves, whichever Home the process itself resolves to.
  const secretStore = options.secretStore ?? createLazyFileSecretStore(home);
  const content = options.content ?? runWithMolisWorkHome(home, () => createEvidenceContentStore({ secretStore }));
  return {
    vocabulary: createSourceVocabulary(options.integrations ?? (() => homeIntegrationRegistry(home))),
    connector: createConnectorSourcePort({ home, registry: options.integrations ?? (() => homeIntegrationRegistry(home)) }),
    plan: request => ({ intent_fingerprint: sourcePullFingerprint(request) }),
    async pull(request, run) {
      const intent = buildSourcePullIntent(request);
      // SEL turns a failed body write or caller check into a partial result; a body the plugin could not hold, or a call that went stale
      // (a revoked grant is not a cancellation: the signal stays live), fails the whole pull instead. A cancelled pull keeps its receipt.
      let refused: { readonly error: unknown } | undefined;
      const stale = (error: unknown): never => { if (!run.signal.aborted) refused ??= { error }; throw error; };
      const runtime = createSourcePullRuntime({
        db: options.db, secretStore, content, sourceCursor: "cursor" in request ? request.cursor : undefined,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        assertCurrent: () => { try { run.current(); } catch (error) { stale(error); } },
        beforeDispatch: async () => { try { await run.beforeEffect(); } catch (error) { stale(error); } },
        beforeContentWrite: async contentRef => {
          try { await run.beforeEffect(); await run.hold([contentRef]); } catch (error) { refused ??= { error }; throw error; }
        },
      });
      try {
        const result = await runtime.intelligenceCollect.executeExact(intent, { signal: run.signal });
        if (refused) throw refused.error;
        run.current();
        return sourcePullResult(result, runtime);
      } catch (error) {
        // A pull the plugin refused (its call went stale, its source changed) committed nothing and keeps no receipt: the same key pulls again.
        if (refused) forgetIntelligenceOperations(options.db, [request.operation_id]);
        // A call that went away mid-pull is told so, not by whatever the search layer made of the write it refused.
        run.current();
        throw error;
      } finally {
        await runtime.shutdown().catch(() => undefined);
      }
    },
    readEvidence(contentRef) {
      try { return content.read(contentRef); } catch { return null; }
    },
    forget: operationIds => forgetIntelligenceOperations(options.db, operationIds),
    async readRepository(request, run) {
      run.current();
      const result = await readResearchRepository(home, request, { signal: run.signal, ...(options.git ? { git: options.git } : {}) });
      run.current();
      return result;
    },
  };
}

function sourcePullResult(result: IntelligenceCollectResult, runtime: SourcePullRuntime): SourcePullResult {
  return {
    operation_id: result.operationId,
    intent_fingerprint: result.intentFingerprint,
    outcome: result.outcome,
    requirement_met: result.requirementMet,
    materials: result.materials.map(material => ({
      id: material.id, candidate_id: material.candidateId, canonical_url: material.canonicalUrl, title: material.title, source_name: material.sourceName,
      ...(material.publishedAt === undefined ? {} : { published_at: material.publishedAt }),
      preview: material.preview, content_ref: material.contentRef, content_hash: material.contentHash, content_type: material.contentType,
      character_count: material.characterCount, captured_at: material.capturedAt, provenance: Object.fromEntries(Object.entries(material.provenance)),
      content_available: runtime.content.has(material.contentRef),
    })),
    receipts: structuredClone(result.receipts),
    budget: structuredClone(result.budget),
    warnings: [...result.warnings],
    http_receipt: runtime.publicFeedReceipt?.() ?? null,
  };
}

/**
 * `services.sourcePull`: only when the Manifest declares one of its permissions, in a project whose library the Host holds (the search records
 * are the project's). A sandboxed plugin is refused it at install (S-60). The grant is read again on every call (`context.requireGrant`).
 */
export function pluginSourcePullFor(definition: PluginDefinition, context: PluginStartContext, assertActive: () => void,
  library: PluginDatabaseConnection | undefined, seams: Pick<SourcePullPortOptions, "fetch" | "home" | "git" | "integrations"> = {}): PluginSourcePullClient | undefined {
  const { manifest } = definition;
  const db = library;
  if (!db || !isSqliteDatabase(db) || !manifest.permissions.some(item => SOURCE_PULL_PERMISSIONS.includes(item.permission))) return undefined;
  return createPluginSourcePullClient(manifest, createSourcePullPort({ db, ...seams }), {
    install_id: context.install_id, installation_generation: context.installation_generation, ...(context.project_id ? { project_id: context.project_id } : {}), assertActive, requireGrant: permission => context.requireGrant(permission),
  });
}

/** The project's library as the search records need it: better-sqlite3's connection, not the narrow view a plugin's statements go through. */
function isSqliteDatabase(db: PluginDatabaseConnection): db is SqliteDatabase {
  const candidate: Partial<Record<keyof SqliteDatabase, unknown>> = db as Partial<Record<keyof SqliteDatabase, unknown>>;
  return typeof candidate.transaction === "function" && typeof candidate.pragma === "function";
}
