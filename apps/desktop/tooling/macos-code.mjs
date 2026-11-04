// What counts as code in a macOS release tree, shared by sign-macos-runtime.mjs and verify-macos-signatures.mjs.
//
// macOS signs two kinds of things: a single Mach-O file, and a bundle (.app, .framework, .bundle, .xpc, .appex) that is
// sealed as one unit — its main executable, Info.plist and resources are hashed together. A Mach-O inside a bundle must
// never be signed on its own after the bundle is sealed: that rewrites the executable and breaks the bundle's seal
// (the mistake in the unreviewed snapshot d6fa42998, batches/26.md). So the tree is split into bundles and loose files,
// and every Mach-O is assigned to the innermost bundle that holds it.
import { execFileSync } from "node:child_process";
import { closeSync, lstatSync, openSync, readSync, readdirSync, existsSync } from "node:fs";
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

/** The bundle's main executable, or null (a resource-only bundle has none). */
export function mainExecutable(bundle) {
  for (const [plist, executableDir] of [["Contents/Info.plist", "Contents/MacOS"], ["Resources/Info.plist", "."],
    ["Versions/Current/Resources/Info.plist", "Versions/Current"]]) {
    const info = path.join(bundle, plist);
    if (!existsSync(info)) continue;
    let name = "";
    try { name = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", info], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { name = ""; /* no CFBundleExecutable: a resource-only bundle */ }
    return name ? path.join(bundle, executableDir, name) : null;
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
