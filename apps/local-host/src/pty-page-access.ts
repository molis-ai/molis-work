import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { assertCapturedPluginActionCurrent, currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import { pluginPagesFor } from "./plugin-page-authority.js";

type Owner = { install_id: string; project_id: string | null; actor_id: string };
export interface PageTerminalAccess {
  assertPanel(panelId: string): Promise<void>;
}

let explicitOwner: Owner | null = null;

/** Synchronous owner scope for platform work-terminal spawns (`work-terminal-service.ts`), so only the owning plugin's page may attach. */
export function withTerminalPageOwner<T>(owner: Owner, run: () => T): T {
  const previous = explicitOwner;
  explicitOwner = owner;
  try { return run(); } finally { explicitOwner = previous; }
}

/** A server-side Runtime invocation or platform work-terminal spawn establishes ownership; browser messages can only attach to that established panel. */
export function pageTerminalOwnership(home?: string) {
  const owners = new Map<string, Owner>();
  return {
    record(panelId: string, attachOnly: boolean, alive: boolean) {
      const invocation = currentPluginInvocation();
      const owner = invocation
        ? (assertCapturedPluginActionCurrent(invocation, invocation), { install_id: invocation.install_id, project_id: invocation.caller.project_id, actor_id: invocation.caller.actor_id })
        : explicitOwner;
      if (!owner) return;
      const existing = owners.get(panelId);
      if (!existing && (attachOnly || alive)) throw new ActionError("actions.forbidden", "不能接管其他入口创建的终端");
      if (existing && (existing.install_id !== owner.install_id || existing.project_id !== owner.project_id || existing.actor_id !== owner.actor_id))
        throw new ActionError("actions.forbidden", "终端不属于当前插件调用");
      owners.set(panelId, owner);
    },
    connect(pageId: string): PageTerminalAccess {
      if (!home) throw new ActionError("actions.unavailable", "插件终端需要 Home");
      const page = pluginPagesFor(home).terminalAccess(pageId);
      return { async assertPanel(panelId) {
        await page.assertCurrent();
        const owner = owners.get(panelId);
        if (!owner || owner.install_id !== page.install_id || owner.project_id !== page.project_id || owner.actor_id !== page.actor_id)
          throw new ActionError("actions.forbidden", "终端不属于当前插件页面");
      } };
    },
    clear() { owners.clear(); },
  };
}
