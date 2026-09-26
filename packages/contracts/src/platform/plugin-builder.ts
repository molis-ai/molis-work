import type { SandboxEffects } from './plugin-sandbox.js';

export interface BuildManifest { version: 1; pluginId: string; revision: string; effects: SandboxEffects }
export interface BuildDependency {
  name: string; version: string; path: string; integrity: string; tarball: string;
  license: string; bytes: number; scriptsIgnored: boolean;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}
export interface BuildDependencyLock { version: 1; registry: 'https://registry.npmjs.org'; requested: Record<string, string>; packages: BuildDependency[] }
export type BuildGateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';
export interface BuildGate { id: BuildGateId; passed: boolean; detail: string }
export interface BuildCheckResult { passed: boolean; gates: BuildGate[]; bundlePath?: string; dependencies?: BuildDependencyLock }
