import { requireSynchronous, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpToolPreference } from "./mcp-settings-store.js";
import { readMcpToolPreference, readMcpToolPreferenceSync } from "./mcp-settings-store.js";
import { assertMcpActionAuthority } from "./mcp-action-grants.js";

/** Opt-in by an actual MCP transport: preserve its stable actor/grants after an accepted command, not its socket. */
export function mcpBackgroundAuthority(caller: ActionCallContext, home: string | undefined, preference: McpToolPreference,
  catalog: readonly ActionView[], inspect: (caller: ActionCallContext) => Promise<readonly ActionView[]>, assertHost: () => void): NonNullable<ActionCallContext["retain_background_authority"]> {
  return references => {
    caller.signal?.throwIfAborted(); requireSynchronous(assertHost());
    const pinned: readonly ActionReference[] = references.map(ref => Object.freeze({ ...ref }));
    const retained = { ...caller, signal: undefined };
    let currentCatalog = catalog;
    const check = () => {
      requireSynchronous(assertHost());
      const current = home ? readMcpToolPreferenceSync(home) : preference;
      for (const reference of pinned) {
        requireSynchronous(caller.assert_authority_current?.(reference));
        assertMcpActionAuthority(retained, currentCatalog, current, reference);
      }
    };
    check();
    return Object.assign(async () => {
      check(); currentCatalog = await inspect(retained);
      const current = home ? await readMcpToolPreference(home) : preference;
      for (const reference of pinned) {
        await caller.validate_authority?.(reference);
        assertMcpActionAuthority(retained, currentCatalog, current, reference);
      }
      check();
    }, { assertCurrent: check });
  };
}
