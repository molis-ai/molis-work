import { type ActionErrorKind, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Every `mcp.*` code and its kind, declared once: the throw sites raise through `mcpErrors`, and the one factory that builds an
 * error from a code string (`createPresentationError`) looks the kind up in the same table. The codes raised on HTTP paths that
 * derive their status from the kind (the context gateway's identity, session and grant codes, answered by the settings route)
 * keep `invalid` (400) as before: `context_changed` is raised by the shared presenter, which the context gateway's HTTP exit runs;
 * the codes only raised inside MCP's JSON-RPC answers say what sort of failure they are, which that transport does not read.
 */
const MCP_ERROR_KINDS = {
  action_revoked: "forbidden", permission_revoked: "forbidden", authority_denied: "forbidden", tool_unknown: "not_found",
  unexpected_field: "invalid", startup_entry_missing: "unavailable", startup_failed: "unavailable",
  grant_invalid: "invalid", grant_scope: "invalid", grant_missing: "invalid", grant_requires: "invalid",
  context_host_missing: "invalid", runtime_identity_missing: "invalid",
  context_changed: "invalid", context_refresh_required: "conflict", tool_disabled: "unavailable", connection_incomplete: "unavailable",
  not_found: "not_found", path_required: "invalid", url_invalid: "invalid", runtime_decide_unsupported: "invalid",
} as const satisfies Readonly<Record<string, ActionErrorKind>>;

export type McpErrorReason = keyof typeof MCP_ERROR_KINDS;

/** The one raiser per code; every throw site in the Host raises through this declaration. */
export const mcpErrors = defineErrorCodes("mcp", MCP_ERROR_KINDS);

/** What the declaration says a code's kind is; undefined for a code nobody declared. */
export function mcpErrorKind(code: string): ActionErrorKind | undefined {
  if (!code.startsWith("mcp.")) return undefined;
  const reason = code.slice("mcp.".length);
  return Object.hasOwn(MCP_ERROR_KINDS, reason) ? MCP_ERROR_KINDS[reason as McpErrorReason] : undefined;
}
