// What a plugin page may ask about installing a signed package (`UiPluginClientHost.packageInstall`), published through the
// `platform/ui` subpath. The preview, the person's choices, the keys they type and every write stay with the trusted shell and Host.

/**
 * A signed package the page holds and offers to install here (specs/plugin-builder-upgrade/spec.md §7.0): the bundle as it was
 * signed, whole. The Host verifies it as it verifies a package the person imports in the settings, and what installing means comes
 * from the package itself, never from the page.
 */
export interface UiPackageInstallTarget {
  readonly bundle: unknown;
}

/**
 * What the page learns: which plugin and version is installed now, that the person put it off, or that it could not be installed
 * (with the refusal's code; the sheet has already said why). Never which permissions the person chose, or a key.
 */
export type UiPackageInstallOutcome =
  | { readonly status: "installed"; readonly plugin_id: string; readonly version: string }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly code: string };
