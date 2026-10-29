import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { join } from "node:path";
import { linksFor, type CogniaStore, type ImportFile } from "@molis-ai/molis-work-plugin-cognia";
import { openCogniaStore } from "./fixtures/plugin-home-stores.js";
import { cogniaActions } from "@molis-ai/molis-work-plugin-cognia";
import { directoryForHome } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime, person } from "./fixtures/home-runtime.js";
const text = (path: string, body: string): ImportFile => ({ path, data: Buffer.from(body).toString("base64") });
function fixture(fn: (store: CogniaStore, home: string, t: TestContext) => void | Promise<void>) { return async (t: TestContext) => { const home = mkdtempSync(join(tmpdir(), "cognia-store-")); const store = openCogniaStore(home); try { await fn(store, home, t); } finally { store.close(); rmSync(home, { recursive: true, force: true }); } }; }
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
test("local scanner copies source bytes, skips symlinks and unsupported content; reopen and Home isolation", fixture(async (store, home, t) => {
  const vault = join(home, "vault"); mkdirSync(join(vault, "raw"), { recursive: true }); mkdirSync(join(vault, "wiki")); mkdirSync(join(vault, ".git"));
  const source = "---\ntags: [one]\n---\n# One\n[[../wiki/two]]"; writeFileSync(join(vault, "raw/one.md"), source); writeFileSync(join(vault, "wiki/two.md"), "# Two"); writeFileSync(join(vault, "index.md"), "index"); writeFileSync(join(vault, "log.md"), "log"); writeFileSync(join(vault, "AGENTS.md"), "Untrusted content"); writeFileSync(join(vault, "board.canvas"), "{}"); writeFileSync(join(vault, ".git/config"), "hidden"); symlinkSync("/etc/hosts", join(vault, "outside.txt"));
  const scan = await scanDirectory(t, vault), p = store.preview({ ...scan, kind: "llm-wiki" }); const receipt = store.commit(p.id); assert.equal(receipt.added, 5); assert.equal(receipt.skipped, 3); assert.equal(readFileSync(join(vault, "raw/one.md"), "utf8"), source); assert.equal(store.materials().find(m => m.path === "wiki/two.md")?.role, "wiki"); assert.equal(store.materials().find(m => m.path === "index.md")?.role, "index");
  const reopened = openCogniaStore(home), isolated = openCogniaStore(join(home, "isolated")); try { assert.equal(reopened.materials().length, 5); assert.equal(isolated.materials().length, 0); } finally { reopened.close(); isolated.close(); }
}));
test("separate store connections serialize identical preview commits without duplicate versions", fixture((store, home) => {
  const p = preview(store, [text("x.md", "# X")]), other = openCogniaStore(home); try { const first = store.commit(p.id), second = other.commit(p.id); assert.deepEqual(first, second); assert.equal(other.materials().length, 1); assert.equal(other.materials()[0]!.revision, 1); } finally { other.close(); }
}));

