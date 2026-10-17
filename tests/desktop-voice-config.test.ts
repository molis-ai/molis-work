import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nativeRoot = fileURLToPath(new URL("../apps/desktop/src-tauri/", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const macOnly = { skip: process.platform !== "darwin", timeout: 60_000 };
const microphonePurpose = "麦克风用来把口述转成这台设备上可编辑的文字。";

type MacConfig = {
  bundle: { macOS: { infoPlist: unknown; entitlements: unknown; hardenedRuntime?: boolean } };
  app?: { security?: { csp?: string } };
};

async function isolatedConfig(run: (directory: string, mac: MacConfig) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "molis-desktop-voice-config-"));
  try {
    for (const name of ["tauri.conf.json", "tauri.macos.conf.json", "Info.plist", "Entitlements.plist", "Cargo.toml", "Cargo.lock"]) {
      await copyFile(join(nativeRoot, name), join(directory, name));
    }
    const mac: MacConfig = JSON.parse(await readFile(join(directory, "tauri.macos.conf.json"), "utf8"));
    await run(directory, mac);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function inspectNativeConfig(directory: string) {
  // `inspect wix-upgrade-code` uses the Windows target, so it cannot prove macOS merging.
  // `info` parses this host's real platform configuration without building or bundling.
  const result = spawnSync(process.execPath, [cli, "info"], {
    cwd: directory, encoding: "utf8", timeout: 20_000,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

test("UIV-05 macOS voice configuration is accepted and merged by the installed Tauri CLI", macOnly, async () => {
  await isolatedConfig(async (directory, mac) => {
    const current = inspectNativeConfig(directory);
    assert.equal(current.status, 0, current.output);
    const base = JSON.parse(await readFile(join(directory, "tauri.conf.json"), "utf8"));
    assert.ok(current.output.includes(`frontendDist: ${base.build.frontendDist}`), current.output);
    const marker = "UIV macOS merge fixture";
    mac.app = { ...mac.app, security: { ...mac.app?.security, csp: marker } };
    await writeFile(join(directory, "tauri.macos.conf.json"), JSON.stringify(mac));
    const merged = inspectNativeConfig(directory);
    assert.equal(merged.status, 0, merged.output);
    assert.ok(merged.output.includes(`CSP: ${marker}`), merged.output);
    assert.ok(merged.output.includes(`frontendDist: ${base.build.frontendDist}`), merged.output);
  });
});

test("UIV-05 Tauri rejects an inline microphone plist object in the macOS override", macOnly, async () => {
  await isolatedConfig(async (directory, mac) => {
    mac.bundle.macOS.infoPlist = { NSMicrophoneUsageDescription: microphonePurpose };
    await writeFile(join(directory, "tauri.macos.conf.json"), JSON.stringify(mac));
    const rejected = inspectNativeConfig(directory);
    assert.notEqual(rejected.status, 0, rejected.output);
    assert.match(rejected.output, /bundle > macOS > infoPlist/);
    assert.match(rejected.output, /not of types.*string/);
  });
});

async function parsedNativePlist(configured: unknown): Promise<Record<string, unknown>> {
  assert.ok(typeof configured === "string" && configured.length > 0);
  assert.equal(isAbsolute(configured), false);
  const plistPath = join(nativeRoot, configured);
  assert.equal(relative(nativeRoot, plistPath).startsWith(".."), false);
  assert.equal((await stat(plistPath)).isFile(), true);
  const parsed = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], {
    encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(parsed.error);
  assert.equal(parsed.status, 0, parsed.stderr);
  return JSON.parse(parsed.stdout);
}

test("UIV-05 configured native plist exists and contains a parsed microphone purpose", macOnly, async () => {
  const mac: MacConfig = JSON.parse(await readFile(join(nativeRoot, "tauri.macos.conf.json"), "utf8"));
  const plist = await parsedNativePlist(mac.bundle.macOS.infoPlist);
  assert.equal(plist.NSMicrophoneUsageDescription, microphonePurpose);
});

test("UIV-05 native microphone entitlement allows only audio input and keeps Hardened Runtime", macOnly, async () => {
  const mac: MacConfig = JSON.parse(await readFile(join(nativeRoot, "tauri.macos.conf.json"), "utf8"));
  const entitlements = await parsedNativePlist(mac.bundle.macOS.entitlements);
  assert.deepEqual(entitlements, { "com.apple.security.device.audio-input": true });
  const base = JSON.parse(await readFile(join(nativeRoot, "tauri.conf.json"), "utf8"));
  const schema = JSON.parse(await readFile(new URL("../node_modules/@tauri-apps/cli/config.schema.json", import.meta.url), "utf8"));
  const hardened = mac.bundle.macOS.hardenedRuntime ?? base.bundle?.macOS?.hardenedRuntime
    ?? schema.definitions.MacConfig.properties.hardenedRuntime.default;
  assert.equal(hardened, true);
});
