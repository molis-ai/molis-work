import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { MolisWorkSessionRegistry, type MolisWorkSessionRegistryOptions } from "@molis-ai/molis-work-module-private-work-context";
import { resolveConfiguredHome } from "./product-home.js";

/** Same connection gives Session writes and private Ledger relations one atomic commit. */
export function openWorkSessionRegistry(options: Omit<MolisWorkSessionRegistryOptions, "createLedger"> = {}): Promise<MolisWorkSessionRegistry> {
  return MolisWorkSessionRegistry.open({
    ...options,
    homeDirectory: options.homeDirectory ?? resolveConfiguredHome(),
    createLedger: (db) => createContextLedger(db, {
    now: options.now,
    authorize: (access) => access.scope.kind === "personal" && access.scope.id === "private-work-context",
  }) });
}
