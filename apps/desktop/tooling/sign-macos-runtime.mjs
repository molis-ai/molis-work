// Re-signs every piece of code in the embedded runtime (src-tauri/resources/molis-work-runtime) with one identity.
//
// Usage: node sign-macos-runtime.mjs <runtime-directory> <signing-identity>
//   "-" signs ad-hoc (a local build); anything else is a Developer ID identity and also gets a secure timestamp.
//
// Why: Tauri signs Molis Work.app and the code in its standard places, but not the code under Contents/Resources, which
// is where the runtime goes. As downloaded or built, that code is signed by someone else or ad-hoc: runtime/node carries
// the Node.js Foundation's signature with get-task-allow, the native addons and spawn-helper are ad-hoc, and the
// Computer Helper app is signed without hardened runtime or a timestamp. Notarization refuses all of them.
//
// Every Mach-O gets hardened runtime (`--options runtime`). macOS enforces it for ad-hoc signatures too, so local builds
// run the same way a release does; that is also why runtime/node gets its entitlements here even when ad-hoc (without
// allow-jit, V8 cannot start). Signing replaces any entitlements the file had, which is how get-task-allow goes away.
// Bundles are signed as bundles, innermost first, after the loose code inside them (macos-code.mjs says why).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainExecutable, scanCode } from "./macos-code.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Entitlements by what the code is. Only Node needs any; the helpers and addons are signed without. */
const NODE_ENTITLEMENTS = path.join(here, "entitlements", "node-runtime.entitlements");

const [runtimeDirectory, identity] = process.argv.slice(2);
if (!runtimeDirectory || !identity) {
  process.stderr.write("Usage: node sign-macos-runtime.mjs <runtime-directory> <signing-identity>\n");
  process.exit(2);
}
const root = path.resolve(runtimeDirectory);
if (!existsSync(root) || !statSync(root).isDirectory()) {
  process.stderr.write(`Runtime directory not found: ${root}\n`);
  process.exit(1);
}
if (!existsSync(NODE_ENTITLEMENTS)) {
  process.stderr.write(`Node entitlements not found: ${NODE_ENTITLEMENTS}\n`);
  process.exit(1);
}

const isNode = file => path.basename(file) === "node";

function sign(target, entitlements) {
  const args = ["--force", "--options", "runtime", "--sign", identity];
  // An ad-hoc signature has no certificate a timestamp server would vouch for; --timestamp would fail.
  if (identity !== "-") args.push("--timestamp");
  if (entitlements) args.push("--entitlements", entitlements);
  // codesign reports every --force as "replacing existing signature" on stderr; keep that quiet and let a failure throw
  // with codesign's own message.
  execFileSync("/usr/bin/codesign", [...args, target], { stdio: "pipe" });
  execFileSync("/usr/bin/codesign", ["--verify", "--strict", target], { stdio: "pipe" });
}

const { bundles, machos } = scanCode(root);
if (machos.length === 0) {
  // An empty runtime would ship an App whose core cannot start; never pass that silently.
  process.stderr.write(`No Mach-O found under ${root}; refusing to report success.\n`);
  process.exit(1);
}

let files = 0;
for (const { file, bundle } of machos) {
  if (bundle !== null) continue;
  sign(file, isNode(file) ? NODE_ENTITLEMENTS : undefined);
  files += 1;
}
for (const bundle of bundles) {
  const main = mainExecutable(bundle);
  for (const { file } of machos.filter(entry => entry.bundle === bundle && entry.file !== main)) {
    sign(file, undefined);
    files += 1;
  }
  sign(bundle, undefined);
}

process.stdout.write(`Signed ${files} Mach-O file(s) and ${bundles.length} bundle(s) under ${root} (identity: ${identity})\n`);
