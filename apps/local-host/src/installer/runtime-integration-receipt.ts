import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { VersionedFile } from "@molis-ai/molis-work-storage";
import { isOwnedIntegrationOwner, isSupportedRuntimeId } from "./runtime-integration-contract.js";
import type { IntegrationReceipt } from "./runtime-integration-contract.js";

const RECEIPT_KEYS = ["schema_version", "owner", "runtime_id", "config_path", "config_entry_fingerprint", "connected_at"] as const;
const CURRENT = /* @version format.runtime.integration.receipt */ 1;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** The current receipt and nothing else: Molis Work's own owner, a Runtime it supports, and exactly the fields it writes. */
function parseReceipt(value: unknown): IntegrationReceipt {
  if (!isRecord(value) || Object.keys(value).length !== RECEIPT_KEYS.length || !RECEIPT_KEYS.every(key => key in value)
    || !text(value.owner) || !isOwnedIntegrationOwner(value.owner) || !text(value.runtime_id) || !isSupportedRuntimeId(value.runtime_id)
    || !text(value.config_path) || !text(value.config_entry_fingerprint) || !text(value.connected_at)
    || value.schema_version !== CURRENT) throw new Error("runtime integration receipt invalid");
  return { schema_version: CURRENT, owner: value.owner, runtime_id: value.runtime_id, config_path: value.config_path,
    config_entry_fingerprint: value.config_entry_fingerprint, connected_at: value.connected_at };
}

/** `runtime-integrations/<runtime>.json` (upgrade-chain-design §2.6), verified by the Host's upgrade round under the Home's lock. */
export const RUNTIME_INTEGRATION_RECEIPT_FILE: VersionedFile<IntegrationReceipt> = {
  version: /* @version format.runtime.integration.receipt */ 1,
  field: "schema_version",
  upgrades: [],
  parse: parseReceipt,
};
