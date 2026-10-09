// Security invariant S-14 (docs/system/SECURITY-INVARIANTS.md; spec F15/D9): what a page can ask the desktop shell to do.
//
// The Tauri shell loads the workbench from the local web host and gives that origin native commands: it can spawn a process in a
// pseudo-terminal (`pty_spawn` runs any command it is given), read and write the shelf's files, open a link in the system browser.
// The only thing between a page and those commands is the capability files in apps/desktop/src-tauri/capabilities: which origins
// (`remote.urls`), which windows, which permissions. This test pins all three, so widening any of them (a wildcard host or port,
// a new window, a new permission such as a shell, filesystem, HTTP or updater plugin) fails here and has to be argued for in the
// review that changes this file.
//
// What it cannot show (needs a build of the shell; tracked in docs/system/SECURITY-INVARIANTS.md as open): whether a same-origin
// iframe (a plugin frame, the plugin builder's trial) can invoke these commands, and what `csp: null` in tauri.conf.json means for
// the pages the shell loads.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SHELL = fileURLToPath(new URL("../apps/desktop/src-tauri/", import.meta.url));
const MAIN_RS = fileURLToPath(new URL("../apps/desktop/adapters/tauri/src/main.rs", import.meta.url));

interface Capability { identifier: string; windows: string[]; remote?: { urls: string[] }; permissions: unknown[]; webviews?: string[]; local?: boolean; platforms?: string[] }
const capabilities: Capability[] = readdirSync(join(SHELL, "capabilities")).filter(name => name.endsWith(".json")).sort()
  .map(name => JSON.parse(readFileSync(join(SHELL, "capabilities", name), "utf8")) as Capability);

/** The web host the shell loads, by its two loopback names. A port other than 4173, a scheme other than http, another host or a wildcard host is a different promise. */
const ORIGIN_PATTERN = /^http:\/\/(?:127\.0\.0\.1|localhost):4173\/(?:[A-Za-z0-9_\-/]*\*)?$/;
const PERMISSIONS = new Map<string, string[]>([
  ["default", ["allow-capsule-window", "allow-pty-kill", "allow-pty-resize", "allow-pty-spawn", "allow-pty-write", "allow-shelf-desktop", "core:app:default", "core:event:default", "core:webview:default", "core:window:allow-start-dragging", "core:window:default", "core:default"].sort()],
  ["context-directories", ["allow-context-directories"]],
  ["main-external-links", ["allow-open-external-url"]],
]);

test("S-14 every capability reaches only the local web host's own origin, on named windows, with the pinned permissions", () => {
  assert.deepEqual(capabilities.map(capability => capability.identifier).sort(), [...PERMISSIONS.keys()].sort(), "a new capability file needs a line in this test");
  for (const capability of capabilities) {
    assert.ok(capability.remote?.urls?.length, `${capability.identifier}: a capability without remote.urls would apply to the shell's own files, not to this host`);
    for (const url of capability.remote!.urls) assert.match(url, ORIGIN_PATTERN, `${capability.identifier}: ${url}`);
    assert.ok(capability.windows.length > 0 && capability.windows.every(window => ["main", "capsule"].includes(window)), `${capability.identifier}: windows ${capability.windows}`);
    assert.ok(!capability.windows.some(window => window.includes("*")), `${capability.identifier}: a wildcard window`);
    assert.equal(capability.webviews, undefined, `${capability.identifier}: webview scoping is not used; windows are the unit`);
    const granted = capability.permissions.map(permission => { assert.equal(typeof permission, "string", `${capability.identifier}: a permission with a scope object`); return permission as string; }).sort();
    assert.deepEqual(granted, PERMISSIONS.get(capability.identifier), `${capability.identifier}: the granted permissions changed`);
  }
});

