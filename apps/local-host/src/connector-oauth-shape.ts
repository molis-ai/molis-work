import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";

/** The id of an OAuth connection of the generic flow, read from its access reference (`connector-protocol:<id>:access`). */
export function apiOAuthConnectionId(ref?: string): string | undefined {
  return ref ? /^connector-protocol:([0-9a-f-]{36}):access$/u.exec(ref)?.[1] : undefined;
}

/** The access reference a connection of the shape the generic flow replaced holds (`connector-connection:<id>:access`). */
export function replacedOAuthAccessRef(ref: string): boolean {
  return /^connector-connection:[0-9a-f-]{36}:access$/u.test(ref);
}

/**
 * Services whose OAuth connections are still made by a flow of their own, and so are still of the shape that flow leaves: Notion
 * until W5-11 slice 7, GitHub's device authorization until slice 8. Each of those slices takes its service off this list; with the list
 * empty the rule below is the whole of it (W5-11 §2.6, M4).
 */
const OWN_FLOW = new Set(["notion", "github"]);

/**
 * An OAuth connection made before its service joined the generic flow: `auth_method: "oauth"` with credentials that are not the generic
 * flow's. It is not read, not refreshed and not sent anywhere; the person adds a new connection (user decision of 2026-10-27, Q2).
 */
export function replacedOAuthShape(connection: Pick<ConnectorConnectionRecord, "auth_method" | "service_id" | "credential_ref">): boolean {
  return connection.auth_method === "oauth" && !apiOAuthConnectionId(connection.credential_ref ?? undefined) && !OWN_FLOW.has(connection.service_id);
}

/** What the settings page tells the person about such a connection. */
export const REPLACED_OAUTH_NOTE = "这条连接是用旧的授权方式建立的，不能再使用：请新增一条连接，并把原来绑在这条连接上的来源重新绑定到新连接";
