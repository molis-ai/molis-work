// Re-signs every piece of code in the embedded runtime (src-tauri/resources/molis-work-runtime) with one identity.
//
// Usage: node sign-macos-runtime.mjs <runtime-directory> <signing-identity>
//   "-" signs ad-hoc (a local build); a "Developer ID Application: …" identity is a release and also gets a secure
//   timestamp; any other identity (a local stable certificate such as "Tauri Local Development") signs without one.
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
//
// An ad-hoc build keeps a bundle that already carries a certificate signature with hardened runtime and no
// get-task-allow, as the computer helper does when this Mac has the "Tauri Local Development" certificate: macOS keeps
// Screen Recording, Accessibility and Input Monitoring grants against that signature, and an ad-hoc re-sign would make
// them ask again after every build (specs/computer-use D08).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainExecutable, scanCode, signatureOf } from "./macos-code.mjs";

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
  // Only Apple's timestamp server vouches for a Developer ID signature; for ad-hoc or a local certificate it would fail.
  if (identity.startsWith("Developer ID Application:")) args.push("--timestamp");
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

/** An ad-hoc build leaves a certificate-signed, hardened, valid bundle as it is (see the header). */
function keepAsSigned(bundle) {
  if (identity !== "-") return false;
  const signature = signatureOf(bundle);
  return signature.valid && signature.certificate && signature.runtime && !signature.getTaskAllow;
}

let files = 0;
let kept = 0;
const keptBundles = bundles.filter(keepAsSigned);
const insideKept = file => keptBundles.some(bundle => file.startsWith(`${bundle}${path.sep}`));
for (const { file, bundle } of machos) {
  if (bundle !== null) continue;
  sign(file, isNode(file) ? NODE_ENTITLEMENTS : undefined);
  files += 1;
}
for (const bundle of bundles) {
  if (keptBundles.includes(bundle) || insideKept(bundle)) { kept += 1; continue; }
  const main = mainExecutable(bundle);
  for (const { file } of machos.filter(entry => entry.bundle === bundle && entry.file !== main)) {
    sign(file, undefined);
    files += 1;
  }
  sign(bundle, undefined);
}

process.stdout.write(`Signed ${files} Mach-O file(s) and ${bundles.length - kept} bundle(s) under ${root} (identity: ${identity})` +
  `${kept ? `; kept ${kept} certificate-signed bundle(s) as they were` : ""}\n`);
