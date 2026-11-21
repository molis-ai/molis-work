type NodeVersionCheck = { ok: true } | {
  ok: false;
  code: "node_version_mismatch";
  actual: string;
  required: string;
  message: string;
};

type NativeToolchainCheck = { ok: true; mode: "prebuilt" | "toolchain" } | {
  ok: false;
  code: "native_toolchain_missing";
  missing: string[];
  message: string;
};

interface NativeToolchainOptions {
  platform?: string;
  arch?: string;
  repoRoot?: string;
  hasCommand?: (name: string) => boolean;
}

interface PreflightOptions extends NativeToolchainOptions {
  nodeVersion?: string;
  strictNative?: boolean;
  report?: (message: string) => void;
}

export function checkNodeVersion(actualVersion: string, requiredRange: string): NodeVersionCheck;
export function checkNativePtyPrereqs(options?: NativeToolchainOptions): NativeToolchainCheck;
export function runPreflight(options?: PreflightOptions): 0 | 1;
