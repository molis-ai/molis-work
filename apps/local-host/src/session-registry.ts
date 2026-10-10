import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { MolisWorkSessionRegistry, type MolisWorkSessionRegistryOptions } from "@molis-ai/molis-work-module-private-work-context";
import { resolveConfiguredHome } from "./product-home.js";

/** The Ledger the Sessions registry keeps its relations in: the registry's own connection, the registry's own scope. */
export function createSessionLedger(db: Parameters<typeof createContextLedger>[0], now?: () => Date): ContextLedgerApi {
  return createContextLedger(db, { now, authorize: (access) => access.scope.kind === "personal" && access.scope.id === "private-work-context" });
}

/** Same connection gives Session writes and private Ledger relations one atomic commit. */
export function openWorkSessionRegistry(options: Omit<MolisWorkSessionRegistryOptions, "createLedger"> = {}): Promise<MolisWorkSessionRegistry> {
  return MolisWorkSessionRegistry.open({
    ...options,
    homeDirectory: options.homeDirectory ?? resolveConfiguredHome(),
    createLedger: (db) => createSessionLedger(db, options.now),
  });
}
