/** Generated as the F2 contract-only workspace boundary. */
import type { ContractDescriptor } from "./package.js";

export const platformStorageContract = {
  contractId: "io.molis.work.platform.storage.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/platform/STORAGE-AND-EXCHANGE.md",
} as const satisfies ContractDescriptor;

/** Existing local journal wire fields; the producing Module retains fact ownership. */
export interface StoredModuleEvent {
  seq: number;
  type: string;
  object_type: string;
  object_id: string;
  payload: Record<string, unknown>;
  at: string;
}
