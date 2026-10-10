#!/usr/bin/env node
// Static checks for the code that is not TypeScript (specs/repository-anti-corruption §4.16, slice W1-09): the Rust of the
// desktop shell, the Swift of the native material extractors, the shell scripts and the one Python worker. The TypeScript is checked by the health
// gates (scripts/gates/lint.mjs). These checks are not numbers: they pass or they fail, and every warning is an error, so
// there is no baseline. The tools are the ones the language ships with.
//
//   node scripts/gates/native-checks.mjs rust     rustfmt --check on every tracked .rs file; cargo clippy --all-targets
//                                                 -D warnings for apps/desktop/src-tauri (compiles the crate, so it needs the
//                                                 platform the crate is for: macOS)
//   node scripts/gates/native-checks.mjs swift    swiftc -typecheck of the standalone Swift file; with --package also
//                                                 `swift build` of the SwiftPM package (needs the network on the first run and a
//                                                 Swift that reads its swift-tools-version, 6.2; about 7 minutes cold)
//   node scripts/gates/native-checks.mjs shell    shellcheck --severity=warning on every tracked .sh file and every tracked file
//                                                 whose first line is a sh/bash shebang
//   node scripts/gates/native-checks.mjs python  every tracked .py file parses (python3 -I, nothing is written)
//   --root <dir>                                  check another repository root (tests/native-checks.test.mjs)
//
// Every file of these languages has to be one the checks know: a tracked .rs file outside apps/desktop, or a .swift file that is
// not in SWIFT_UNITS, fails the run, so adding a file cannot step around the checks. CI runs rust and swift on macOS and shell
// on Linux (.github/workflows/ci.yml); the Rust toolchain is pinned there (RUSTUP_TOOLCHAIN), because clippy gains lints
// with every release and `-D warnings` would turn each release into a red build. Locally, whatever toolchain is installed is
// used, and a newer one may report a lint the pinned one does not.
// Exit codes: 0 passed, 1 a check failed, 2 the command or the environment is unusable (a missing tool is exit 2, never a pass).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUST_ROOT = "apps/desktop";
export const RUST_MANIFEST = "apps/desktop/src-tauri/Cargo.toml";
/** The Swift files and what checks them: `typecheck` (a standalone file) or `package` (compiled by a SwiftPM package). */
export const SWIFT_UNITS = [
  { file: "apps/local-host/native/materials/JellyMaterial.swift", check: "typecheck", target: "macosx14.0" },
  { file: "apps/local-host/native/materials/whisper/Sources/JellyWhisper/JellyWhisper.swift", check: "package", package: "apps/local-host/native/materials/whisper" },
  { file: "apps/local-host/native/materials/whisper/Package.swift", check: "package", package: "apps/local-host/native/materials/whisper" },
];
const SHELL_SHEBANG = /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\/\S*\/)?(?:ba|da|k|z)?sh\b/;

const USAGE = "usage: native-checks.mjs rust|swift|shell|python [--package] [--root <dir>]";
export class Unusable extends Error {}
const unusable = (message) => { throw new Unusable(message); };

const run = (command, args, { cwd, input } = {}) => spawnSync(command, args, { cwd, input, encoding: "utf8", maxBuffer: 1 << 28 });
const tail = (text, lines = 60) => { const all = text.trim().split("\n"); return (all.length > lines ? [`… ${all.length - lines} earlier lines left out`, ...all.slice(-lines)] : all).join("\n"); };
const need = (command, args, hint) => {
  const probe = run(command, args);
  if (probe.error || probe.status !== 0) unusable(`${command} ${args.join(" ")} did not run${probe.error ? ` (${probe.error.code ?? probe.error.message})` : ""}; ${hint}`);
};