test("资料与来源移出当前列表后固定版本仍可读，领域与草稿可管理", fixture((store) => {
  const domain = store.createDomain("旧领域");
  assert.equal(store.renameDomain(domain.id, "新领域").name, "新领域");
  const manual = store.createMaterial({ title: "原标题", body: "原正文", domain_id: domain.id });
  const updated = store.updateMaterial(manual.id, { title: "新标题", body: "新正文", domain_id: domain.id });
  assert.equal(updated.revision, 2);
  assert.equal(store.read(manual.id, 1).body, "原正文");
  const draft = store.addDraft({ id: "draft-one", title: "草稿", body: "整理正文", domain_id: domain.id,
    references: [{ label: "S1", material_id: manual.id, revision: 1, title: "原标题", path: manual.path, body: "原正文" }], mode: "synthesize", saved_id: null, created_at: new Date().toISOString() });
  const saved = store.saveDraft(draft.id);
  store.archiveDraft(draft.id);
  assert.equal(store.drafts().length, 0);
  assert.equal(store.detail(saved.id).references[0]?.revision, 1);
  const pendingDomain = store.preview({ name: "待导入", kind: "markdown", locator: "local:/pending-domain", domain_id: domain.id, files: [text("pending.md", "待导入")] });
  store.deleteMaterial(manual.id);
  assert.equal(store.materials().some(m => m.id === manual.id), false);
  assert.equal(store.read(manual.id, 1).body, "原正文");
  assert.equal(store.download(manual.id, 2).bytes.toString(), "新正文");
  store.deleteDomain(domain.id);
  assert.throws(() => store.commit(pendingDomain.id), /预览不存在/);
  assert.equal(store.read(saved.id).domain_id, null);
  assert.equal(store.detail(saved.id).references[0]?.material_id, manual.id);
  const imported = store.commit(preview(store, [text("a.md", "导入正文")]).id);
  const source = store.sources().find(s => s.id === imported.source_id)!;
  assert.equal(store.renameSource(source.id, "重命名来源").name, "重命名来源");
  const pendingSource = preview(store, [text("new.md", "新文件")]);
  store.deleteSource(source.id);
  assert.throws(() => store.commit(pendingSource.id), /预览不存在/);
  assert.equal(store.materials().some(m => m.id === imported.material_ids[0]), false);
  assert.equal(store.read(imported.material_ids[0]!, 1).body, "导入正文");
}));

test("RAC-40: Cognia Runtime 路由更新和删除资料后，固定版本仍可通过路由读取", async t => {
  const f = await serveHomeRuntime(t), root = "/api/plugins/io.molis.work.cognia/library";
  const post = (path: string, body: object = {}) => f.request(root + path, { method: "POST", body });
  const { material } = await (await post("/materials", { title: "旧标题", body: "旧正文" })).json();
  const updated = await post(`/materials/${material.id}/update`, { title: "新标题", body: "新正文" });
  assert.equal((await updated.json()).material.revision, 2);
  assert.equal((await post(`/materials/${material.id}/delete`)).status, 200);
  assert.equal((await f.request(root)).status, 200);
  const fixed = await f.request(root + `/materials/${material.id}?revision=1`);
  assert.equal((await fixed.json()).material.body, "旧正文");
  const deleted = await f.request(root + `/materials/${material.id}`);
  assert.equal(deleted.status, 404); assert.match((await deleted.json()).error, /不存在/);
});

/** The Home's Cognia database, opened beside the store's own connection. */
function inspect<T>(home: string, run: (db: DatabaseSync) => T, readOnly = true): T {
  const db = new DatabaseSync(homeSqlitePath(home, "cognia"), { readOnly });
  try { return run(db); } finally { db.close(); }
}

test("a committed import keeps its receipt to replay, not the batch it imported", fixture((store, home) => {
  const big = "# note\n" + "x".repeat(200_000);
  const p = preview(store, [text("a.md", big), text("b.md", "# B")]);
  const staged = inspect(home, db => (db.prepare("SELECT length(body) AS bytes FROM cognia_previews WHERE id=?").get(p.id) as { bytes: number }).bytes);
  assert.ok(staged > 400_000, "a pending preview holds the batch twice over: the bytes and the decoded body");
  const receipt = store.commit(p.id);
  const row = inspect(home, db => db.prepare("SELECT body, receipt FROM cognia_previews WHERE id=?").get(p.id) as { body: string; receipt: string });
  assert.ok(row.body.length < 5_000, `a committed preview keeps no copy of the files (${row.body.length} bytes)`);
  assert.deepEqual(JSON.parse(row.body).files, []);
  assert.deepEqual(JSON.parse(row.receipt), receipt);
  assert.deepEqual(store.commit(p.id), receipt, "a repeated commit still replays its receipt");
  assert.equal(store.download(receipt.material_ids[0]!).bytes.length, Buffer.byteLength(big), "the imported material itself is kept in full");
  // What a committed preview still names, deleting the source or its domain still finds.
  store.deleteSource(receipt.source_id);
  assert.equal(inspect(home, db => (db.prepare("SELECT count(*) AS n FROM cognia_previews WHERE id=?").get(p.id) as { n: number }).n), 0);
}));

