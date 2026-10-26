import type { PluginManifest } from "./plugin.js";
import type { SandboxJson } from "./plugin-sandbox.js";

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

/**
 * The sandbox package format. A plugin that runs in the Host's sandbox (not in the Host's process) is installed from a
 * `PluginPackageBundle` whose `payload.files` hold exactly these files, relative to the package root. Any author can produce
 * one; the plugin studio is one author of it. The Host reads only this format: it checks the files against each other and against
 * the Manifest, and refuses a package that does not match before it writes anything (`plugin.declaration_invalid`).
 * The field-by-field description is in docs/platform/PLUGIN-DEVELOPMENT.md, “沙箱包格式”.
 */
export const SANDBOX_PACKAGE_FILES = {
  /** The Manifest, the same object as `payload.manifest`; the Host rebuilds it from the other files and refuses a package whose Manifest differs. */
  manifest: "manifest.json",
  /** The plugin's code, one self-contained ES module that exports its operations; it runs only in the sandbox process. */
  entrypoint: "plugin.mjs",
  /** The plugin's contract: its id, pages and regions, operations with schemas and the effects each one declares. */
  contract: "contract.json",
  /** The plugin's interface: see `SandboxPackageInterface`. */
  interface: "interface.json",
  /** What the plugin tells the model: an array of `SandboxPackagePrompt`. */
  prompts: "prompts.json",
} as const;

/** One prompt a sandbox plugin declares; the Host registers it so the person sees and edits it with every other prompt. */
export interface SandboxPackagePrompt {
  id: string;
  title: string;
  purpose: string;
  body: string;
}

/**
 * `interface.json`. Its objects use the vocabulary of the UI catalog (`/__ui/catalog`), which the Host validates against
 * `contract.json`; a field the Host does not know is refused, not ignored.
 */
export interface SandboxPackageInterface {
  /** The parts of the plugin's pages: `{ id, pageId, regionId, intent, purpose, props, read?, submit? }` each. */
  parts: SandboxJson[];
  /** The same parts as assembled: each part plus `kind`, the UI catalog component chosen for it among the ones its data allows. */
  nodes: SandboxJson[];
  /** How the pages are laid out and each part looks: `{ version: 1, pages, parts }`. Without it the Host lays the parts out in order. */
  presentation?: SandboxJson;
  /** Browser checks the author ran; advisory, the Host does not run them. */
  acceptance?: SandboxJson[];
}