const trackedFiles = (root) => {
  const listed = run("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root });
  if (listed.status !== 0) unusable(`git ls-files failed in ${root}: ${(listed.error?.message ?? listed.stderr ?? "").trim()}`);
  return listed.stdout.split("\0").filter(Boolean);
};

/** Each check returns the problems it found (an empty list is a pass). */
export const checkRust = (root, files = trackedFiles(root)) => {
  const sources = files.filter((file) => file.endsWith(".rs"));
  if (!sources.length) return { problems: [], summary: "no Rust files" };
  const problems = sources.filter((file) => !file.startsWith(`${RUST_ROOT}/`)).map((file) => `${file} is Rust code outside ${RUST_ROOT}/, which these checks do not reach; put it in the crate or extend scripts/gates/native-checks.mjs`);
  if (problems.length) return { problems, summary: "" };
  need("cargo", ["--version"], "install the Rust toolchain (https://rustup.rs)");
  need("cargo", ["clippy", "--version"], "add the component: rustup component add clippy");
  need("rustfmt", ["--version"], "add the component: rustup component add rustfmt");
  let manifest;
  try { manifest = readFileSync(path.join(root, RUST_MANIFEST), "utf8"); } catch { unusable(`${RUST_MANIFEST} is missing: it is the crate the Rust files belong to`); }
  const edition = /^edition\s*=\s*"(\d+)"/m.exec(manifest)?.[1] ?? "2021";
  const format = run("rustfmt", ["--check", "--edition", edition, ...sources], { cwd: root });
  if (format.status !== 0) problems.push(`rustfmt --check found unformatted code; run \`cargo fmt --manifest-path ${RUST_MANIFEST}\`:\n${tail(format.stdout + format.stderr, 40)}`);
  const clippy = run("cargo", ["clippy", "--manifest-path", RUST_MANIFEST, "--all-targets", "--locked", "--", "-D", "warnings"], { cwd: root });
  if (clippy.status !== 0) problems.push(`cargo clippy -D warnings failed:\n${tail(clippy.stderr + clippy.stdout)}`);
  return { problems, summary: `${sources.length} Rust files formatted, clippy clean` };
};

export const checkSwift = (root, { withPackages = false } = {}, files = trackedFiles(root)) => {
  const sources = files.filter((file) => file.endsWith(".swift"));
  if (!sources.length) return { problems: [], summary: "no Swift files" };
  const known = new Set(SWIFT_UNITS.map((unit) => unit.file));
  const problems = sources.filter((file) => !known.has(file)).map((file) => `${file} is Swift code the checks do not know; add it to SWIFT_UNITS in scripts/gates/native-checks.mjs`);
  if (problems.length) return { problems, summary: "" };
  if (process.platform !== "darwin") unusable("the Swift checks need macOS (swiftc with the macOS SDK)");
  need("swiftc", ["--version"], "install Xcode or the Command Line Tools");
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  for (const unit of SWIFT_UNITS.filter((candidate) => candidate.check === "typecheck" && sources.includes(candidate.file))) {
    const result = run("swiftc", ["-typecheck", "-parse-as-library", "-target", `${arch}-apple-${unit.target}`, unit.file], { cwd: root });
    if (result.status !== 0) problems.push(`swiftc -typecheck ${unit.file} failed:\n${tail(result.stderr + result.stdout)}`);
  }
  const packages = [...new Set(SWIFT_UNITS.filter((unit) => unit.check === "package" && sources.includes(unit.file)).map((unit) => unit.package))];
  if (withPackages) {
    for (const directory of packages) {
      const scratch = mkdtempSync(path.join(os.tmpdir(), "molis-swift-build-"));
      try {
        const result = run("swift", ["build", "--package-path", directory, "--scratch-path", scratch], { cwd: root });
        if (result.status !== 0) problems.push(`swift build --package-path ${directory} failed:\n${tail(result.stderr + result.stdout)}`);
      } finally { rmSync(scratch, { recursive: true, force: true }); }
    }
  }
  const built = withPackages ? "; the SwiftPM package builds" : "; the SwiftPM package is built only with --package";
  return { problems, summary: `${sources.length} Swift files known, the standalone one typechecks${built}` };
};

export const checkShell = (root, files = trackedFiles(root)) => {
  const scripts = files.filter((file) => {
    if (file.endsWith(".sh")) return true;
    if (/\.[A-Za-z0-9]+$/.test(file) || /(^|\/)(node_modules|vendor)\//.test(file)) return false;
    try { return SHELL_SHEBANG.test(readFileSync(path.join(root, file), "utf8").split("\n", 1)[0]); } catch { return false; }
  });
  if (!scripts.length) return { problems: [], summary: "no shell scripts" };
  need("shellcheck", ["--version"], "install shellcheck (it ships on the GitHub ubuntu runners; macOS: brew install shellcheck)");
  const result = run("shellcheck", ["--severity=warning", ...scripts], { cwd: root });
  const problems = result.status === 0 ? [] : [`shellcheck found problems:\n${tail(result.stdout + result.stderr)}`];
  return { problems, summary: `${scripts.length} shell scripts` };
};

export const checkPython = (root, files = trackedFiles(root)) => {
  const scripts = files.filter((file) => file.endsWith(".py"));
  if (!scripts.length) return { problems: [], summary: "no Python files" };
  need("python3", ["-I", "--version"], "install Python 3");
  const problems = [];
  for (const file of scripts) {
    const result = run("python3", ["-I", "-c", "import ast, sys; ast.parse(open(sys.argv[1], 'rb').read(), sys.argv[1])", file], { cwd: root });
    if (result.status !== 0) problems.push(`${file} does not parse:\n${tail(result.stderr + result.stdout, 12)}`);
  }
  return { problems, summary: `${scripts.length} Python files parse` };
};

// ---- command line ---------------------------------------------------------------------------------------------------
const main = () => {
  const args = process.argv.slice(2);
  const languages = [];
  const options = { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), package: false };
  for (let index = 0; index < args.length; index++) {
    const [name, inline] = args[index].split(/=(.*)/s);
    if (["rust", "swift", "shell", "python"].includes(name)) languages.push(name);
    else if (name === "--package") options.package = true;
    else if (name === "--root") { options.root = path.resolve(inline ?? args[++index] ?? ""); }
    else { console.error(`unknown argument ${args[index]}\n${USAGE}`); process.exit(2); }
  }
  if (!languages.length) { console.error(USAGE); process.exit(2); }
  if (options.package && !languages.includes("swift")) { console.error(`--package goes with swift\n${USAGE}`); process.exit(2); }
  const files = trackedFiles(options.root);
  let failed = false;
  for (const language of languages) {
    let result;
    try {
      result = language === "rust" ? checkRust(options.root, files)
        : language === "swift" ? checkSwift(options.root, { withPackages: options.package }, files)
        : language === "python" ? checkPython(options.root, files) : checkShell(options.root, files);
    } catch (error) {
      if (error instanceof Unusable) { console.error(`${language}: ${error.message}`); process.exit(2); }
      throw error;
    }
    if (result.problems.length) { failed = true; console.error(`${language} checks failed:\n- ${result.problems.join("\n- ")}`); } else console.log(`${language} checks passed: ${result.summary}`);
  }
  process.exit(failed ? 1 : 0);
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
