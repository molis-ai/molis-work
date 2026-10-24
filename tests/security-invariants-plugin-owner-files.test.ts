import assert from "node:assert/strict";
import fs, { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantOwnerFiles, ownerFileActions, ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

test("RAC-306 V-30 owner files are readable and writable by the Host's user only: created, read-only and read-write nodes carry no group or other bits, whatever the umask", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name), mode = (path: string) => statSync(join(root, path)).mode & 0o777;
  const umask = process.umask(0);
  try {
    await run.write(writer => {
      writer.mkdir("documents/folder"); writer.writeFile("documents/folder/a.txt", Buffer.from("a"), "create");
      writer.copyFile("documents/folder/a.txt", "documents/b.txt"); writer.replaceFileAtomic("catalog.json", Buffer.from("{}"));
    });
    assert.deepEqual(["catalog.json", "documents/b.txt", "documents/folder/a.txt"].map(mode), [0o600, 0o600, 0o600]);
    assert.deepEqual(["documents", "documents/folder"].map(mode), [0o700, 0o700]);
    await run.write(writer => { writer.setAccess("documents/b.txt", "readonly"); writer.setAccess("documents/folder", "readonly"); });
    assert.deepEqual([mode("documents/b.txt"), mode("documents/folder")], [0o400, 0o500]);
    await run.write(writer => { writer.setAccess("documents/b.txt", "readwrite"); writer.setAccess("documents/folder", "readwrite"); });
    assert.deepEqual([mode("documents/b.txt"), mode("documents/folder")], [0o600, 0o700]);
  } finally { process.umask(umask); }
});

test("SHF-IO-S03 SHF-IO-S06 Home owner files keep Unicode bytes, exclusive creates and copies, replacement and read-only queries", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name);
  assert.deepEqual(await run.read(client => [client.stat("documents"), client.list("documents"), client.read("catalog.json")]), [null, [], null]);
  assert.equal(existsSync(root), false);
  const bytes = Buffer.from("中文\u0000original");
  await run.write(writer => {
    writer.mkdir("documents/保留 空格"); writer.writeFile("documents/保留 空格/原件.txt", bytes, "create"); bytes.fill(0);
    assert.equal(Buffer.from(writer.read("documents/保留 空格/原件.txt")!).toString(), "中文\u0000original", "synchronous writes consume bytes before returning");
    writer.copyFile("documents/保留 空格/原件.txt", "documents/copy.txt");
    assert.throws(() => writer.copyFile("documents/copy.txt", "documents/copy.txt"));
    assert.throws(() => writer.writeFile("documents/copy.txt", Buffer.from("overwrite"), "create"));
    assert.throws(() => writer.writeFile("documents/missing.txt", Buffer.from("missing"), "replace"), { code: "ENOENT" });
    writer.writeFile("documents/copy.txt", Buffer.from("short"), "replace");
    writer.replaceFileAtomic("catalog.json", Buffer.from("complete catalog"));
    writer.setAccess("documents/copy.txt", "readonly"); writer.setAccess("documents/保留 空格", "readonly");
  });
  assert.equal(readFileSync(join(root, "documents/copy.txt"), "utf8"), "short");
  assert.equal(statSync(join(root, "documents/copy.txt")).mode & 0o777, 0o400);
  assert.equal(statSync(join(root, "documents/保留 空格")).mode & 0o777, 0o500);
  const before = [statSync(root), statSync(join(root, "catalog.json")), statSync(join(root, "documents"))].map(s => [s.mtimeMs, s.ctimeMs, s.mode]);
  for (let i = 0; i < 2; i++) await run.read(client => [client.stat("catalog.json"), client.list("documents"), client.read("catalog.json")]);
  assert.deepEqual([statSync(root), statSync(join(root, "catalog.json")), statSync(join(root, "documents"))].map(s => [s.mtimeMs, s.ctimeMs, s.mode]), before);
  await run.write(writer => {
    writer.setAccess("documents/保留 空格", "readwrite"); writer.setAccess("documents/copy.txt", "readwrite");
    writer.removeTree("documents/保留 空格"); writer.removeTree("catalog.json"); writer.removeTree("catalog.json");
  });
  assert.equal(existsSync(join(root, "catalog.json")), false);
  assert.equal(existsSync(join(root, "documents/保留 空格")), false);
});

test("SHF-IO-S03 invalid paths fail before creating any parent and undeclared roots remain untouched", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name);
  for (const relative of ["", "/tmp/escape", "../escape", "documents/../escape", "documents//file", "documents/new/.", "documents/new/", "documents/new/../file", "documents/a\\b", "documents/a\u0000b", "C:/outside", "C:outside", "other/file", "catalog.json/child"]) {
    await assert.rejects(run.write(writer => writer.writeFile(relative, Buffer.from("refused"), "create")), /路径|声明/u, relative);
    await assert.rejects(run.read(client => client.stat(relative)), /路径|声明/u, relative);
    assert.equal(existsSync(root), false, relative);
  }
  await assert.rejects(run.write(writer => writer.mkdir("catalog.json")));
  await assert.rejects(run.write(writer => writer.removeTree("documents")));
  assert.equal(existsSync(root), false);
});

