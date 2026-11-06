import { V_FORMAT_HOME_INSTALLATION } from "../versions.generated.js";
/** App-owned installation API and release-format types. No project facts. */

export const INSTALLER_ID = /* @version type.molis-work-home-install "molis-work-home-install-v{version}" */ "molis-work-home-install-v1";

export function isOwnedInstaller(installer: unknown): boolean {
  return installer === INSTALLER_ID;
}

export const SCHEMA_VERSION = V_FORMAT_HOME_INSTALLATION;

/** Skills that must exist in the install source and every owned release. */
export const REQUIRED_RELEASE_SKILL_FILES = [
  "skills/goal-advance/SKILL.md",
  "skills/molis-plugin-dev/SKILL.md",
] as const;

export const NODE_LAUNCHER_HEADER = "#!/usr/bin/env node\n// molis-work-home-launcher-v1";

export const BUNDLED_NODE_LAUNCHER_HEADER = "#!/bin/sh\n# molis-work-home-launcher-v2";

const OWNED_LAUNCHER_HEADERS = [
  NODE_LAUNCHER_HEADER,
  BUNDLED_NODE_LAUNCHER_HEADER,
] as const;

export const CURRENT_LAUNCHER_NAMES = ["molis-work", "molis-work-mcp", "molis-work-web"] as const;

export function isOwnedLauncherText(text: string): boolean {
  return OWNED_LAUNCHER_HEADERS.some((header) => text.startsWith(header));
}

export type MolisWorkHomeInstallStatus = "installed" | "upgraded" | "refreshed" | "repaired" | "unchanged";

export type MolisWorkHomeInstallStep =
  | "before_stage_release"
  | "before_activate_release"
  | "before_write_install_manifest";

export interface MolisWorkHomeInstallOptions {
  /** Defaults to ~/.molis-work. Tests and host integrations may supply another absolute path. */
  homeDirectory?: string;
  /** Package root containing dist/, skills/, package.json and node_modules/. */
  sourceDirectory: string;
  /** Defaults to the source package version. Intended for controlled release builds. */
  version?: string;
  /** Test-only failure injection used to verify rollback behavior. */
  beforeStep?: (step: MolisWorkHomeInstallStep) => void | Promise<void>;
}

export interface MolisWorkHomeInstallResult {
  status: MolisWorkHomeInstallStatus;
  runtime_layout: "self_contained";
  home_directory: string;
  version: string;
  release_directory: string;
  program_directory: string;
  skill_directory: string;
  project_directory: string;
  logs_directory: string;
  launchers: {
    cli: string;
    mcp: string;
    web: string;
  };
  next_steps: {
    message: string;
    web_command: string[];
    service_install_command: string[];
    service_restart_command: string[];
  };
  written_paths: string[];
  preserved_paths: string[];
  removed_paths: string[];
}

export interface ReleaseManifest {
  schema_version: number;
  installer: string;
  version: string;
  dependencies: "embedded";
  node_runtime?: "embedded";
  content_digest: string;
  created_at: string;
}

export interface InstallManifest {
  schema_version: number;
  installer: string;
  version: string;
  release_path: string;
  content_digest: string;
  updated_at: string;
}

/** Kept self-contained so generated Node launchers execute the same owner checks. */
export function isCurrentInstallManifest(value: unknown): value is InstallManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["schema_version", "installer", "version", "release_path", "content_digest", "updated_at"];
  return Object.keys(item).every(key => keys.includes(key))
    && item.schema_version === V_FORMAT_HOME_INSTALLATION && item.installer === INSTALLER_ID
    && typeof item.version === "string" && /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(item.version)
    && typeof item.release_path === "string" && item.release_path.replaceAll("\\", "/") === `releases/molis-work-${item.version}`
    && typeof item.content_digest === "string" && /^[0-9a-f]{64}$/.test(item.content_digest)
    && typeof item.updated_at === "string" && Number.isFinite(Date.parse(item.updated_at));
}

export function isCurrentReleaseManifest(value: unknown): value is ReleaseManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["schema_version", "installer", "version", "dependencies", "node_runtime", "content_digest", "created_at"];
  return Object.keys(item).every(key => keys.includes(key))
    && item.schema_version === V_FORMAT_HOME_INSTALLATION && item.installer === INSTALLER_ID
    && typeof item.version === "string" && /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(item.version)
    && item.dependencies === "embedded" && (!("node_runtime" in item) || item.node_runtime === "embedded")
    && typeof item.content_digest === "string" && /^[0-9a-f]{64}$/.test(item.content_digest)
    && typeof item.created_at === "string" && Number.isFinite(Date.parse(item.created_at));
}

export function installationMatchesRelease(installation: InstallManifest, release: ReleaseManifest): boolean {
  return installation.version === release.version && installation.content_digest === release.content_digest;
}

export interface PromotedRelease {
  releaseDirectory: string;
  created: boolean;
  backupDirectory: string | null;
}

export interface RuntimeDependencyPackage {
  name: string;
  version: string;
  directory: string;
  /** Copies required when another parent already keeps a different version at the top level. */
  nests?: RuntimeDependencyPackage[];
}

export interface InspectedSource {
  directory: string;
  version: string;
  license?: string;
  runtimeDependencies: RuntimeDependencyPackage[];
  /** `parent>child` dependencies the source's workspace removes (pnpm `overrides` to '-'); the release records them in its package.json. */
  removedDependencies: string[];
  bundledNodePath: string | null;
  contentDigest: string;
}

export interface TextMutation {
  filePath: string;
  previous: string | null;
}
