#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const packageVersion = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version;
const tauriVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
).version;
const cargoToml = readFileSync(resolve(repoRoot, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
const cargoLock = readFileSync(resolve(repoRoot, "apps/desktop/src-tauri/Cargo.lock"), "utf8");
const feedRuntime = readFileSync(resolve(repoRoot, "apps/local-host/src/feed-source-runtime.ts"), "utf8");
const codexTransport = readFileSync(
  resolve(repoRoot, "horizontal/runtime-host/src/adapters/codex-app-server.ts"),
  "utf8",
);
const cargoTomlVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];
const cargoLockVersion = cargoLock.match(
  /\[\[package\]\]\nname = "molis-work-desktop"\nversion = "([^"]+)"/,
)?.[1];
const feedRuntimeVersion = feedRuntime.match(/^const APP_VERSION = "([^"]+)";$/m)?.[1];
const codexTransportVersion = codexTransport.match(
  /clientInfo: \{ name: "molis-work-session-browser", title: "Molis Work", version: "([^"]+)" \}/,
)?.[1];

const versions = {
  "package.json": packageVersion,
  "apps/desktop/src-tauri/tauri.conf.json": tauriVersion,
  "apps/desktop/src-tauri/Cargo.toml": cargoTomlVersion,
  "apps/desktop/src-tauri/Cargo.lock#molis-work-desktop": cargoLockVersion,
  "apps/local-host/src/feed-source-runtime.ts#APP_VERSION": feedRuntimeVersion,
  "horizontal/runtime-host/src/adapters/codex-app-server.ts#clientInfo.version": codexTransportVersion,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== packageVersion);
if (mismatches.length > 0) {
  const details = Object.entries(versions)
    .map(([source, version]) => `${source}=${version ?? "missing"}`)
    .join(", ");
  throw new Error(`Molis Work release versions are inconsistent: ${details}`);
}

console.log(`Molis Work release version sources agree: ${packageVersion}`);
