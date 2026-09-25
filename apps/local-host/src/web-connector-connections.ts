import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LocalSqliteStorage, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { HOST_CONNECTOR_DIRECTORY } from "./connector-directory.js";
import { authRefFor } from "./connector-credentials.js";
import { connectorCredentialStatus } from "./connector-credentials.js";
import { adoptLegacyImageConnections, ConnectorConnectionError, withConnectorConnections } from "./connector-connection-store.js";
import { FUNCTIONS_CREDENTIAL_REF } from "@molis-ai/molis-work-contracts/modules/functions";

const ITEM_PATH = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)$/u;

/** Makes old Host-owned tokens visible without moving or exposing their bytes. */
function importLegacyAccounts(homeDirectory: string): void {
  adoptLegacyImageConnections(homeDirectory);
  withConnectorConnections(homeDirectory, (connections) => {
    connections.adoptLegacy({ serviceId: "typesafe", displayName: "TypeSafe · 原有密钥",
      credentialRef: FUNCTIONS_CREDENTIAL_REF, authMethod: "token" });
    connections.adoptLegacy({ serviceId: "model-api", displayName: "文本补全 · 原有密钥",
      credentialRef: "model:text:api_key", authMethod: "token" });
    for (const service of HOST_CONNECTOR_DIRECTORY) {
      if (service.availability !== "live") continue;
      const ref = authRefFor(service.connector_id);
      try {
        if (runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(ref))) {
          const refreshRef = `connector:${service.connector_id}:refresh`;
          const hasRefresh = ["gmail", "notion"].includes(service.connector_id)
            && Boolean(runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(refreshRef)));
          connections.adoptLegacy({
            serviceId: service.connector_id,
            displayName: `${service.title} · 原有连接`,
            credentialRef: ref,
            authMethod: hasRefresh ? "oauth" : "token",
            ...(hasRefresh ? { refreshRef } : {}),
            ...(service.connector_id === "gmail" && hasRefresh ? { expiresRef: "connector:gmail:token_expires_at" } : {}),
          });
        }
      } catch { /* An unreadable old credential remains visible in the provider status. */ }
      try {
        const status = runWithMolisWorkHome(homeDirectory, () => connectorCredentialStatus(service.connector_id));
        if (status.source === "env" && status.bound) connections.adoptExternal({
          serviceId: service.connector_id, displayName: `${service.title} · 环境变量`,
          authMethod: "token", externalId: "environment",
        });
        if (service.connector_id === "feishu" && status.authRef === "connector:feishu:auth_mode") {
          connections.adoptExternal({ serviceId: "feishu", displayName: "飞书 CLI 用户授权",
            authMethod: "cli", externalId: "lark-cli", accountLabel: status.hint ?? null });
        }
      } catch { /* External integrations report their own availability. */ }
    }
    const catalogPath = join(homeDirectory, "projects", "catalog.db");
    if (!existsSync(catalogPath)) return;
    const catalog = new DatabaseSync(catalogPath, { readOnly: true });
    try {
      if (catalog.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_providers'").get()) {
        const providers = catalog.prepare("SELECT provider_id,display_name,credential_ref FROM model_providers").all() as Array<{
          provider_id: string; display_name: string; credential_ref: string;
        }>;
        for (const provider of providers) {
          if (!provider.credential_ref.startsWith("model-provider:")) continue;
          connections.adoptLegacy({ serviceId: "model-api", displayName: `${provider.display_name} · 原有密钥`,
            credentialRef: provider.credential_ref, authMethod: "token" });
        }
      }
      const projectPaths = catalog.prepare("SELECT database_path FROM projects").all() as Array<{ database_path: string }>;
      const root = resolve(homeDirectory, "projects") + sep;
      for (const entry of projectPaths) {
        const projectPath = resolve(entry.database_path);
        if (!projectPath.startsWith(root) || !existsSync(projectPath)) continue;
        const project = new DatabaseSync(projectPath, { readOnly: true });
        try {
          const hasSources = project.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feed_sources'").get();
          if (!hasSources) continue;
          const sources = project.prepare(`SELECT kind, name, config_json, credential_ref, account_label
            FROM feed_sources WHERE credential_ref IS NOT NULL AND sync_kind IN ('github','gmail','connector')`).all() as Array<{
            kind: string; name: string; config_json: string; credential_ref: string; account_label: string | null;
          }>;
          for (const source of sources) {
            if (!SERVICE_ID.test(source.kind)) continue;
            const ref = source.credential_ref;
            if (!ref || !runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(ref))) continue;
            let tokenRefs: Record<string, unknown> = {};
            try {
              const config: unknown = JSON.parse(source.config_json);
              if (config && typeof config === "object" && "token_refs" in config && config.token_refs && typeof config.token_refs === "object") {
                tokenRefs = config.token_refs as Record<string, unknown>;
              }
            } catch { /* A broken source config does not stop other accounts migrating. */ }
            connections.adoptLegacy({
              serviceId: source.kind,
              displayName: source.account_label ? `${source.kind} · ${source.account_label}` : source.name,
              credentialRef: ref,
              accountLabel: source.account_label,
              authMethod: typeof tokenRefs.refresh === "string" ? "oauth" : "token",
              ...(typeof tokenRefs.refresh === "string" ? { refreshRef: tokenRefs.refresh } : {}),
              ...(typeof tokenRefs.expiresAt === "string" ? { expiresRef: tokenRefs.expiresAt } : {}),
            });
          }
        } finally { project.close(); }
      }
    } catch { /* Catalog migration can finish on the next successful request. */ }
    finally { catalog.close(); }
  });
}