test("a draft whose adopted material was deleted is no longer saved, and can be adopted again", fixture((store, home) => {
  const draft = store.addDraft({ id: "d1", title: "草稿", body: "整理正文", domain_id: null, references: [], mode: "synthesize", saved_id: null, created_at: new Date().toISOString() });
  const first = store.saveDraft(draft.id);
  assert.equal(store.drafts()[0]!.saved_id, first.id);
  store.deleteMaterial(first.id);
  assert.equal(store.drafts()[0]!.saved_id, null, "the list does not claim a material the store no longer has");
  assert.equal(store.read(first.id, 1).body, "整理正文", "the fixed version stays readable");
  const again = store.saveDraft(draft.id);
  assert.notEqual(again.id, first.id); assert.equal(again.body, "整理正文");
  assert.equal(store.drafts()[0]!.saved_id, again.id);
  assert.equal(store.saveDraft(draft.id).id, again.id, "adopting a draft twice is still one material");
  // A pointer to a material that is already gone (left by an earlier build) is replaced the same way.
  inspect(home, db => db.prepare("UPDATE cognia_drafts SET body=? WHERE id=?").run(JSON.stringify({ ...store.drafts()[0], saved_id: "gone" }), "d1"), false);
  assert.equal(store.saveDraft(draft.id).body, "整理正文"); assert.notEqual(store.drafts()[0]!.saved_id, "gone");
}));

test("a deleted knowledge material's fixed versions keep their sources, also when the draft is adopted again", fixture(store => {
  const source = store.createMaterial({ title: "来源", body: "来源正文" });
  const reference = { label: "S1", material_id: source.id, revision: 1, title: "来源", path: source.path, body: "来源正文" };
  const draft = store.addDraft({ id: "d1", title: "知识", body: "结论 [S1]", domain_id: null, references: [reference], mode: "synthesize", saved_id: null, created_at: new Date().toISOString() });
  const first = store.saveDraft(draft.id);
  assert.deepEqual(store.detail(first.id, 1).references, [reference]);
  store.deleteMaterial(first.id);
  assert.deepEqual(store.detail(first.id, 1).references, [reference], "deleting the material does not take the sources of its fixed version");
  assert.equal(store.drafts()[0]!.saved_id, null, "the draft still reads as unsaved");
  const second = store.saveDraft(draft.id); store.deleteMaterial(second.id); const third = store.saveDraft(draft.id);
  for (const id of [first.id, second.id, third.id]) assert.deepEqual(store.detail(id, 1).references, [reference], "every material the draft became keeps its sources");
  assert.deepEqual(Object.keys(store.drafts()[0]!).sort(), [...Object.keys(draft)].sort(), "the draft shows only its own fields");
  assert.deepEqual(store.drafts()[0]!.references, [reference]);
}));
test("a directory with more files than a batch holds is refused whole as too large (kind too_large, 413); any other unreadable file is only one skipped row", async t => {
  const vault = mkdtempSync(join(tmpdir(), "cognia-big-vault-"));
  try {
    for (let index = 0; index <= 1000; index++) writeFileSync(join(vault, `n${index}.md`), `# ${index}`);
    await assert.rejects(scanDirectory(t, vault), (error: unknown) => error instanceof ActionError && error.code === "cognia.too_large" && actionHttpStatus(error) === 413);
    const small = mkdtempSync(join(tmpdir(), "cognia-small-vault-"));
    try {
      writeFileSync(join(small, "a.md"), "# a"); symlinkSync(join(small, "a.md"), join(small, "link.md"));
      const scan = await scanDirectory(t, small);
      assert.deepEqual(scan.files.map(file => file.path).sort(), ["a.md", "link.md"]);
      const link = scan.files.find(file => file.path === "link.md")!;
      assert.equal(link.reason, "暂不支持此文件类型");
      assert.equal(link.data, undefined, "the Host's other entry must not expose symlink target bytes");
      assert.equal(Buffer.from(scan.files.find(file => file.path === "a.md")!.data!, "base64").toString(), "# a");
    } finally { rmSync(small, { recursive: true, force: true }); }
  } finally { rmSync(vault, { recursive: true, force: true }); }
});

