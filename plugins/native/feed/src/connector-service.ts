import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedConnectorSync } from "./connector-sync.js";
import type { ConnectorSyncMode } from "./connector-sync-ports.js";
import type { ConnectorAuthStatus, FeedConnectorAccountPorts, FeedConnectorKind, FeedGmailAuthorization } from "./connector-account-ports.js";
import { stableId } from "./source-input.js";
import { ensureConnectorSources } from "./connector-source-registration.js";

export class FeedConnectorService {
  constructor(readonly feed: FeedApplication, readonly boardId: string,
    private readonly ports: FeedConnectorAccountPorts,
    private readonly syncHandler: Pick<FeedConnectorSync, "sync">,
  ) {}

  ensureSources(): FeedSourceRecord[] {
    return ensureConnectorSources(this.feed, this.boardId, this.ports);
  }

  authStatus(): ConnectorAuthStatus {
    return this.ports.authStatus();
  }

  bindToken(kind: FeedConnectorKind, token: string): ConnectorAuthStatus {
    this.ports.bindToken(kind, token);
    this.ensureSources();
    this.markConnectorBound(kind);
    return this.authStatus();
  }

  unbind(kind: FeedConnectorKind): ConnectorAuthStatus {
    this.ports.unbindToken(kind);
    const now = new Date().toISOString();
    const matching = this.feed.snapshot(this.boardId).sources
      .filter((source) => source.sync_kind === kind);
    if (kind === "gmail") {
      for (const source of matching) this.ports.deleteGmailTokenRefs(source.config.token_refs);
    }
    for (const source of matching.length ? matching : [this.connectorSource(kind)]) {
      this.feed.upsertSource({
        ...source,
        status: "disconnected",
        enabled: true,
        cursor: {},
        credential_ref: source.credential_ref ?? (kind === "github" ? this.ports.credentialRef("github") : this.ports.credentialRef("gmail")),
        account_label: kind === "github" ? source.account_label : null,
        updated_at: now,
      });
    }
    return this.authStatus();
  }

  configureGithubClient(clientId: string): ConnectorAuthStatus {
    const value = clientId.trim();
    if (!value) throw new FeedDomainError("GitHub Client ID 不能为空", "connector_invalid_client_id");
    this.ports.github.storeClientId(value);
    return this.authStatus();
  }

  async startGithubDevice(clientId?: string) {
    const started = await this.ports.github.startDevice({ clientId });
    return {
      device_code: started.deviceCode,
      user_code: started.userCode,
      verification_uri: started.verificationUri,
      expires_in: started.expiresIn,
      interval: started.interval,
    };
  }

  async pollGithubDevice(deviceCode: string, clientId?: string) {
    const result = await this.ports.github.pollDevice({ deviceCode, clientId });
    if (result.status === "authorized") {
      this.ensureSources();
      this.markConnectorBound("github");
    }
    return { status: result.status, message: result.message };
  }

  configureGmailClient(clientId: string, clientSecret?: string): ConnectorAuthStatus {
    const value = clientId.trim();
    if (!value) throw new FeedDomainError("Gmail Client ID 不能为空", "connector_invalid_client_id");
    this.ports.gmail.storeClient({ clientId: value, clientSecret: clientSecret?.trim() || undefined });
    return this.authStatus();
  }

  async startGmailOAuth(input: { clientId?: string; clientSecret?: string; redirectUri?: string }) {
    return this.ports.gmail.startOAuth({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri: input.redirectUri,
    });
  }

  async completeGmailOAuth(input: { code: string; state?: string }): Promise<FeedGmailAuthorization> {
    let scoped: { installationId: string; email?: string } | undefined;
    const result = await this.ports.gmail.completeOAuth({
      code: input.code,
      state: input.state,
      resolveRefs: (email) => {
        if (!email) return undefined;
        const installationId = stableId("gmail-installation", email.trim().toLowerCase());
        scoped = { installationId, email };
        return this.ports.gmail.installationSecretRefs(installationId);
      },
    });
    this.ensureSources();
    const source = this.connectorSource("gmail");
    const now = new Date().toISOString();
    if (scoped) {
      const sourceId = stableId(
        "feed-source",
        `${this.boardId}\u0000connector\u0000gmail\u0000${scoped.installationId}`,
      );
      this.feed.upsertSource({
        ...source,
        source_id: sourceId,
        name: `Gmail · ${scoped.email || "已连接账号"}`,
        status: "active",
        enabled: true,
        origin: "goalboard",
        account_label: scoped.email ?? null,
        config: {
          installation_id: scoped.installationId,
          token_refs: this.ports.gmail.installationSecretRefs(scoped.installationId),
          scope: this.ports.gmail.normalizeScope(source.config.scope),
        },
        credential_ref: this.ports.gmail.installationSecretRefs(scoped.installationId).access,
        imported_at: now,
        updated_at: now,
      });
      // The fixed Gmail source remains only as a compatibility shell. Once an
      // account-scoped source exists, pausing it prevents duplicate reads via
      // the mirrored legacy token.
      this.feed.upsertSource({
        ...source,
        status: "paused",
        enabled: false,
        description: "Gmail 兼容入口；账号已拆分为独立来源，避免重复同步。",
        updated_at: now,
      });
    } else {
      this.feed.upsertSource({
        ...source,
        status: "active",
        account_label: result.email ?? source.account_label,
        updated_at: now,
      });
    }
    return result;
  }

  sync(sourceId: string, input: { idempotencyKey: string; mode?: ConnectorSyncMode }) {
    return this.syncHandler.sync(sourceId, input);
  }

  private connectorSource(kind: "github" | "gmail"): FeedSourceRecord {
    this.ensureSources();
    return this.feed.getSource(
      this.boardId,
      stableId("feed-source", `${this.boardId}\u0000connector\u0000${kind}`),
    );
  }

  private markConnectorBound(kind: "github" | "gmail"): void {
    const source = this.connectorSource(kind);
    this.feed.upsertSource({
      ...source,
      status: "active",
      credential_ref: kind === "github" ? this.ports.credentialRef("github") : this.ports.credentialRef("gmail"),
      updated_at: new Date().toISOString(),
    });
  }

}
