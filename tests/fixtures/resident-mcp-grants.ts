import assert from "node:assert/strict";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { grantMcpAction, orderGrantViews } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { TestHostServer } from "./test-home.js";

/** Test setup only: persist each client's grants once; reconnects must use the saved grants rather than recreate them. */
export function residentMcpGrants() {
  const granted = new WeakMap<TestHostServer, Set<string>>();
  return async (resident: TestHostServer, projectId: string | null, actor: string, prefix: string, permissions: readonly string[]) => {
    const key = JSON.stringify([projectId, actor]), scopes = granted.get(resident) ?? new Set<string>();
    if (scopes.has(key)) return;
    const catalog = await resident.inspect(actor, projectId);
    // The pre-grant view deliberately reports forbidden. The management endpoint checks actual availability for each grant.
    const views = orderGrantViews(catalog.filter(view => view.capability_id.startsWith(`${prefix}.`)
      && view.action.scope === (projectId === null ? "home" : "project")
      && view.action.audiences.includes("mcp") && view.action.permissions.every(permission => permissions.includes(permission))));
    assert.ok(views.length > 0, `No ${prefix} actions in this resident scope`);
    const reference = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
    // The existing settings contract accepts one grant plus at most sixteen peers, all checked and saved by the same owner.
    for (let offset = 0; offset < views.length; offset += 17) {
      const [first, ...peers] = views.slice(offset, offset + 17);
      await grantMcpAction(resident.web, { clientId: actor, projectId, action: reference(first!), with: peers.map(reference) });
    }
    scopes.add(key); granted.set(resident, scopes);
  };
}
