// Install trust and consent (ac-trust T1, specs/repository-anti-corruption/slices/ac-trust-install.md). Trust says who gave the evidence for
// an install, never how important the plugin is; consent is one recorded row per declaration that changes a plugin's effect elsewhere.

/** Who vouches for an installation: the Host's own build, a signature a person pinned, or nobody. */
export type PluginTrustLevel = "host" | "pinned" | "unsigned";

/**
 * The evidence an install is made with. Only the Host builds one of these: a Manifest, a package field or a caller's input never
 * names its own level. `host` is a definition object of the Host's start list; `pinned` is a verified signature of a publisher the
 * person pinned (`publisher_key_id` is the key's fingerprint, the `ed25519:sha256:…` form).
 */
export type PluginTrust =
  | { readonly level: "host" }
  | { readonly level: "pinned"; readonly publisher_key_id: string }
  | { readonly level: "unsigned" };

/** The declarations of a Manifest that change what the plugin does elsewhere; each is agreed to, or not, on its own. */
export type PluginConsentKind = "always_on" | "default_wiring" | "default_group" | "local_directory";

/** Who recorded a consent: a person, or the Host on a `host` install's behalf from the Manifest it ships. */
export type PluginConsentGranter = "user" | "host_build";

/** One declaration of a Manifest that asks for consent, as an install preview lists it. */
export interface PluginDeclarationNeedingConsent {
  readonly kind: PluginConsentKind;
  /** The declaration, written the one way (`consentSubject`); a changed declaration is a different subject. */
  readonly subject: string;
  /** What agreeing means, in the words the preview shows. */
  readonly summary: string;
}

/** A consent given with an install: which declaration, nothing more. The plugin, publisher and Manifest digest come from the install. */
export interface PluginConsentGrant {
  readonly kind: PluginConsentKind;
  readonly subject: string;
}

/** One row of the consent ledger. Revoking writes `revoked_at`; the row is never rewritten or deleted. */
export interface PluginConsentRecord {
  readonly consent_id: string;
  readonly plugin_id: string;
  /** The publisher signature of the Manifest the consent was given for: a plugin of another publisher under the same id has none. */
  readonly publisher_signature: string;
  readonly kind: PluginConsentKind;
  readonly subject: string;
  readonly manifest_digest: string;
  readonly granted_at: string;
  readonly granted_by: PluginConsentGranter;
  readonly revoked_at: string | null;
}

/** A publisher a person pinned: the key fingerprint, its public key, and when and by whom it was pinned or revoked. */
export interface PluginPublisherPin {
  readonly key_id: string;
  readonly public_key_spki_base64: string;
  readonly label: string;
  readonly pinned_at: string;
  readonly pinned_by: string;
  readonly revoked_at: string | null;
}

/** What a person sees before an install is confirmed. */
export interface PluginInstallPreview {
  readonly plugin_id: string;
  readonly version: string;
  readonly trust: PluginTrustLevel;
  readonly publisher_signature: string;
  /** Whether the publisher is already pinned; a `pinned` install of a new publisher asks the person to pin it first. */
  readonly publisher_pinned: boolean;
  readonly permissions: readonly { readonly permission: string; readonly required: boolean }[];
  readonly declarations: readonly PluginDeclarationNeedingConsent[];
}
