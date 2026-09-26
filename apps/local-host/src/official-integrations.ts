import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginIntegrationContribution,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  createGithubIntegrationPlugin,
} from "@molis-ai/molis-work-integration-github";
import {
  createGmailIntegrationPlugin,
  isGmailTokenRefs,
} from "@molis-ai/molis-work-integration-gmail";
import { createCatalogIntegrationPlugin } from "@molis-ai/molis-work-integration-catalog";
import { normalizeGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import {
  MemoryPluginRuntimeRepository,
  PluginRuntime,
} from "@molis-ai/molis-work-plugin-runtime";

import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { createGithubConnector } from "./github-connector.js";
import { createGmailConnector } from "./gmail-connector.js";
import { createCatalogConnector } from "./catalog-connector.js";

export type OfficialProviderFactory = (source: FeedSourceRecord) => IntegrationProviderPort;

interface IntegrationSession {
  runtime: PluginRuntime;
  installId: string;
  sourceFingerprint: string;
}

/**
 * Application composition boundary for official Integration Plugins.
 *
 * Feed supplies a Source and consumes the public contribution. Provider
 * identity, permissions, lifecycle and Raw Event -> Signal transformation stay
 * outside Feed and Listener Host.
 */
export class OfficialIntegrationRegistry {
  private readonly sessions = new Map<string, IntegrationSession>();

  constructor(
    private readonly providerFactory: OfficialProviderFactory = defaultProviderFor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async contributionFor(source: FeedSourceRecord): Promise<PluginIntegrationContribution> {
    let session = this.sessions.get(source.source_id);
    const sourceFingerprint = configurationFingerprint(source);
    if (session && session.sourceFingerprint !== sourceFingerprint) {
      await session.runtime.uninstall(session.installId);
      this.sessions.delete(source.source_id);
      session = undefined;
    }
    if (!session) {
      const definition = definitionFor(source, this.providerFactory(source), this.now);
      const runtime = new PluginRuntime(
        new MemoryPluginRuntimeRepository(),
        undefined,
        { now: this.now },
      );
      const installed = runtime.install({ definition, deployment: "local" });
      const requiredGrants = definition.manifest.permissions
        .filter((permission) => permission.required)
        .map((permission) => permission.permission);
      runtime.grant(installed.install.install_id, requiredGrants);
      await runtime.start(installed.install.install_id);
      session = {
        runtime,
        installId: installed.install.install_id,
        sourceFingerprint,
      };
      this.sessions.set(source.source_id, session);
    } else if (session.runtime.get(session.installId).state === "crashed") {
      await session.runtime.recover(session.installId);
    }

    const contribution = session.runtime.contribution(session.installId);
    if (!contribution || contribution.kind !== "integration") {
      throw new Error("official_integration_contribution_missing");
    }
    return contribution;
  }

  async reportCrash(sourceId: string, errorCode: string): Promise<void> {
    const session = this.sessions.get(sourceId);
    if (!session || session.runtime.get(session.installId).state !== "running") return;
    await session.runtime.reportCrash(session.installId, errorCode);
  }

  async uninstall(sourceId: string): Promise<void> {
    const session = this.sessions.get(sourceId);
    if (!session) return;
    await session.runtime.uninstall(session.installId);
    this.sessions.delete(sourceId);
  }
}

function configurationFingerprint(source: FeedSourceRecord): string {
  return JSON.stringify({
    sync_kind: source.sync_kind,
    definition_id: source.definition_id,
    credential_ref: source.credential_ref,
    config: source.config,
  });
}

function definitionFor(
  source: FeedSourceRecord,
  provider: IntegrationProviderPort,
  now: () => Date,
): PluginDefinition {
  if (source.sync_kind === "github") {
    return createGithubIntegrationPlugin({ provider, now });
  }
  if (source.sync_kind === "gmail") {
    return createGmailIntegrationPlugin({ provider, now });
  }
  if (source.sync_kind === "connector") {
    return createCatalogIntegrationPlugin({ connectorId: source.kind, provider, now });
  }
  throw new Error(`unsupported_official_integration:${source.sync_kind}`);
}

function defaultProviderFor(source: FeedSourceRecord): IntegrationProviderPort {
  if (source.sync_kind === "github") return createGithubConnector({ allowFixture: false,
    ...(source.config.connection_id && source.credential_ref ? { authRef: source.credential_ref } : {}),
  });
  if (source.sync_kind === "gmail") {
    const tokenRefs = source.config.token_refs;
    return createGmailConnector({
      allowFixture: false,
      scope: normalizeGmailScope(source.config.scope),
      ...(isGmailTokenRefs(tokenRefs) ? { tokenRefs } : {}),
      ...(source.config.connection_id && source.credential_ref && !isGmailTokenRefs(tokenRefs)
        ? { authRef: source.credential_ref } : {}),
    });
  }
  if (source.sync_kind === "connector") {
    return createCatalogConnector({ connectorId: source.kind,
      ...(source.config.connection_id && source.credential_ref ? {
        credentialRef: source.credential_ref,
        ...(typeof source.config.refresh_ref === "string" ? { refreshRef: source.config.refresh_ref } : {}),
      } : {}),
    });
  }
  throw new Error(`unsupported_official_integration:${source.sync_kind}`);
}
