import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, readSync, realpathSync, rmSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pluginWorkbenchClientAsset, pluginWorkbenchPacks } from "@molis-ai/molis-work-app-workbench";
import { resolveHomeSecurityDirectory, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// PG-097 (ac-artifacts A7, non-directory part): platform names carry no plugin names; the directory rename waits for the maintenance window.

const root = path.resolve(import.meta.dirname, "..");
// Deliberate counterexamples are assembled, so this test's own current code is scanned too.
const retiredHelperPrefix = ["MOLIS", "JELLY", ""].join("_");
const retiredStorageName = ["resolve", "Feed", "SecurityDirectory"].join("");
const slice = "specs/repository-anti-corruption/slices/ac-artifacts.md";

function textEncoding(prefix: Buffer): string | undefined {
  const bom = prefix.subarray(0, 2).toString("hex");
  const encoding = bom === "fffe" ? "utf-16le" : bom === "feff" ? "utf-16be" : "utf-8";
  // PDF and GIF may start with entirely ASCII bytes; the other media/font/archive formats have NULs or invalid UTF-8.
  if (/^(?:%PDF-|GIF8[79]a)/.test(prefix.toString("ascii", 0, 6)) || (encoding === "utf-8" && prefix.includes(0))) return;
  try {
    // stream keeps a multibyte character split at the end of the bounded prefix from being mistaken for binary data.
    const sample = new TextDecoder(encoding, { fatal: true }).decode(prefix, { stream: true });
    return /[\u0000-\u0008\u000b\u000e-\u001f]/u.test(sample) ? undefined : encoding;
  } catch { return undefined; /* A non-text byte sequence, not a file-read failure. */ }
}

function trackedTextSnapshot(directory: string): ReadonlyMap<string, string> {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: directory, encoding: "utf8" }).split("\0").filter(Boolean);
  const snapshot = new Map<string, string>();
  for (const file of files) {
    const absolute = path.join(directory, file);
    if (lstatSync(absolute).isSymbolicLink()) { snapshot.set(file, readlinkSync(absolute)); continue; }
    const descriptor = openSync(absolute, "r");
    try {
      const buffer = Buffer.alloc(8192), length = readSync(descriptor, buffer, 0, buffer.length, null);
      const prefix = buffer.subarray(0, length), encoding = textEncoding(prefix);
      if (encoding) snapshot.set(file, new TextDecoder(encoding, { fatal: true }).decode(Buffer.concat([prefix, readFileSync(descriptor)])));
    } finally { closeSync(descriptor); }
  }
  return snapshot;
}

function assertRetiredNameAbsent(snapshot: ReadonlyMap<string, string>, name: string): void {
  const offenders = [...snapshot].filter(([file, contents]) => {
    if (file.startsWith("specs/archive/") && file.endsWith(".md")) return false;
    // Only the existing narrative rows describing the rename are exempt; code and new prose in this spec still count.
    const text = file === slice ? contents.split("\n").filter(line => !/^(?:\| 平台存储与资源用插件命名：|\| 环境变量 |\| 符号与函数名：|\*\*A7 非目录部分已做|\| RAC-427 \|)/.test(line)).join("\n") : contents;
    return text.includes(name);
  }).map(([file]) => file);
  assert.deepEqual(offenders, [], `retired name ${name} must not appear in current tracked text`);
}

// Both name checks and the route assertions use this one read of the tracked working tree.
const tracked = trackedTextSnapshot(root);
function read(file: string): string { const text = tracked.get(file); assert.notEqual(text, undefined, `${file} must be tracked text`); return text!; }

test("RAC-427: no current tracked text reads the retired helper variables; the material helpers take the platform names", () => {
  assertRetiredNameAbsent(tracked, retiredHelperPrefix);
  const home = read("apps/local-host/src/material-home.ts");
  assert.match(home, /process\.env\.MOLIS_MATERIAL_NATIVE_HELPER/);
  assert.match(home, /process\.env\.MOLIS_MATERIAL_WHISPER_HELPER/);
});

test("RAC-427: the platform storage function carries no Feed name, and the path it returns is unchanged", () => {
  assertRetiredNameAbsent(tracked, retiredStorageName);
  runWithMolisWorkHome("/tmp/pg097-home", () => assert.equal(resolveHomeSecurityDirectory(), path.join(realpathSync("/tmp"), "pg097-home", "feed"), "S-11 resolves the Home to its real path at entry: on macOS /tmp is a link to /private/tmp, so the storage path is the real one"));
});

