// Batch 26 item 1 (signing, notarization and install preparation), c-end-readiness.md §3.1 C-1 and probe S2: the
// repository side that needs no Apple credential. What it covers: the declared entitlements and Info.plist, the order of
// steps in build-macos-release.sh (as text), and the two scripts — re-signing (sign-macos-runtime.mjs) and the local
// signature check (verify-macos-signatures.mjs) — on a small runtime built from the Node running the tests, a real
// native addon and a helper app, signed ad-hoc (macOS enforces hardened runtime for ad-hoc signatures too) and run.
// It does not cover notarization, stapling or Gatekeeper, the downloaded Node 24 build, or a full App build.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const desktop = path.join(root, "apps/desktop");
const signScript = path.join(desktop, "tooling/sign-macos-runtime.mjs");
const verifyScript = path.join(desktop, "tooling/verify-macos-signatures.mjs");
/** The fixture copies the running Node; a Node that loads a separate libnode (Homebrew's) does not start from a copy. */
function darwinSkip(): string | false {
  if (process.platform !== "darwin") return "macOS only";
  const libraries = spawnSync("/usr/bin/otool", ["-L", process.execPath], { encoding: "utf8" }).stdout ?? "";
  return /libnode/.test(libraries) ? "this Node links a separate libnode, so a copy of it cannot start" : false;
}
const darwin = { skip: darwinSkip() };

const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const grants = (plist: string, key: string) => new RegExp(`<key>${key.replaceAll(".", "\\.")}</key>\\s*<true\\s*/>`).test(plist);

test("C-1 the App and Node declare exactly the entitlements hardened runtime needs, and the App explains its Apple Events", () => {
  const config = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
  assert.equal(config.bundle.macOS.hardenedRuntime, true);
  assert.equal(config.bundle.macOS.entitlements, "./Entitlements.plist");

  const app = read("apps/desktop/src-tauri/Entitlements.plist");
  assert.ok(grants(app, "com.apple.security.automation.apple-events"), "the App drives Safari, Chrome and Finder through osascript");
  assert.ok(!grants(app, "com.apple.security.get-task-allow"), "notarization refuses get-task-allow");
  const info = read("apps/desktop/src-tauri/Info.plist");
  assert.match(info, /<key>NSAppleEventsUsageDescription<\/key>\s*<string>[^<]{10,}<\/string>/);

  const node = read("apps/desktop/tooling/entitlements/node-runtime.entitlements");
  for (const key of ["com.apple.security.cs.allow-jit", "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.disable-library-validation"]) assert.ok(grants(node, key), key);
  assert.ok(!grants(node, "com.apple.security.get-task-allow"), "Node's official list grants get-task-allow; ours must not");
});

