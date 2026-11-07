// What counts as code in a macOS release tree, shared by sign-macos-runtime.mjs and verify-macos-signatures.mjs.
//
// macOS signs two kinds of things: a single Mach-O file, and a bundle (.app, .framework, .bundle, .xpc, .appex) that is
// sealed as one unit — its main executable, Info.plist and every other file are hashed together. Any other Mach-O inside a
// bundle is one of those sealed files: it has to be signed before the bundle, and never again afterwards, or the bundle
// no longer verifies. So the tree is split into bundles and loose files, every Mach-O is assigned to the innermost bundle
// that holds it, and bundles are signed innermost first.
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, lstatSync, openSync, readSync, readdirSync, realpathSync, existsSync } from "node:fs";
import path from "node:path";

const BUNDLE_SUFFIXES = [".app", ".framework", ".bundle", ".xpc", ".appex"];

/** True when the file starts with a Mach-O magic number (thin, either byte order, or universal). */
export function isMachO(file) {
  const header = Buffer.alloc(8);
  const fd = openSync(file, "r");
  let read = 0;
  try { read = readSync(fd, header, 0, 8, 0); } finally { closeSync(fd); }
  if (read < 8) return false;
  const magic = header.readUInt32BE(0);
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) return true;
  // 0xcafebabe is both a universal binary and a Java class file. A universal header is followed by a small
  // architecture count; a class file by its version, whose major number is at least 45.
  if (magic === 0xcafebabe || magic === 0xcafebabf) return header.readUInt32BE(4) > 0 && header.readUInt32BE(4) < 45;
  return false;
}

/** A directory is a code bundle only if it has a bundle's Info.plist; a folder that merely ends in ".bundle" is not one. */
export function isCodeBundle(directory) {
  if (!BUNDLE_SUFFIXES.some(suffix => directory.endsWith(suffix))) return false;
  return ["Contents/Info.plist", "Resources/Info.plist", "Versions/Current/Resources/Info.plist"]
    .some(relative => existsSync(path.join(directory, relative)));
}

const mainExecutables = new Map();
/** The bundle's main executable as a real path (matching the walk), or null (a resource-only bundle has none). */
export function mainExecutable(bundle) {
  if (!mainExecutables.has(bundle)) mainExecutables.set(bundle, readMainExecutable(bundle));
  return mainExecutables.get(bundle);
}

function readMainExecutable(bundle) {
  for (const [plist, executableDir] of [["Contents/Info.plist", "Contents/MacOS"], ["Resources/Info.plist", "."],
    ["Versions/Current/Resources/Info.plist", "Versions/Current"]]) {
    const info = path.join(bundle, plist);
    if (!existsSync(info)) continue;
    let name = "";
    try { name = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", info], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { name = ""; /* no CFBundleExecutable: a resource-only bundle */ }
    if (!name) return null;
    const executable = path.join(bundle, executableDir, name);
    // A versioned framework names it through Versions/Current, a link; the walk records the real Versions/A path.
    if (!existsSync(executable)) return null;
    return path.join(realpathSync(path.dirname(executable)), path.basename(executable));
  }
  return null;
}

/**
 * Walks the tree once. Returns the code bundles (deepest first, the order they must be signed in) and every Mach-O with
 * the innermost bundle that holds it (null for a loose file). Symbolic links are not followed: codesign signs the target.
 */
export function scanCode(root) {
  const bundles = [];
  const machos = [];
  const walk = (directory, owner) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const bundle = isCodeBundle(full);
        if (bundle) bundles.push(full);
        walk(full, bundle ? full : owner);
      } else if (entry.isFile() && lstatSync(full).size >= 8 && isMachO(full)) {
        machos.push({ file: full, bundle: owner });
      }
    }
  };
  if (isCodeBundle(root)) bundles.push(root);
  walk(root, isCodeBundle(root) ? root : null);
  bundles.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  return { bundles, machos };
}

/** What `codesign` says about one signed item: valid, signed with a certificate (not ad-hoc), hardened, get-task-allow. */
export function signatureOf(code) {
  const valid = spawnSync("/usr/bin/codesign", ["--verify", "--strict", code], { stdio: "ignore" }).status === 0;
  const details = spawnSync("/usr/bin/codesign", ["-d", "--verbose=4", code], { encoding: "utf8" });
  const text = `${details.stdout}${details.stderr}`;
  const flags = text.match(/^CodeDirectory .*flags=0x[0-9a-f]+\(([^)]*)\)/m)?.[1] ?? "";
  const entitlements = spawnSync("/usr/bin/codesign", ["-d", "--entitlements", "-", "--xml", code], { encoding: "utf8" }).stdout ?? "";
  return {
    valid,
    certificate: /^Authority=/m.test(text),
    runtime: /\bruntime\b/.test(flags),
    getTaskAllow: /<key>com\.apple\.security\.get-task-allow<\/key>\s*<true\s*\/>/.test(entitlements),
  };
}
