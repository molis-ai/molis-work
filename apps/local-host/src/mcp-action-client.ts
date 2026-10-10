import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import { assertMcpActionAuthority, isExternalRuntimeClient, resolveMcpActionContext } from "./mcp-action-grants.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";

/** Shared by direct MCP and its authenticated local transport. Neither grants itself authority. */
export async function authorizeMcpActions(host: Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient">, caller: ActionCallContext, home: string | undefined,
  reference?: LocalHostProjectReference, checkTransport?: () => void | Promise<void>) {
  const preference = home ? await readMcpToolPreference(home) : { version: 2 as const, action_grants: [] };
  const catalog = await host.inspectActions(caller, reference);
  // An external Runtime with no stable Session says so on its context; dispatch then refuses every action that declares
  // `authorship: "session"`, whether the client calls it or a wrapper (an offer, a workflow step) does.
  const context: ActionCallContext = { ...resolveMcpActionContext(caller, catalog, preference),
    ...(isExternalRuntimeClient(caller.actor_id) && !caller.runtime_session_id ? { runtime_session_missing: true as const } : {}),
    validate_permissions: async permissions => {
      await checkTransport?.();
      const current = resolveMcpActionContext(caller, await host.inspectActions(caller, reference), home ? await readMcpToolPreference(home) : preference);
      if (!permissions.every(permission => current.permissions.includes(permission))) throw new ActionError("mcp.permission_revoked", "此客户端的场景权限已撤销，请重新检查对外接入设置");
      await checkTransport?.();
    },
    validate_authority: async action => {
      await checkTransport?.();
      const current = await host.inspectActions(caller, reference);
      assertMcpActionAuthority(caller, current, home ? await readMcpToolPreference(home) : preference, action);
      await checkTransport?.();
    },
  };
  return { context, preference, service: reference ? host.actionClient(reference) : host.homeActionClient() };
}
