import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import { assertMcpActionAuthority, resolveMcpActionContext } from "./mcp-action-grants.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";

/** Shared by direct MCP and its authenticated local transport. Neither grants itself authority. */
export async function authorizeMcpActions(host: Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient">, caller: ActionCallContext, home: string | undefined,
  reference?: LocalHostProjectReference, checkTransport?: () => void | Promise<void>) {
  const preference = home ? await readMcpToolPreference(home) : { version: 1 as const, overrides: {} };
  const catalog = await host.inspectActions(caller, reference);
  const context: ActionCallContext = { ...resolveMcpActionContext(caller, catalog, preference),
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
