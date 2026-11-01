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
  readonly permissions: readonly PluginPermissionView[];
  readonly declarations: readonly PluginDeclarationNeedingConsent[];
  /** The background jobs the Manifest declares: what the plugin keeps doing without being opened, and on which permissions. */
  readonly jobs: readonly PluginJobView[];
}

/** One permission as a person reads it: the plugin's own reason, and what the platform itself says it lets a plugin do (null for a permission the platform does not define). */
export interface PluginPermissionView {
  readonly permission: string;
  readonly required: boolean;
  /** False for a resource's shape-only permission which no validated operation requests. It cannot be granted. */
  readonly requested: boolean;
  readonly reason: string;
  readonly meaning: string | null;
}

/** An installed plugin's permission: what the Manifest asks for, and whether this installation holds it now (a required one always does). */
export interface PluginInstalledPermissionView extends PluginPermissionView {
  readonly granted: boolean;
}

/**
 * One plugin installed in a project, as the plugin's detail page shows it (ac-trust T7): who signed it and how far that is trusted, what it
 * asked for and why, what it keeps doing in the background, and the agreements the person gave it. `manifest_available` is false when the
 * Manifest it was installed with cannot be read; its permissions and jobs are then empty because they are unknown, not because there are none.
 */
export interface PluginInstalledView {
  readonly install_id: string;
  readonly plugin_id: string;
  readonly name: string;
  readonly version: string;
  readonly state: string;
  readonly trust: PluginTrustLevel;
  readonly publisher_signature: string;
  /** The name the person gave the publisher when pinning it; null for a publisher that is not pinned. */
  readonly publisher_label: string | null;
  readonly manifest_available: boolean;
  readonly permissions: readonly PluginInstalledPermissionView[];
  readonly jobs: readonly PluginJobView[];
  readonly consents: readonly PluginConsentRecord[];
  /** Why the Host's plugin host could not start this installation when it last tried (its kept package missing, its start failing); null when nothing is wrong with it. The `state` is the record's own. */
  readonly recovery_error: string | null;
}

/** A background job a Manifest declares (`background.jobs`). */
export interface PluginJobView {
  readonly job_id: string;
  readonly reason: string;
  readonly permissions: readonly string[];
}

/**
 * What the platform says a platform permission means, in its own words (BL-353): the plugin's `reason` is the plugin's account of why it
 * wants it, this is the platform's account of what it is. A prefix entry (`network:`, `secret:`) names what follows it. Permissions a plugin
 * defines for itself (`issues:write`) are not here, and have no platform meaning.
 */
const PLATFORM_PERMISSION_MEANINGS: Readonly<Record<string, string>> = {
  "storage:private": "在这个插件自己的私有空间里保存和读取数据，别的插件读不到",
  "actions:delegate": "以你的身份去调用动作目录里的动作。这是目前最宽的权限：它能做你能做的事",
  "model:invoke": "调用你配置的模型来生成内容，可能产生模型费用",
  "model:read": "查看有哪些模型、能不能用，不调用模型",
  "surface:browser": "在侧栏浏览器里打开它声明的网站",
  "network:": "连接到这个网站：",
  "secret:": "读取你存放的这项密钥：",
};

export function platformPermissionMeaning(permission: string): string | null {
  const exact = PLATFORM_PERMISSION_MEANINGS[permission];
  if (exact !== undefined) return exact;
  const prefix = permission.slice(0, permission.indexOf(":") + 1);
  const named = prefix === "network:" || prefix === "secret:" ? PLATFORM_PERMISSION_MEANINGS[prefix] : undefined;
  return named === undefined ? null : named + permission.slice(prefix.length);
}
