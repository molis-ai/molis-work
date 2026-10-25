// Security invariant S-14 (docs/system/SECURITY-INVARIANTS.md; spec F15/D9): what a page can ask the desktop shell to do.
//
// The Tauri shell loads the workbench from the local web host and gives that origin commands to handle
// Shelf files or open a link. Unused native PTY commands have been removed (SYS-14).
// Host identity is checked before custom commands; the capability files also restrict which origins
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
  ["default", ["allow-capsule-window", "allow-shelf-desktop", "core:app:default", "core:event:default", "core:webview:default", "core:window:allow-start-dragging", "core:window:default", "core:default"].sort()],
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
  assert.ok(registered.has("capsule_hide") && registered.has("files_open"), "the command list was read");
  for (const [identifier, commands] of definitions) for (const command of commands) assert.ok(registered.has(command), `${identifier} allows ${command}, which the shell does not register`);
  for (const capability of capabilities) for (const permission of capability.permissions as string[]) {
    if (permission.startsWith("core:")) continue;
    assert.ok(definitions.has(permission), `${capability.identifier}: ${permission} is defined nowhere`);
  }
  // SYS-14: process spawning is only the authenticated WebSocket service, never a second native entry.
  const spawning = capabilities.filter(capability => (capability.permissions as string[]).some(permission => (definitions.get(permission) ?? []).includes("pty_spawn")));
  assert.deepEqual(spawning, []);
  for (const command of ["pty_spawn", "pty_write", "pty_resize", "pty_kill"]) assert.equal(registered.has(command), false);
});

// PG-113, RAC-738: a page's files reach the shell as relative paths plus the Host route and the page's id. The shell asks the Host
// which files those are and checks the answer before it opens, copies or drags anything (the Rust cases `rac_737_…` in
// page_files.rs), so nothing in the main window can name a path of its own. The old commands took absolute paths.
test("S-14 the shell's file commands take a page's relative paths and ask the Host for the files, and the old path-taking command names are gone", () => {
  const main = readFileSync(MAIN_RS, "utf8");
  const permission = readFileSync(join(SHELL, "permissions", "shelf.toml"), "utf8");
  const client = readFileSync(new URL("../apps/workbench/src/browser/plugin-frame/native-files.ts", import.meta.url), "utf8");
  for (const old of ["shelf_open_path", "shelf_copy_files", "shelf_drag_out"]) {
    for (const [where, text] of [["main.rs", main], ["permissions/shelf.toml", permission], ["native-files.ts", client]] as const) assert.equal(text.includes(old), false, `${where} still names ${old}`);
  }
  const allowed = [...(/commands\.allow\s*=\s*\[([^\]]*)\]/.exec(permission)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(match => match[1]!);
  const registered = /generate_handler!\[([\s\S]*?)\]/.exec(main)?.[1] ?? "";
  for (const command of ["files_open", "files_copy", "files_drag_out"]) {
    assert.ok(allowed.includes(command), `${command} has no permission`);
    assert.match(registered, new RegExp(`\\b${command}\\b`), `${command} is not registered`);
    const signature = new RegExp(`async fn ${command}\\(([^)]*)\\)`).exec(main)?.[1] ?? "";
    assert.match(signature, /endpoint: String,\s*page_id: String,\s*paths: Vec<String>/, `${command} must take the route, the page and relative paths`);
    assert.doesNotMatch(signature, /\bpath: |PathBuf/, `${command} takes a path of its own`);
    const blocking = new RegExp(`fn ${command}_blocking\\(([^)]*)\\)[^{]*\\{([\\s\\S]*?)\\n\\}\\n`).exec(main);
    assert.ok(blocking, `${command}_blocking was read`);
    assert.match(blocking[2]!, /page_files::plugin_page_files\(endpoint, page_id, paths\)\?/, `${command} must ask the Host before it acts`);
  }
  // The window sends the route and the page's id, and no longer asks the Host itself or passes the answer on.
  assert.match(client, /invoke\("files_open"/); assert.match(client, /"files_copy"/); assert.match(client, /"files_drag_out"/);
  assert.match(client, /endpoint: route\("\/api\/host\/plugin-page-files"\)/);
  assert.doesNotMatch(client, /molisWorkRequest|files\.paths|\.paths\[0\]/, "the window must not hold the absolute paths");
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

// W2-18-CAPSULE-01, W2-18-CAPSULE-02: configuration coverage; actual window geometry and remote IPC still need the native probe.
test("W2-18-CAPSULE: every command the capsule calls has its existing explicit permission", () => {
  const client = readFileSync(new URL("../apps/desktop/src/capsule-shell.ts", import.meta.url), "utf8");
  const invoked = [...new Set([...client.matchAll(/invoke\?\.\("(capsule_[a-z_]+)"/g)].map(match => match[1]!))].sort();
  const permission = readFileSync(join(SHELL, "permissions", "capsule.toml"), "utf8");
  const allowed = [...(/commands\.allow\s*=\s*\[([^\]]*)\]/.exec(permission)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(match => match[1]!).sort();
  assert.ok(invoked.includes("capsule_resize"), "the production resize call was read");
  assert.deepEqual(allowed, ["capsule_hide", "capsule_open_main", "capsule_resize", "capsule_set_locale", "capsule_update_menu_bar"]);
  for (const command of invoked) assert.ok(allowed.includes(command), `${command}: capsule invocation has no permission`);
});

// W2'-3 (specs/context-program §21.6): the page tells the shell where Shelf's side tab is, and the drop wheel treats that box
// as Shelf's drop place. The box comes from a page, so the shell keeps it only through `reported_panel` (finite, inside the
// content's top-left, with area) and hits it only through `over_reported_panel` (it must fit the content). Those two are
// exercised by the Rust tests named `s14_…` in drop_wheel.rs (`cargo test`); this pins that the command reaches the wheel only
// through them, so a page cannot hand the wheel an unchecked box.
test("S-14 the Shelf box a page reports reaches the drop wheel only through its check", () => {
  const SRC = new URL("../apps/desktop/adapters/tauri/src/", import.meta.url);
  const main = readFileSync(MAIN_RS, "utf8"), wheel = readFileSync(new URL("drop_wheel_macos.rs", SRC), "utf8"), pure = readFileSync(new URL("drop_wheel.rs", SRC), "utf8");
  const command = /fn shelf_surface_changed\(([^)]*)\)\s*\{([^}]*)\}/.exec(main);
  assert.ok(command, "the command is read");
  assert.match(command[1]!, /^\s*panel: Option<drop_wheel::PanelBox>,\s*language: Option<String>,\s*theme: Option<String>,?\s*$/, "the page sends a box, a language and a theme, nothing else");
  assert.match(command[2]!, /set_shelf_surface\(panel, /);
  const writes = [...wheel.matchAll(/SHELF_PANEL\.lock\(\)/g)].length;
  assert.equal(writes, 2, "the box is written in one place and read in one place");
  assert.match(wheel, /\*shown = drop_wheel::reported_panel\(panel\);/, "what is stored is what the check keeps");
  assert.match(wheel, /fn over_shelf_panel\([\s\S]*?drop_wheel::over_reported_panel\(/, "the hit test is the checked one");
  for (const name of ["s14_a_reported_shelf_box_that_is_not_a_box_is_refused", "s14_the_wheel_takes_the_shelf_tab_only_where_it_is_on_screen"]) assert.match(pure, new RegExp(`fn ${name}\\(`), `${name}: the refusal is tested`);
});