async function scanDirectory(t: TestContext, vault: string) {
  const f = await serveHomeRuntime(t);
  await f.host.homePlugins!.ready();
  const caller = person(["cognia:read", "cognia:write", "directory:read"]);
  const grant = await directoryForHome(f.home).select({plugin_id: "io.molis.work.cognia", project_id: null, actor_id: caller.actor_id}, async () => ({status: "picked", path: vault}));
  assert.ok(grant);
  return f.host.homeActionClient().invoke(caller, cogniaActions.scan, {grant_id: grant.grant_id, path: "."});
}

test("RAC-1665 names and titles are counted in Unicode characters like the action schema: 120 for a domain, 200 for a source, 500 for a material title, and one more is refused", fixture(store => {
  // The action schemas (src/actions.ts, src/action-schema.ts) count characters; one 🟢 is one character but two UTF-16 units.
  const wide = (count: number) => "🟢".repeat(count);
  const refused = (message: string) => ({ code: "cognia.invalid", message });
  const domain = store.createDomain("旧领域");
  assert.equal(store.renameDomain(domain.id, wide(120)).name, wide(120), "a 120-character domain name is taken on rename");
  assert.equal(store.createDomain(wide(120)).id, domain.id, "and found again by the same name");
  assert.throws(() => store.createDomain(wide(121)), refused("请输入领域名称"), "121 characters is still past the domain limit");
  assert.throws(() => store.renameDomain(domain.id, wide(121)), refused("请输入领域名称"), "also on rename");
  const pending = store.preview({ name: wide(200), kind: "markdown", locator: "local:/wide-name", files: [text("a.md", "# A")] });
  assert.equal(pending.source.name, wide(200), "a new source takes a 200-character name");
  assert.throws(() => store.preview({ name: wide(201), kind: "markdown", locator: "local:/wider-name", files: [text("a.md", "# A")] }),
    refused("请输入来源名称"), "201 characters is still past the source limit");
  const { source_id } = store.commit(pending.id);
  assert.equal(store.renameSource(source_id, wide(200)).name, wide(200), "a source is renamed to 200 characters");
  assert.throws(() => store.renameSource(source_id, wide(201)), refused("请输入来源名称"), "also on rename");
  const material = store.createMaterial({ title: wide(500), body: "正文" });
  assert.equal(material.title, wide(500), "a 500-character title is taken");
  assert.equal(store.updateMaterial(material.id, { title: wide(500), body: "新正文" }).title, wide(500), "and kept on update");
  assert.throws(() => store.createMaterial({ title: wide(501), body: "正文" }), refused("请输入标题"), "501 characters is still past the title limit");
  assert.throws(() => store.updateMaterial(material.id, { title: wide(501), body: "新正文" }), refused("请输入标题"), "also on update");
  assert.equal(store.read(material.id).revision, 2, "the refused update wrote nothing");
  assert.deepEqual(store.domains().map(d => d.name), [wide(120)], "the refused domain was not created");
}));

test("RAC-1666 an import path is counted in Unicode characters up to 1000 and the search words up to 500, like the action schema", fixture(store => {
  // The import file path (src/action-schema.ts) and the search words (src/actions.ts) count characters; one 🟢 is one character but two UTF-16 units.
  const wide = (count: number) => "🟢".repeat(count);
  const path = wide(997) + ".md";
  const p = preview(store, [text(path, "# 很长的路径")]);
  assert.deepEqual(p.entries.map(entry => [entry.path, entry.status]), [[path, "new"]], "a 1000-character path is read");
  assert.throws(() => preview(store, [text(wide(998) + ".md", "# 多一个字")]), { code: "cognia.invalid", message: "资料路径无效" }, "1001 characters is still past the path limit");
  const material = store.createMaterial({ title: "很长的正文", body: wide(500) });
  assert.deepEqual(store.materials(wide(500)).map(m => m.id), [material.id], "500 characters of search words find the material");
  assert.throws(() => store.materials(wide(501)), { code: "cognia.invalid", message: "搜索词过长" }, "501 characters is still past the search limit");
}));
