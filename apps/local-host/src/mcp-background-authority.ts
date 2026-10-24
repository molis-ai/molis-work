import { ActionError, requireSynchronous, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpToolPreference } from "./mcp-settings-store.js";
import { readMcpToolPreference, readMcpToolPreferenceSync } from "./mcp-settings-store.js";
import { assertMcpActionAuthority, pinMcpActionGrants, resolveMcpActionContext } from "./mcp-action-grants.js";

/** Opt-in by an actual MCP transport: preserve its stable actor/grants after an accepted command, not its socket. */
export function mcpBackgroundAuthority(caller: ActionCallContext, home: string | undefined, preference: McpToolPreference,
  catalog: readonly ActionView[], inspect: (caller: ActionCallContext) => Promise<readonly ActionView[]>, assertHost: () => void): NonNullable<ActionCallContext["retain_background_authority"]> {
  const originalCatalog = pinMcpActionGrants(caller, catalog, preference);
  return (references, additionalPermissions = []) => {
    caller.signal?.throwIfAborted(); requireSynchronous(assertHost());
    const pinned: readonly ActionReference[] = references.map(ref => Object.freeze({ ...ref }));
    const required = Object.freeze([...new Set(additionalPermissions)]);
    if (!required.every(permission => caller.permissions.includes(permission))) throw new ActionError("mcp.permission_revoked", "不能保留当前未授权的权限");
    const retained = { ...caller, signal: undefined };
    const checkPermissions = (views: readonly ActionView[], current: McpToolPreference) => {
      const permissions = resolveMcpActionContext(retained, originalCatalog(views, current), current).permissions;
      if (!required.every(permission => permissions.includes(permission))) throw new ActionError("mcp.permission_revoked", "后台任务所需的原授权已撤销");
    };
    let currentCatalog = catalog;
    const check = () => {
      requireSynchronous(assertHost());
      const current = home ? readMcpToolPreferenceSync(home) : preference;
      checkPermissions(currentCatalog, current);
      for (const reference of pinned) {
        requireSynchronous(caller.assert_authority_current?.(reference));
        assertMcpActionAuthority(retained, originalCatalog(currentCatalog, current), current, reference);
      }
    };
    check();
    return Object.assign(async () => {
      check(); currentCatalog = await inspect(retained);
      const current = home ? await readMcpToolPreference(home) : preference;
      checkPermissions(currentCatalog, current);
      for (const reference of pinned) {
        await caller.validate_authority?.(reference);
        assertMcpActionAuthority(retained, originalCatalog(currentCatalog, current), current, reference);
      }
      check();
    }, { assertCurrent: check });
  };
}