const SERVICE_ID = /^[a-z][a-z0-9-]*$/u;

export function listConnectorConnectionViews(homeDirectory: string, serviceId?: string) {
  importLegacyAccounts(homeDirectory);
  return withConnectorConnections(homeDirectory, (store) => store.list(serviceId).map((row) => {
    const view = store.view(row);
    if (row.source !== "external") return view;
    try {
      const available = runWithMolisWorkHome(homeDirectory, () => connectorCredentialStatus(row.service_id).bound);
      return { ...view, state: available && !row.disconnected_at ? "connected" as const : "reauth_required" as const };
    } catch { return { ...view, state: "reauth_required" as const }; }
  }));
}

/** Keep Feed's saved source status in step with the selected Home connection. */
export function refreshFeedConnectionState(homeDirectory: string, connectionId: string): void {
  const available = withConnectorConnections(homeDirectory, (store) => {
    const connection = store.require(connectionId);
    return store.state(connection) === "connected";
  });
  const catalogPath = join(homeDirectory, "projects", "catalog.db");
  if (!existsSync(catalogPath)) return;
  const catalog = new DatabaseSync(catalogPath, { readOnly: true });
  try {
    const root = resolve(homeDirectory, "projects") + sep;
    const projects = catalog.prepare("SELECT database_path FROM projects").all() as Array<{ database_path: string }>;
    for (const entry of projects) {
      const path = resolve(entry.database_path);
      if (!path.startsWith(root) || !existsSync(path)) continue;
      const project = new LocalSqliteStorage(path, { fileMustExist: true });
      try {
        if (!project.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='feed_sources'").get()) continue;
        const rows = project.db.prepare("SELECT board_id,source_id,status,enabled,config_json FROM feed_sources WHERE sync_kind IN ('github','gmail','connector')").all() as Array<{
          board_id: string; source_id: string; status: string; enabled: number; config_json: string;
        }>;
        for (const row of rows) {
          let config: Record<string, unknown>;
          try { config = JSON.parse(row.config_json) as Record<string, unknown>; } catch { continue; }
          if (config.connection_id !== connectionId || !row.enabled) continue;
          const next = available ? (row.status === "disconnected" ? "active" : row.status) : (row.status === "paused" ? "paused" : "disconnected");
          if (next === row.status) continue;
          project.db.prepare("UPDATE feed_sources SET status=?,last_error_code=?,updated_at=? WHERE board_id=? AND source_id=?")
            .run(next, available ? null : "connector_disconnected", new Date().toISOString(), row.board_id, row.source_id);
        }
      } finally { project.close(); }
    }
  } finally { catalog.close(); }
}

export async function handleConnectorConnectionsHttp(
  request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory?: string,
): Promise<boolean> {
  if (!homeDirectory) return false;
  const collection = url.pathname === "/api/settings/connectors/connections";
  const item = url.pathname.match(ITEM_PATH);
  if (!collection && !item) return false;
  try {
    if (request.method === "GET" && collection) {
      const serviceId = url.searchParams.get("service_id") || undefined;
      const connections = listConnectorConnectionViews(homeDirectory, serviceId);
      sendJson(response, 200, { connections });
      return true;
    }
    if (request.method === "POST" && collection) {
      const body = await readLocalWebBody(request);
      const connection = withConnectorConnections(homeDirectory, (store) => store.createToken({
        serviceId: body.service_id as string, displayName: body.display_name as string,
        token: body.token as string,
        accountLabel: typeof body.account_label === "string" ? body.account_label : null,
      }));
      const view = withConnectorConnections(homeDirectory, (store) => store.view(connection));
      sendJson(response, 201, { connection: view });
      return true;
    }
    if (item && request.method === "PATCH") {
      const body = await readLocalWebBody(request);
      const connection = withConnectorConnections(homeDirectory, (store) => {
        let updated = store.require(item[1]!);
        if (typeof body.display_name === "string") updated = store.rename(updated.connection_id, body.display_name);
        if (typeof body.token === "string") updated = store.replaceToken(updated.connection_id, body.token);
        return store.view(updated);
      });
      if (typeof body.token === "string") refreshFeedConnectionState(homeDirectory, item[1]!);
      sendJson(response, 200, { connection });
      return true;
    }
    if (item && request.method === "DELETE") {
      const connection = withConnectorConnections(homeDirectory, (store) => store.view(store.disconnect(item[1]!)));
      refreshFeedConnectionState(homeDirectory, item[1]!);
      sendJson(response, 200, { connection });
      return true;
    }
    sendJson(response, 405, { error: "不支持的连接操作" });
  } catch (error) {
    const known = error instanceof ConnectorConnectionError;
    sendJson(response, known && error.code === "not_found" ? 404 : 400, {
      error: known ? error.message : "连接操作失败，请检查本机凭据存储和输入",
      ...(known ? { code: error.code } : {}),
    });
  }
  return true;
}
