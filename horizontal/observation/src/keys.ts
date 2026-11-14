import { createHmac, randomBytes } from "node:crypto";
import { createLocalPayloadProtection, type SecretStore } from "@molis-ai/molis-work-storage";

/** The Home secrets the evidence is sealed and digested with (contract-design §6). Both live in the Home's secret store, never in the library. */
export const OBSERVATION_EVIDENCE_KEY_REF = "system:observation:evidence:v1";
export const OBSERVATION_DIGEST_KEY_REF = "system:observation:digest:v1";

/**
 * What the write batch needs to keep a snapshot: a keyed digest (so a copy of the library cannot confirm a guessed text) and the seal.
 * Either may throw when the key cannot be had; the batch then keeps that evidence as `missing: not_obtained`.
 */
export interface ObservationKeys {
  digest(text: string): string;
  seal(body: Uint8Array, digest: string): Uint8Array;
  open(sealed: Uint8Array, digest: string): Uint8Array;
}

/**
 * The keys from the Home's secret store. `hasEvidence`: whether the library already holds sealed bodies, so a key that went missing is
 * reported as unavailable instead of being made anew over data it can no longer open.
 */
export function observationKeys(secrets: Pick<SecretStore, "get" | "createIfAbsent">, hasEvidence: () => boolean): ObservationKeys {
  const protection = createLocalPayloadProtection({ secrets, keyRef: OBSERVATION_EVIDENCE_KEY_REF, scope: "observation-evidence", authorize: () => {}, hasProtectedData: hasEvidence });
  let digestKey: Buffer | undefined;
  const key = (): Buffer => {
    if (digestKey) return digestKey;
    let raw = secrets.get(OBSERVATION_DIGEST_KEY_REF);
    if (raw === null) {
      if (hasEvidence()) throw new Error("observation digest key missing");
      secrets.createIfAbsent(OBSERVATION_DIGEST_KEY_REF, randomBytes(32).toString("base64"));
      raw = secrets.get(OBSERVATION_DIGEST_KEY_REF);
    }
    const value = raw === null ? undefined : Buffer.from(raw, "base64");
    if (!value || value.length !== 32) throw new Error("observation digest key unreadable");
    return digestKey = value;
  };
  return {
    digest: text => createHmac("sha256", key()).update(text, "utf8").digest("hex"),
    seal: (body, digest) => protection.seal(body, digest),
    open: (sealed, digest) => protection.open(sealed, digest),
  };
}
