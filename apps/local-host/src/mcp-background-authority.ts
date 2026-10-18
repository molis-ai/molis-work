import { ActionError, requireSynchronous, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpToolPreference } from "./mcp-settings-store.js";
import { readMcpToolPreference, readMcpToolPreferenceSync } from "./mcp-settings-store.js";
import { assertMcpActionAuthority, resolveMcpActionContext } from "./mcp-action-grants.js";

/** Opt-in by an actual MCP transport: preserve its stable actor/grants after an accepted command, not its socket. */
export function mcpBackgroundAuthority(caller: ActionCallContext, home: string | undefined, preference: McpToolPreference,
  catalog: readonly ActionView[], inspect: (caller: ActionCallContext) => Promise<readonly ActionView[]>, assertHost: () => void): NonNullable<ActionCallContext["retain_background_authority"]> {
  return (references, additionalPermissions = []) => {
    caller.signal?.throwIfAborted(); requireSynchronous(assertHost());
    const pinned: readonly ActionReference[] = references.map(ref => Object.freeze({ ...ref }));
    const required = Object.freeze([...new Set(additionalPermissions)]);
    if (!required.every(permission => caller.permissions.includes(permission))) throw new ActionError("mcp.permission_revoked", "不能保留当前未授权的权限");
    const sources = catalog.filter(view => caller.allowed_actions?.some(ref => ref.capability_id === view.capability_id
      && ref.version === view.version && ref.provider_id === view.provider.provider_id))
      .map(view => ({ id: view.capability_id, version: view.version, provider: view.provider.provider_id, permissions: [...view.action.permissions] }));
    const retained = { ...caller, signal: undefined };
    const checkPermissions = (views: readonly ActionView[], current: McpToolPreference) => {
      const original = views.filter(view => sources.some(source => source.id === view.capability_id && source.version === view.version
        && source.provider === view.provider.provider_id && source.permissions.length === view.action.permissions.length
        && source.permissions.every(permission => view.action.permissions.includes(permission))));
      const permissions = resolveMcpActionContext(retained, original, current).permissions;
      if (!required.every(permission => permissions.includes(permission))) throw new ActionError("mcp.permission_revoked", "后台任务所需的原授权已撤销");
    };
    let currentCatalog = catalog;
    const check = () => {
      requireSynchronous(assertHost());
      const current = home ? readMcpToolPreferenceSync(home) : preference;
      checkPermissions(currentCatalog, current);
      for (const reference of pinned) {
        requireSynchronous(caller.assert_authority_current?.(reference));
        assertMcpActionAuthority(retained, currentCatalog, current, reference);
      }
    };
    check();
    return Object.assign(async () => {
      check(); currentCatalog = await inspect(retained);
      const current = home ? await readMcpToolPreference(home) : preference;
      checkPermissions(currentCatalog, current);
      for (const reference of pinned) {
        await caller.validate_authority?.(reference);
        assertMcpActionAuthority(retained, currentCatalog, current, reference);
      }
      check();
    }, { assertCurrent: check });
  };
}
