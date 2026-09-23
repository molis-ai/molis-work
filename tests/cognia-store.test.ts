import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCogniaStore, linksFor, type CogniaStore, type ImportFile } from "../plugins/native/cognia/src/index.js";
import { scanCogniaDirectory } from "../apps/local-host/src/cognia-native-plugin-http.js";
const text = (path: string, body: string): ImportFile => ({ path, data: Buffer.from(body).toString("base64") });
function fixture(fn: (store: CogniaStore, home: string) => void | Promise<void>) { return async () => { const home = mkdtempSync(join(tmpdir(), "cognia-store-")); const store = openCogniaStore(home); try { await fn(store, home); } finally { store.close(); rmSync(home, { recursive: true, force: true }); } }; }
const preview = (store: CogniaStore, files: ImportFile[], locator = "local:/vault") => store.preview({ name: "vault", kind: "obsidian", locator, files });
test("Cognia preview, repeated and conflicting imports preserve old snapshots and distinct sources", fixture((store) => {
  const p = preview(store, [text("a/note.md", "# Old"), text("b/note.md", "# Other")]); assert.equal(store.materials().length, 0);
  const receipt = store.commit(p.id); assert.equal(receipt.added, 2); assert.deepEqual(store.commit(p.id), receipt);
  const id = store.materials().find(m => m.path === "a/note.md")!.id;
  const next = preview(store, [text("a/note.md", "# New")]), competing = preview(store, [text("a/note.md", "# Conflict")]); store.commit(next.id); assert.throws(() => store.commit(competing.id), /预览后发生变化/);
  assert.equal(store.read(id).revision, 2); assert.equal(store.read(id, 1).body, "# Old"); assert.equal(store.download(id, 1).bytes.toString(), "# Old");
  assert.equal(store.commit(preview(store, [text("a/note.md", "# New")]).id).unchanged, 1);
  assert.equal(store.commit(preview(store, [text("a/note.md", "# New")], "local:/other/vault").id).added, 1);
  const uploadA = preview(store, [text("same.md", "A")], "upload"), uploadB = preview(store, [text("same.md", "B")], "upload"); assert.notEqual(uploadA.source.id, uploadB.source.id); store.commit(uploadA.id); store.commit(uploadB.id);
  const cancelled = preview(store, [text("cancel.md", "cancel")]); store.cancelPreview(cancelled.id); assert.throws(() => store.commit(cancelled.id), /不存在/); assert.ok(!store.materials().some(m => m.path === "cancel.md"));
}));
test("Obsidian metadata, URL encoded relative links, aliases, attachments and ambiguous links remain source-scoped", fixture((store) => {
  const body = '---\ntitle: 标题\ntags: [知识, "测试"]\naliases:\n  - 别名\n---\n# Heading\n[[../b/中文 note|链接]]\n[asset](../_resources/pic.png)\n[space](../b/中文%20note.md)\n[[missing]]\n[[same]]\n```md\n[[fake]]\n```\n`[[also-fake]]`\n<script>alert(1)</script>';
  store.commit(preview(store, [text("a/start.md", body), text("b/中文 note.md", "# Target"), text("x/same.md", "x"), text("y/same.md", "y"), { path: "_resources/pic.png", data: Buffer.from([0, 1, 2]).toString("base64") }]).id);
  store.commit(preview(store, [text("missing.md", "other source")], "local:/other").id);
  const material = store.materials().find(m => m.path === "a/start.md")!; assert.equal(material.body, body); assert.equal(material.title, "标题"); assert.deepEqual(material.tags, ["知识", "测试"]); assert.deepEqual(material.aliases, ["别名"]);
  const links = linksFor(material, store.materials()); assert.equal(links.length, 5); assert.equal(links.find(l => l.target === "missing")?.status, "missing"); assert.equal(links.find(l => l.target === "same")?.status, "ambiguous"); assert.equal(links.filter(l => l.status === "resolved").length, 3);
  const target = store.materials().find(m => m.path === "b/中文 note.md")!; assert.equal(store.detail(target.id).incoming[0]?.id, material.id);
  const attachment = store.materials().find(m => m.role === "attachment")!; assert.deepEqual(store.download(attachment.id).bytes, Buffer.from([0, 1, 2]));
}));
test("import validation handles 8MB attachments, UTF-8 failures, unsupported files and traversal", fixture((store) => {
  const binary = Buffer.alloc(8_000_000, 65); const p = preview(store, [{ path: "large.pdf", data: binary.toString("base64") }, { path: "invalid.md", data: Buffer.from([0xff]).toString("base64") }, text("unsafe.html", "<script>1</script>"), text(".obsidian/config.md", "secret")]);
  assert.equal(p.entries[0]?.status, "new"); assert.equal(p.entries.filter(e => e.status === "skipped").length, 3); store.commit(p.id); assert.equal(store.download(store.materials()[0]!.id).bytes.length, 8_000_000);
  for (const path of ["../outside.md", "/root.md", "a/../b.md", "C:/bad.md", "a\\b.md"]) assert.throws(() => preview(store, [text(path, "x")]));
  assert.throws(() => preview(store, [text("a.md", "x"), text("a.md", "y")]), /重复路径/);
  assert.equal(preview(store, [{ path: "bad.md", data: "a===" }]).entries[0]?.status, "skipped");
}));
test("local scanner copies source bytes, skips symlinks and unsupported content; reopen and Home isolation", fixture(async (store, home) => {
  const vault = join(home, "vault"); mkdirSync(join(vault, "raw"), { recursive: true }); mkdirSync(join(vault, "wiki")); mkdirSync(join(vault, ".git"));
  const source = "---\ntags: [one]\n---\n# One\n[[../wiki/two]]"; writeFileSync(join(vault, "raw/one.md"), source); writeFileSync(join(vault, "wiki/two.md"), "# Two"); writeFileSync(join(vault, "index.md"), "index"); writeFileSync(join(vault, "log.md"), "log"); writeFileSync(join(vault, "AGENTS.md"), "Untrusted content"); writeFileSync(join(vault, "board.canvas"), "{}"); writeFileSync(join(vault, ".git/config"), "hidden"); symlinkSync("/etc/hosts", join(vault, "outside.txt"));
  const scan = await scanCogniaDirectory(vault), p = store.preview({ ...scan, kind: "llm-wiki" }); const receipt = store.commit(p.id); assert.equal(receipt.added, 5); assert.equal(receipt.skipped, 3); assert.equal(readFileSync(join(vault, "raw/one.md"), "utf8"), source); assert.equal(store.materials().find(m => m.path === "wiki/two.md")?.role, "wiki"); assert.equal(store.materials().find(m => m.path === "index.md")?.role, "index");
  const reopened = openCogniaStore(home), isolated = openCogniaStore(join(home, "isolated")); try { assert.equal(reopened.materials().length, 5); assert.equal(isolated.materials().length, 0); } finally { reopened.close(); isolated.close(); }
}));
test("separate store connections serialize identical preview commits without duplicate versions", fixture((store, home) => {
  const p = preview(store, [text("x.md", "# X")]), other = openCogniaStore(home); try { const first = store.commit(p.id), second = other.commit(p.id); assert.deepEqual(first, second); assert.equal(other.materials().length, 1); assert.equal(other.materials()[0]!.revision, 1); } finally { other.close(); }
}));