test("S-14 no capability grants a plugin that reaches outside the app: shell, filesystem, HTTP, process, updater, opener, dialogs, clipboard, global shortcuts", () => {
  const forbidden = /^(?:shell|fs|http|process|updater|opener|dialog|os|clipboard-manager|global-shortcut|notification|deep-link|autostart|store|sql|stronghold|upload|websocket|positioner|log|cli|barcode-scanner|nfc|biometric|haptics|geolocation)\b/;
  for (const capability of capabilities) for (const permission of capability.permissions as string[]) assert.doesNotMatch(permission, forbidden, `${capability.identifier}: ${permission}`);
  // The core sets the shell uses are the default ones; nothing that opens a window of another origin or evaluates script.
  for (const capability of capabilities) for (const permission of capability.permissions as string[]) assert.doesNotMatch(permission, /^core:(?:webview|window):allow-(?:create|eval|set-webview|internal|navigate|print)/, `${capability.identifier}: ${permission}`);
});

test("S-14 each permission is defined in the shell, allows only commands the shell registers, and the capabilities grant no command that does not exist", () => {
  const definitions = new Map<string, string[]>();
  for (const name of readdirSync(join(SHELL, "permissions")).filter(file => file.endsWith(".toml"))) {
    const text = readFileSync(join(SHELL, "permissions", name), "utf8");
    for (const block of text.split("[[permission]]").slice(1)) {
      const identifier = /identifier\s*=\s*"([^"]+)"/.exec(block)?.[1];
      const allowed = /commands\.allow\s*=\s*\[([^\]]*)\]/.exec(block)?.[1] ?? "";
      assert.ok(identifier, `${name}: a permission without an identifier`);
      definitions.set(identifier, [...allowed.matchAll(/"([^"]+)"/g)].map(match => match[1]!));
    }
  }
  const registered = new Set([...(/generate_handler!\[([\s\S]*?)\]/.exec(readFileSync(MAIN_RS, "utf8"))?.[1] ?? "").matchAll(/(?:[A-Za-z_]+::)?([a-z_][a-z0-9_]*)\s*,?/g)].map(match => match[1]!));
  assert.ok(registered.has("pty_spawn") && registered.has("shelf_open_path"), "the command list was read");
  for (const [identifier, commands] of definitions) for (const command of commands) assert.ok(registered.has(command), `${identifier} allows ${command}, which the shell does not register`);
  for (const capability of capabilities) for (const permission of capability.permissions as string[]) {
    if (permission.startsWith("core:")) continue;
    assert.ok(definitions.has(permission), `${capability.identifier}: ${permission} is defined nowhere`);
  }
  // The terminal commands are the powerful ones: they are granted to the default capability's windows and to nothing narrower or wider.
  const spawning = capabilities.filter(capability => (capability.permissions as string[]).some(permission => (definitions.get(permission) ?? []).includes("pty_spawn")));
  assert.deepEqual(spawning.map(capability => capability.identifier), ["default"]);
});

test("S-14 the shell's own configuration does not turn on remote IPC for every domain or load anything but the local placeholder first", () => {
  const configuration = JSON.parse(readFileSync(join(SHELL, "tauri.conf.json"), "utf8")) as { app: { windows: Array<{ label: string; url: string }>; security?: Record<string, unknown> }; build: { frontendDist: string } };
  assert.deepEqual(configuration.app.windows.map(window => window.label).sort(), ["capsule", "main"]);
  for (const window of configuration.app.windows) assert.equal(window.url, "index.html", `${window.label} starts from the local placeholder, not from a web address`);
  for (const key of Object.keys(configuration.app.security ?? {})) assert.ok(["csp"].includes(key), `app.security.${key}: a security setting was added; decide what it means for remote pages and update this test`);
  assert.equal(JSON.stringify(configuration).includes("dangerousRemoteDomainIpcAccess"), false);
  assert.equal(JSON.stringify(configuration).includes("dangerousDisableAssetCspModification"), false);
  assert.equal(configuration.build.frontendDist, "../webview-placeholder");
});
