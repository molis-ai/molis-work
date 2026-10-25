import type { PluginManifest } from "./plugin.js";

export interface PluginPackageFile {
  path: string;
  content_base64: string;
}

export interface PluginPackagePayload {
  schema_version: 1;
  manifest: PluginManifest;
  files: PluginPackageFile[];
}

export interface PluginPackageBundle {
  payload: PluginPackagePayload;
  signature: null | { algorithm: "ed25519"; value_base64: string };
  /**
   * The public key that checks `signature`, as DER SPKI in base64. The Host never takes it on the package's word: it must hash to the
   * Manifest's `publisher.signature` and to a publisher the person pinned (ac-trust). Null exactly when `signature` is null; the
   * signed bytes cover the payload only.
   */
  publisher_key: null | { algorithm: "ed25519"; spki_base64: string };
}

/** Implemented by the trusted publishing environment, never by Plugin application code. */
export interface PluginPackageSigner {
  readonly publisher_identity: string;
  /** The public half of the signing key, DER SPKI in base64: it goes into the signed package so the Host can check the signature. */
  readonly public_key_spki_base64: string;
  sign(payload: Uint8Array): Uint8Array;
}