test("RAC-427: writing either retired name in previously omitted tracked text makes the real check fail", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pg097-tracked-"));
  const files = ["apps/desktop/native/Probe.swift", "apps/desktop/src-tauri/src/probe.rs", ".github/workflows/check.yml",
    "tooling/check.py", "tooling/check.yaml", "examples/probe.mts", ".env.example", "Makefile", "specs/archive/current.py", "examples/有 空格.custom"];
  try {
    execFileSync("git", ["init", "-q", directory]);
    for (const file of files) { mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); writeFileSync(path.join(directory, file), "current platform name\n"); }
    execFileSync("git", ["add", "."], { cwd: directory });
    assertRetiredNameAbsent(trackedTextSnapshot(directory), retiredHelperPrefix);
    for (const file of files) {
      writeFileSync(path.join(directory, file), `${retiredHelperPrefix}WHISPER_HELPER\n${retiredStorageName}\n`);
      const snapshot = trackedTextSnapshot(directory);
      for (const name of [retiredHelperPrefix, retiredStorageName]) assert.throws(() => assertRetiredNameAbsent(snapshot, name),
        (error: unknown) => error instanceof assert.AssertionError && error.message.includes(file), `${file} must be rejected`);
      writeFileSync(path.join(directory, file), "current platform name\n");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-427: tracked text detection preserves Unicode, excludes only recorded history, skips large binary media and reports missing files", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pg097-text-"));
  try {
    execFileSync("git", ["init", "-q", directory]);
    const history = "specs/archive/history/spec.md", media = path.join(directory, "media.dat");
    mkdirSync(path.join(directory, path.dirname(history)), { recursive: true });
    writeFileSync(path.join(directory, history), retiredHelperPrefix);
    writeFileSync(path.join(directory, "unicode"), "中".repeat(2731) + retiredStorageName); // UTF-8 crosses the 8192-byte sniff boundary.
    writeFileSync(path.join(directory, "utf16"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(retiredHelperPrefix, "utf16le")]));
    writeFileSync(media, `%PDF-1.7\n${retiredHelperPrefix}`);
    mkdirSync(path.dirname(path.join(directory, slice)), { recursive: true });
    writeFileSync(path.join(directory, slice), `| 环境变量 \`${retiredHelperPrefix}\` | old name |\n`);
    execFileSync("git", ["add", "."], { cwd: directory });
    // Sparse and larger than readFileSync's buffer limit: reading the whole media file would fail, without writing gigabytes.
    truncateSync(media, 3 * 1024 ** 3);
    const snapshot = trackedTextSnapshot(directory);
    assert.equal(snapshot.has("media.dat"), false);
    assert.equal(snapshot.get("unicode"), "中".repeat(2731) + retiredStorageName);
    assert.throws(() => assertRetiredNameAbsent(snapshot, retiredHelperPrefix), /utf16/);
    assertRetiredNameAbsent(new Map([...snapshot].filter(([file]) => file !== "utf16")), retiredHelperPrefix);
    writeFileSync(path.join(directory, slice), `current code: ${retiredHelperPrefix}\n`);
    assert.throws(() => assertRetiredNameAbsent(trackedTextSnapshot(directory), retiredHelperPrefix), /ac-artifacts\.md/);
    unlinkSync(path.join(directory, "unicode"));
    assert.throws(() => trackedTextSnapshot(directory), { code: "ENOENT" });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-412: the same-origin plugin client route sends only bundles in the host build, never a directory entry", () => {
  const built = new Set(pluginWorkbenchPacks().map(pack => pack.project_plugin_id));
  for (const id of ["not-built-in", "installed-elsewhere", "..", "__proto__", "constructor", "toString"]) {
    assert.ok(!built.has(id));
    assert.equal(pluginWorkbenchClientAsset(id), null, `${id} is not served`);
  }
  const served = pluginWorkbenchPacks().filter(pack => pack.clientFactory).map(pack => pack.project_plugin_id);
  assert.ok(served.length > 0 && served.every(id => pluginWorkbenchClientAsset(id) !== null));
  const route = read("apps/local-host/src/web-assets.ts");
  assert.doesNotMatch(route, /readdir|plugins\/native|install(ed)?Dir|pluginDirectory/, "the route does not look the bundle up in a directory");
  assert.match(route, /pluginWorkbenchClientAsset\(plugin\[1\]!\)/, "it asks the host build, once, for the id in the address");
});
