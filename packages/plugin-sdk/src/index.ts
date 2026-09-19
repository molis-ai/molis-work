import { createHash } from "node:crypto";
import { parsePluginManifest, PluginManifestError } from "@molis-ai/molis-work-contracts/platform/plugin";

export { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
export type {
  PluginManifest, PluginDefinition, PluginStartContext, PluginArtifactClient, PluginArtifactPublishInput, PluginPrivateStorage,
  PluginUiClient, PluginHostServices,
} from "@molis-ai/molis-work-contracts/platform/plugin";
export type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
export type { UiContribution, UiContributionDescriptor, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";

import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-sdk",
  packagePath: "packages/plugin-sdk",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3", "goal-reorg-dv3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["plugin.define.v1", "integration.polling.v1"],
} as const;

export class PluginDefinitionError extends Error {
  constructor(
    readonly code:
      | "plugin_manifest_invalid"
      | "plugin_entrypoint_missing"
      | "plugin_permission_invalid"
      | "plugin_declaration_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PluginDefinitionError";
  }
}

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  assertManifest(definition.manifest);
  return Object.freeze(definition);
}

export function definePollingIntegrationPlugin(input: {
  manifest: PluginManifest;
  createProvider(context: PluginStartContext): IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  if (input.manifest.kind !== "integration") {
    throw new PluginDefinitionError("plugin_manifest_invalid", "Polling Provider 必须声明为 Integration Plugin");
  }
  return definePlugin({
    manifest: input.manifest,
    async start(context) {
      const provider = input.createProvider(context);
      const now = input.now ?? (() => new Date());
      return {
        kind: "integration",
        connector_driver: {
          driver_id: `${input.manifest.plugin_id}:connector`,
          async health() {
            const health = await provider.health();
            return {
              ok: health.ok,
              status: health.status === "mock" ? "error" : health.status,
              message: health.message,
              ...(health.action ? { action: health.action } : {}),
            };
          },
          async poll(request) {
            const mode = request.intent?.sync_mode === "rebuild_cursor"
              ? "rebuild_cursor"
              : "normal";
            const result = await provider.sync({ cursor: request.cursor, mode });
            if (!result.ok) {
              return {
                ok: false,
                mode: "live",
                failure: result.failure,
                message: result.message,
                ...(result.action ? { action: result.action } : {}),
                ...(result.httpStatus == null ? {} : { http_status: result.httpStatus }),
                ...(result.retryAfterAt ? { retry_after_at: result.retryAfterAt } : {}),
              };
            }
            const observedAt = now().toISOString();
            return {
              ok: true,
              mode: result.mode,
              cursor_after: structuredClone(result.cursor),
              events: result.items.map((item, index) => ({
                raw_event_id: `raw-event-${digest(`${input.manifest.plugin_id}\u0000${item.externalId}\u0000${JSON.stringify(item)}`)}`,
                provider_dedupe_id: item.externalId,
                occurred_at: normalizeDate(item.occurredAt, observedAt),
                observed_at: observedAt,
                payload: structuredClone(item) as unknown as Record<string, unknown>,
                ...(index === result.items.length - 1
                  ? { cursor_after: structuredClone(result.cursor) }
                  : {}),
              })),
            };
          },
        },
        signal_adapter: {
          adapter: {
            plugin_id: input.manifest.plugin_id,
            version: input.manifest.version,
          },
          toSignalDraft(event, source) {
            const payload = structuredClone(event.payload);
            const kind = typeof payload.kind === "string" && payload.kind.trim()
              ? payload.kind
              : "update";
            return {
              kind,
              occurred_at: event.occurred_at,
              observed_at: event.observed_at,
              payload,
              content_refs: [],
              provenance: {
                provider_plugin_id: input.manifest.plugin_id,
                provider_plugin_version: input.manifest.version,
                project_id: source.project_id,
                source_id: source.source_id,
              },
            };
          },
        },
      };
    },
  });
}

export function assertManifest(manifest: PluginManifest): void {
  try {
    parsePluginManifest(manifest);
  } catch (error) {
    if (error instanceof PluginManifestError) {
      throw new PluginDefinitionError(error.code, error.message);
    }
    throw error;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeDate(value: string | undefined, fallback: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
