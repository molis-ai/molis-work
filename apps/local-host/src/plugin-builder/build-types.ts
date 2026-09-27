import type { SandboxEffects, SandboxIdentity, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';

import type { BuildManifest } from '@molis-ai/molis-work-contracts/platform/plugin-builder';
export type { BuildManifest, BuildDependency, BuildDependencyLock, BuildGateId, BuildGate, BuildCheckResult } from '@molis-ai/molis-work-contracts/platform/plugin-builder';
export interface BuildProject { root: string; sdkPath: string; operationFiles: Record<string, string>; testFiles: Record<string, string> }
export interface BuildCheckOptions {
  root: string; contract: SandboxPluginContract; manifest: BuildManifest; operationIds: readonly string[];
  services: SandboxServices; identity: SandboxIdentity; grants: SandboxEffects; signal?: AbortSignal;
  /** Deterministic capability/network fixtures. Never use production services for G5. */
  mockServices?: SandboxServices;
  /**
   * Where each operation's last passing source is kept. With it, the operations not being checked come from there (or
   * their stub) rather than the working copy, so another operation being written at the same time cannot fail this
   * check; and the bundle written on success holds every operation's last passing source.
   */
  settled?: string;
}
export interface BuildDependencyOptions {
  root: string; signal?: AbortSignal;
  /** Trusted host transport only. Requests must still address the official npm registry. */
  fetch?: typeof fetch;
  packageBytes?: number; totalBytes?: number; archiveBytes?: number; maxPackages?: number;
}
/** Validated as bounded JSON before writing developer materials. */
export type DeveloperCapabilities = unknown;