test("SHF-IO-S03 symlinks, special nodes, file parents and directory-as-file are rejected with stable disk contents", { timeout: 30_000 }, async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name), directory = join(root, "documents");
  const outside = join(home, "outside"); mkdirSync(outside); writeFileSync(join(outside, "original"), "another owner");
  await run.write(writer => writer.mkdir("documents"));
  symlinkSync(join(outside, "original"), join(directory, "linked"));
  symlinkSync(outside, join(directory, "linked-parent"));
  mkdirSync(join(directory, "folder")); writeFileSync(join(directory, "file-parent"), "ordinary");
  execFileSync("mkfifo", [join(directory, "pipe")]);
  for (const relative of ["documents/linked", "documents/linked-parent/child", "documents/pipe", "documents/folder", "documents/file-parent/child"]) {
    await assert.rejects(run.read(client => client.read(relative)), undefined, relative);
    await assert.rejects(run.write(writer => writer.writeFile(relative, Buffer.from("refused"), "replace")), undefined, relative);
  }
  await assert.rejects(run.read(client => client.list("documents")), { code: "host.owner_file_unsafe" });
  await assert.rejects(run.read(client => client.stat("documents/pipe")), { code: "host.owner_file_unsafe" });
  for (const relative of ["documents/linked", "documents/pipe"]) {
    await assert.rejects(run.write(writer => writer.setAccess(relative, "readonly")));
    await assert.rejects(run.write(writer => writer.removeTree(relative)));
    await assert.rejects(run.write(writer => writer.replaceFileAtomic(relative, Buffer.from("refused"))));
  }
  assert.equal(readFileSync(join(outside, "original"), "utf8"), "another owner");
  assert.equal(existsSync(join(outside, "child")), false);
  rmSync(directory, { recursive: true }); symlinkSync(outside, directory);
  await assert.rejects(run.write(writer => writer.mkdir("documents/new")));
  await assert.rejects(run.read(client => client.list("documents")));
  rmSync(directory); rmSync(root, { recursive: true }); symlinkSync(outside, root);
  await assert.rejects(run.read(client => client.stat("documents")));
  await assert.rejects(run.write(writer => writer.writeFile("catalog.json", Buffer.from("refused"), "create")));
  assert.deepEqual(readdirSync(outside), ["original"]);
});

test("SHF-IO-S03 hard links are refused by every file primitive and unsafe removeTree preflight deletes nothing", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name), directory = join(root, "documents");
  await run.write(writer => { writer.mkdir("documents/tree"); writer.writeFile("documents/source", Buffer.from("source"), "create"); writer.writeFile("documents/tree/good", Buffer.from("keep"), "create"); });
  const outside = join(home, "hard-original"); writeFileSync(outside, "outside"); linkSync(outside, join(directory, "tree", "hard"));
  const outsideMode = statSync(outside).mode;
  for (const read of [(client: ReturnType<typeof probe.client>) => client.stat("documents/tree/hard"), (client: ReturnType<typeof probe.client>) => client.read("documents/tree/hard"), (client: ReturnType<typeof probe.client>) => client.list("documents/tree")]) {
    await assert.rejects(run.read(read), { code: "host.owner_file_unsafe" });
  }
  await assert.rejects(run.write(writer => writer.copyFile("documents/tree/hard", "documents/new")));
  await assert.rejects(run.write(writer => writer.copyFile("documents/source", "documents/tree/hard")));
  await assert.rejects(run.write(writer => writer.writeFile("documents/tree/hard", Buffer.from("bad"), "replace")));
  await assert.rejects(run.write(writer => writer.replaceFileAtomic("documents/tree/hard", Buffer.from("bad"))));
  await assert.rejects(run.write(writer => writer.setAccess("documents/tree/hard", "readonly")));
  await assert.rejects(run.write(writer => writer.removeTree("documents/tree")));
  assert.equal(readFileSync(join(directory, "tree/good"), "utf8"), "keep");
  assert.equal(readFileSync(outside, "utf8"), "outside");
  assert.equal(statSync(outside).mode, outsideMode);
  assert.equal(existsSync(join(directory, "new")), false);
  await run.write(writer => { writer.mkdir("documents/normal/child"); assert.equal(writer.stat("documents/normal")?.kind, "directory"); writer.setAccess("documents/normal", "readwrite"); writer.removeTree("documents/normal"); });
});

test("SHF-IO-S06 atomic rename failure keeps old bytes and removes only its temporary file; files over 32 MiB work", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), root = join(home, probe.owner_files.store_name);
  await run.write(writer => writer.writeFile("catalog.json", Buffer.from("old catalog"), "create"));
  // Inject a real permission failure after the temporary file has been written and closed.
  const rename = fs.renameSync, targetFile = realpathSync(join(root, "catalog.json"));
  let attempted = false;
  const failing = t.mock.method(fs, "renameSync", (source, target) => {
    if (target !== targetFile) return rename(source, target);
    attempted = true; assert.equal(readFileSync(source, "utf8"), "new catalog"); chmodSync(root, 0o500);
    try { return rename(source, target); } finally { chmodSync(root, 0o700); }
  });
  syncBuiltinESMExports();
  try { await assert.rejects(run.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("new catalog")))); }
  finally { failing.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(attempted, true);
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "old catalog");
  assert.deepEqual(readdirSync(root), ["catalog.json"]);
  await run.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("new catalog")));
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "new catalog");
  const large = Buffer.alloc(33 * 1024 * 1024, 71);
  await run.write(writer => writer.writeFile("documents/large", large, "create"));
  assert.equal(await run.read(client => {
    const returned = client.read("documents/large");
    assert.ok(returned instanceof Uint8Array); assert.deepEqual(returned, large);
    return returned.byteLength;
  }), large.byteLength, "the service reads all bytes; the action's diagnostic result stays small");
});
