/** Generated as the F2 contract-only workspace boundary. */
import type { ContractDescriptor } from "./package.js";

/** Ownership is independent of transport/sync state. Team scopes are reserved. */
export interface StorageSpace {
  spaceId: string;
  kind: "local" | "personal" | "team";
  ownerUserId: string | null;
  teamId: string | null;
  issuer: string | null;
  applicationId: string | null;
}

/** An asset keeps its owner's identity even while offline or not yet uploaded. */
export interface SpaceAssetRef {
  spaceId: string;
  owner: string;
  assetId: string;
  projectId?: string;
}

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
