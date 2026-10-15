import { ActionError, requireSynchronous, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import { assertMcpActionAuthority, isExternalRuntimeClient, resolveMcpActionContext } from "./mcp-action-grants.js";
import { readMcpToolPreference, readMcpToolPreferenceSync } from "./mcp-settings-store.js";

/** Shared by direct MCP and its authenticated local transport. Neither grants itself authority. */
export async function authorizeMcpActions(host: Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient">, caller: ActionCallContext, home: string | undefined,
  reference?: LocalHostProjectReference, checkTransport?: () => void | Promise<void>, assertTransportCurrent?: () => void) {
  const preference = home ? await readMcpToolPreference(home) : { version: 2 as const, action_grants: [] };
  const catalog = await host.inspectActions(caller, reference);
  let currentCatalog = catalog;
  // An external Runtime with no stable Session says so on its context; dispatch then refuses every action that declares
  // `authorship: "session"`, whether the client calls it or a wrapper (an offer, a workflow step) does.
  const context: ActionCallContext = { ...resolveMcpActionContext(caller, catalog, preference),
    ...(isExternalRuntimeClient(caller.actor_id) && !caller.runtime_session_id ? { runtime_session_missing: true as const } : {}),
    validate_permissions: async permissions => {
      await checkTransport?.();
      currentCatalog = await host.inspectActions(caller, reference);
      const current = resolveMcpActionContext(caller, currentCatalog, home ? await readMcpToolPreference(home) : preference);
      if (!permissions.every(permission => current.permissions.includes(permission))) throw new ActionError("mcp.permission_revoked", "此客户端的场景权限已撤销，请重新检查对外接入设置");
      await checkTransport?.();
    },
    validate_authority: async action => {
      await checkTransport?.();
      const current = await host.inspectActions(caller, reference);
      currentCatalog = current;
      assertMcpActionAuthority(caller, current, home ? await readMcpToolPreference(home) : preference, action);
      await checkTransport?.();
    },
    assert_authority_current: (action, requiredPermissions) => {
      caller.signal?.throwIfAborted();
      requireSynchronous(assertTransportCurrent?.(), "最终运输检查必须同步完成");
      requireSynchronous(caller.assert_authority_current?.(action, requiredPermissions), "最终授权检查必须同步完成");
      const current = home ? readMcpToolPreferenceSync(home) : preference;
      if (action) assertMcpActionAuthority(caller, currentCatalog, current, action);
      if (requiredPermissions) {
        const granted = resolveMcpActionContext(caller, currentCatalog, current).permissions;
        if (!requiredPermissions.every(permission => granted.includes(permission))) throw new ActionError("mcp.permission_revoked", "此客户端的场景权限已撤销，请重新检查对外接入设置");
      }
      caller.signal?.throwIfAborted();
      requireSynchronous(assertTransportCurrent?.(), "最终运输检查必须同步完成");
    },
  };
  return { context, preference, service: reference ? host.actionClient(reference) : host.homeActionClient() };
}
