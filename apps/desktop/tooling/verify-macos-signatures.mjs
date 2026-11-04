// Checks, without any credential, that every piece of code in a macOS app (or runtime directory) is signed the way
// notarization requires. It is the local half of the release check; Apple's notarization and Gatekeeper are the other.
//
// Usage: node verify-macos-signatures.mjs <app-or-directory> [--release]
//
// Always, for every bundle and every Mach-O that is not a bundle's main executable:
//   - the signature verifies (`codesign --verify --strict`; the top bundle also with --deep);
//   - hardened runtime is on;
//   - it does not carry com.apple.security.get-task-allow (notarization refuses it);
//   - a file named `node` has com.apple.security.cs.allow-jit (V8 does not start under hardened runtime without it).
// With --release, also: signed by a "Developer ID Application" certificate, with a secure timestamp, and every piece by
// the same Team ID. A local ad-hoc build passes without --release; it is still not a release (docs/releases/POLICY.md).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { isCodeBundle, mainExecutable, scanCode } from "./macos-code.mjs";

const args = process.argv.slice(2);
const release = args.includes("--release");
const target = args.find(arg => !arg.startsWith("--"));
if (!target || !existsSync(target)) {
  process.stderr.write("Usage: node verify-macos-signatures.mjs <app-or-directory> [--release]\n");
  process.exit(2);
}
const root = path.resolve(target);

function describe(code) {
  const result = spawnSync("/usr/bin/codesign", ["-d", "--verbose=4", code], { encoding: "utf8" });
  const text = `${result.stdout}${result.stderr}`;
  const field = name => text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? null;
  return {
    signed: result.status === 0,
    flags: text.match(/^CodeDirectory .*flags=0x[0-9a-f]+\(([^)]*)\)/m)?.[1] ?? "",
    authorities: [...text.matchAll(/^Authority=(.*)$/gm)].map(match => match[1].trim()),
    timestamp: field("Timestamp"),
    team: field("TeamIdentifier"),
  };
}

function entitlements(code) {
  const result = spawnSync("/usr/bin/codesign", ["-d", "--entitlements", "-", "--xml", code], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : "";
}

function hasTrueKey(plistXml, key) {
  return new RegExp(`<key>${key.replaceAll(".", "\\.")}</key>\\s*<true\\s*/>`).test(plistXml);
}

const problems = [];
const teams = new Map();
const relative = code => path.relative(path.dirname(root), code) || code;

function check(code, { deep = false } = {}) {
  const name = relative(code);
  const verify = spawnSync("/usr/bin/codesign", ["--verify", "--strict", ...(deep ? ["--deep"] : []), code], { encoding: "utf8" });
  if (verify.status !== 0) {
    problems.push(`${name}: signature does not verify: ${verify.stderr.trim()}`);
    return;
  }
  const info = describe(code);
  if (!/\bruntime\b/.test(info.flags)) problems.push(`${name}: hardened runtime is off (flags: ${info.flags || "none"})`);
  const granted = entitlements(code);
  if (hasTrueKey(granted, "com.apple.security.get-task-allow")) problems.push(`${name}: carries get-task-allow`);
  const executable = isCodeBundle(code) ? mainExecutable(code) : code;
  if (executable && path.basename(executable) === "node" && !hasTrueKey(granted, "com.apple.security.cs.allow-jit")) {
    problems.push(`${name}: Node without com.apple.security.cs.allow-jit cannot start under hardened runtime`);
  }
  if (!release) return;
  if (!info.authorities[0]?.startsWith("Developer ID Application:")) {
    problems.push(`${name}: not signed by a Developer ID Application certificate (${info.authorities[0] ?? "ad-hoc"})`);
  }
  if (!info.timestamp) problems.push(`${name}: no secure timestamp`);
  if (info.team && info.team !== "not set") teams.set(info.team, [...(teams.get(info.team) ?? []), name]);
  else problems.push(`${name}: no Team ID`);
}

const { bundles, machos } = scanCode(root);
if (bundles.length === 0 && machos.length === 0) {
  process.stderr.write(`No code found under ${root}.\n`);
  process.exit(1);
}
for (const bundle of bundles) check(bundle, { deep: bundle === root });
for (const { file, bundle } of machos) {
  if (bundle !== null && file === mainExecutable(bundle)) continue;
  check(file);
}
if (teams.size > 1) {
  problems.push(`signed by more than one Team ID: ${[...teams].map(([team, names]) => `${team} (${names.length})`).join(", ")}`);
}

const checked = bundles.length + machos.filter(({ file, bundle }) => bundle === null || file !== mainExecutable(bundle)).length;
if (problems.length > 0) {
  process.stderr.write(`${problems.length} signing problem(s) in ${root}:\n${problems.map(problem => `  - ${problem}`).join("\n")}\n`);
  process.exit(1);
}
const mode = release ? `release (Developer ID, timestamped, Team ${[...teams.keys()][0]})` : "local (signature, hardened runtime, entitlements)";
process.stdout.write(`Checked ${checked} signed item(s) under ${root}: ${mode}\n`);
