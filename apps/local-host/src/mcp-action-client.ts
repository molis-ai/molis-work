import { requireSynchronous, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import { assertMcpActionAuthority, isExternalRuntimeClient, mcpGrantErrors, pinMcpActionGrants, resolveMcpActionContext } from "./mcp-action-grants.js";
import { readMcpToolPreference, readMcpToolPreferenceSync } from "./mcp-settings-store.js";
import { mcpBackgroundAuthority } from "./mcp-background-authority.js";

/** One already selected Agent proposal: keep its grant generation, without rediscovering unrelated actions. */
export async function prepareMcpActionReview(host: Pick<MolisWorkLocalHost, "prepareActionReview">, caller: ActionCallContext, home: string | undefined,
  view: ActionView, input: unknown, project: LocalHostProjectReference, beforeEffect: () => void | Promise<void>, assertCurrent: () => void) {
  await beforeEffect();
  const preference = home ? await readMcpToolPreference(home) : { version: /* @version format.mcp.tool-preference */ 1 as const, action_grants: [] };
  const pinned = pinMcpActionGrants(caller, [view], preference), action = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  const check = () => {
    assertCurrent();
    const current = home ? readMcpToolPreferenceSync(home) : preference;
    assertMcpActionAuthority(caller, pinned([view], current), current, action);
  };
  const held = host.prepareActionReview({ ...resolveMcpActionContext(caller, [view], preference), assert_authority_current: check }, view, input, project);
  return { assertCurrent: held.assertCurrent, beforeEffect: async () => { await beforeEffect(); await held.beforeEffect(); } };
}

/** Shared by direct MCP and its authenticated local transport. Neither grants itself authority. */
export async function authorizeMcpActions(host: Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient">, caller: ActionCallContext, home: string | undefined,
  reference?: LocalHostProjectReference, checkTransport?: () => void | Promise<void>, assertTransportCurrent?: () => void, backgroundHostCurrent?: () => void) {
  const preference = home ? await readMcpToolPreference(home) : { version: /* @version format.mcp.tool-preference */ 1 as const, action_grants: [] };
  const catalog = await host.inspectActions(caller, reference);
  let currentCatalog = catalog;
  // An external Runtime with no stable Session says so on its context; dispatch then refuses every action that declares
  // `authorship: "session"`, whether the client calls it or a wrapper (an offer, a workflow step) does.
  const authorized = resolveMcpActionContext(caller, catalog, preference);
  const originalCatalog = pinMcpActionGrants(caller, catalog, preference);
  const context: ActionCallContext = { ...authorized,
    ...(backgroundHostCurrent ? { retain_background_authority: mcpBackgroundAuthority(authorized, home, preference, catalog, source => host.inspectActions(source, reference), backgroundHostCurrent) } : {}),
    ...(isExternalRuntimeClient(caller.actor_id) && !caller.runtime_session_id ? { runtime_session_missing: true as const } : {}),
    validate_permissions: async permissions => {
      await checkTransport?.();
      currentCatalog = await host.inspectActions(caller, reference);
      const saved = home ? await readMcpToolPreference(home) : preference;
      const current = resolveMcpActionContext(caller, originalCatalog(currentCatalog, saved), saved);
      if (!permissions.every(permission => current.permissions.includes(permission))) throw mcpGrantErrors.permission_revoked("此客户端的场景权限已撤销，请重新检查对外接入设置");
      await checkTransport?.();
    },
    validate_authority: async action => {
      await checkTransport?.();
      const current = await host.inspectActions(caller, reference);
      currentCatalog = current;
      const saved = home ? await readMcpToolPreference(home) : preference;
      assertMcpActionAuthority(caller, originalCatalog(current, saved), saved, action);
      await checkTransport?.();
    },
    assert_authority_current: (action, requiredPermissions) => {
      caller.signal?.throwIfAborted();
      requireSynchronous(assertTransportCurrent?.(), "最终运输检查必须同步完成");
      requireSynchronous(caller.assert_authority_current?.(action, requiredPermissions), "最终授权检查必须同步完成");
      const current = home ? readMcpToolPreferenceSync(home) : preference;
      const original = originalCatalog(currentCatalog, current);
      if (action) assertMcpActionAuthority(caller, original, current, action);
      if (requiredPermissions) {
        const granted = resolveMcpActionContext(caller, original, current).permissions;
        if (!requiredPermissions.every(permission => granted.includes(permission))) throw mcpGrantErrors.permission_revoked("此客户端的场景权限已撤销，请重新检查对外接入设置");
      }
      caller.signal?.throwIfAborted();
      requireSynchronous(assertTransportCurrent?.(), "最终运输检查必须同步完成");
    },
  };
  return { context, preference, service: reference ? host.actionClient(reference) : host.homeActionClient() };
}