test("C-1 the release build signs the runtime before Tauri packs it, checks every signature, and notarizes the DMG", () => {
  const script = read("apps/desktop/tooling/build-macos-release.sh");
  const order = ["prepare-macos-runtime.sh", "sign-macos-runtime.mjs", "tauri\" build", "verify-macos-signatures.mjs",
    "notarytool submit \"$DMG_PATH\"", "stapler staple \"$DMG_PATH\"", "spctl --assess --type execute"];
  const positions = order.map(step => script.indexOf(step));
  assert.ok(positions.every(position => position >= 0), `missing step: ${order[positions.indexOf(-1)]}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "steps run in this order");
  assert.match(script, /verify-macos-signatures\.mjs" "\$APP_PATH" --release/);
  // A Developer ID build without notarization credentials stops before building anything.
  assert.ok(script.indexOf("notarization credentials are missing") < script.indexOf("pnpm --dir \"$REPO_ROOT\" build"));
});

/** A runtime laid out like src-tauri/resources/molis-work-runtime, with the real Node, real addons and a helper app. */
function fixtureRuntime(): { dir: string; node: string; addon: string; spawnHelper: string; helper: string; helperTool: string; cleanup: () => void } {
  const base = mkdtempSync(path.join(tmpdir(), "molis-signing-"));
  const dir = path.join(base, "molis-work-runtime");
  const node = path.join(dir, "runtime/node");
  mkdirSync(path.dirname(node), { recursive: true });
  copyFileSync(process.execPath, node);

  const storage = createRequire(path.join(root, "packages/storage/package.json"));
  const sqliteRoot = path.dirname(storage.resolve("better-sqlite3/package.json"));
  const addon = path.join(dir, "node_modules/better-sqlite3/build/Release/better_sqlite3.node");
  mkdirSync(path.dirname(addon), { recursive: true });
  copyFileSync(path.join(sqliteRoot, "build/Release/better_sqlite3.node"), addon);

  writeFileSync(path.join(base, "main.c"), "int main(void) { return 0; }\n");
  const compile = (output: string) => execFileSync("/usr/bin/clang", ["-o", output, path.join(base, "main.c")]);
  // A loose executable, like node-pty's spawn-helper.
  const spawnHelper = path.join(dir, "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper");
  mkdirSync(path.dirname(spawnHelper), { recursive: true });
  compile(spawnHelper);

  // A helper app with a second Mach-O inside it besides its main executable.
  const helper = path.join(dir, "native/computer/bin/Molis Work Computer Helper.app");
  const helperTool = path.join(helper, "Contents/Resources/tool");
  mkdirSync(path.join(helper, "Contents/MacOS"), { recursive: true });
  mkdirSync(path.dirname(helperTool), { recursive: true });
  compile(path.join(helper, "Contents/MacOS/computer-helper"));
  compile(helperTool);
  writeFileSync(path.join(helper, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.molis.work.computer-helper</string>
<key>CFBundleExecutable</key><string>computer-helper</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`);
  // As the helper's own build signs it today without a Developer ID: no hardened runtime, no timestamp.
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", helper], { stdio: "pipe" });
  // A folder that only looks like a bundle (no Info.plist) is plain content, not code to seal.
  mkdirSync(path.join(dir, "node_modules/look-alike.bundle"), { recursive: true });
  writeFileSync(path.join(dir, "node_modules/look-alike.bundle/README"), "not code\n");
  return { dir, node, addon, spawnHelper, helper, helperTool, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const run = (script: string, ...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("C-1 S2 an ad-hoc signed runtime passes the local check, its Node starts under hardened runtime and loads a native addon", darwin, t => {
  const fixture = fixtureRuntime();
  t.after(fixture.cleanup);

  const before = run(verifyScript, fixture.dir);
  assert.equal(before.status, 1, "the unsigned-for-release runtime must not pass");
  assert.match(before.stderr, /Computer Helper\.app: hardened runtime is off/);

  const signed = run(signScript, fixture.dir, "-");
  assert.equal(signed.status, 0, signed.stderr);
  assert.match(signed.stdout, /Signed 4 Mach-O file\(s\) and 1 bundle\(s\)/);

  const after = run(verifyScript, fixture.dir);
  assert.equal(after.status, 0, after.stderr);
  // The helper is sealed as a bundle, with its identifier, not as a lone executable.
  const helper = spawnSync("/usr/bin/codesign", ["-dv", fixture.helper], { encoding: "utf8" }).stderr;
  assert.match(helper, /Identifier=com\.molis\.work\.computer-helper/);
  assert.match(helper, /flags=0x[0-9a-f]+\([^)]*runtime[^)]*\)/);

  const started = spawnSync(fixture.node, ["-e", "process.dlopen({ exports: {} }, process.argv[1]); console.log('ok')", fixture.addon], { encoding: "utf8" });
  assert.equal(started.status, 0, started.stderr);
  assert.equal(started.stdout.trim(), "ok");

  // --release asks for Developer ID, a timestamp and one Team ID; ad-hoc has none of them.
  const release = run(verifyScript, fixture.dir, "--release");
  assert.equal(release.status, 1);
  assert.match(release.stderr, /not signed by a Developer ID Application certificate/);
  assert.match(release.stderr, /no secure timestamp/);
});

test("C-1 the local check rejects get-task-allow, a Node without JIT, and a bundle whose inner code was re-signed after sealing", darwin, t => {
  const fixture = fixtureRuntime();
  t.after(fixture.cleanup);
  assert.equal(run(signScript, fixture.dir, "-").status, 0);

  const debuggable = path.join(path.dirname(fixture.dir), "debuggable.entitlements");
  writeFileSync(debuggable, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>
`);
  // Entitlements only exist on executables (codesign ignores them on a library such as a .node addon).
  execFileSync("/usr/bin/codesign", ["--force", "--options", "runtime", "--sign", "-", "--entitlements", debuggable, fixture.spawnHelper], { stdio: "pipe" });
  // Node re-signed without its entitlements: hardened runtime on, JIT not allowed.
  execFileSync("/usr/bin/codesign", ["--force", "--options", "runtime", "--sign", "-", fixture.node], { stdio: "pipe" });
  // Signing code inside a bundle after the bundle was sealed changes a sealed file: the bundle no longer verifies. (An
  // ad-hoc re-sign with the very same options is byte-identical, so this one differs, as any other signer's would.)
  execFileSync("/usr/bin/codesign", ["--force", "--options", "runtime", "--sign", "-", "--identifier", "re-signed", fixture.helperTool], { stdio: "pipe" });

  const result = run(verifyScript, fixture.dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spawn-helper: carries get-task-allow/);
  assert.match(result.stderr, /runtime\/node: Node without com\.apple\.security\.cs\.allow-jit/);
  assert.match(result.stderr, /Computer Helper\.app: signature does not verify/);
});

test("C-1 signing refuses a runtime with no code in it rather than reporting success", darwin, t => {
  const empty = mkdtempSync(path.join(tmpdir(), "molis-signing-empty-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const result = run(signScript, empty, "-");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No Mach-O found/);
});
