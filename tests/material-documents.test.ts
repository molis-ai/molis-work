import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createPagesActionHandlers, createPagesContentHandlers, openPagesStore, pagesActions, pagesManifest, PAGES_ACTION_PERMISSIONS, preparePagesImport } from "@molis-ai/molis-work-plugin-pages";
import { readMaterialDocuments, readMaterialUploads } from "../apps/local-host/src/material-documents.js";
import { MaterialExtractionError } from "../apps/local-host/src/material-text.js";
import { preparePagesFileImport } from "../apps/local-host/src/pages-import.js";

const { zipSync } = createRequire(new URL("../apps/local-host/package.json", import.meta.url))("fflate") as { zipSync(entries: Record<string, Uint8Array>, options?: { level: number }): Uint8Array };
const docx = () => zipSync({
  "[Content_Types].xml": Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
  "word/document.xml": Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>保留事实</w:t></w:r></w:p></w:body></w:document>'),
});

test("the shared document reader returns semantic content; Pages separately owns keys and editor structure", async () => {
  const input = docx(), original = new Uint8Array(input);
  const materials = await readMaterialDocuments([{ file_name: "source.docx", bytes: input }, { file_name: "second.md", bytes: Buffer.from("# 标题\n正文") }]);
  assert.deepEqual(input, original);
  assert.equal(materials.documents[0]!.format, "html"); assert.match(materials.documents[0]!.content, /<strong>保留事实<\/strong>/);
  assert.equal("body" in materials.documents[0]!, false); assert.equal("key" in materials.documents[0]!, false);
  assert.equal("pages" in materials.documents[0]!, false);
  const prepared = preparePagesImport(materials);
  assert.deepEqual(prepared.documents.map(document => document.key), ["document-1", "document-2"]);
  assert.equal(prepared.documents[1]!.title, "标题"); assert.match(JSON.stringify(prepared.documents[0]!.body), /"type":"strong"/);
  assert.throws(() => preparePagesImport({ ...materials, documents: [{ ...materials.documents[0]!, coverage: { status: "partial", issues: [], truncated: true } }] }), /截断/);
});

test("DOCX/ZIP parsing cancellation and timeout release the real worker and do not poison later imports", async () => {
  const ports = () => process.getActiveResourcesInfo().filter(resource => resource === "MessagePort").length;
  const initial = ports(), source = [{ file_name: "source.docx", bytes: docx() }];
  const controller = new AbortController(), stopped = new Error("stop importing");
  const pending = readMaterialDocuments(source, { signal: controller.signal }); controller.abort(stopped);
  await assert.rejects(pending, error => error === stopped); assert.equal(ports(), initial);
  await assert.rejects(readMaterialDocuments(source, { timeoutMs: 1 }), error => error instanceof MaterialExtractionError && error.code === "timeout");
  assert.equal(ports(), initial);
  assert.match((await readMaterialDocuments(source)).documents[0]!.content, /保留事实/); assert.equal(ports(), initial);
});

test("transport validation precedes parsing and BOM decoding is opt-in for document imports", async () => {
  await assert.rejects(readMaterialUploads([{ file_name: "bad.txt", data_base64: "YR==" }]), /编码无效/);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("中文原文", "utf16le")]);
  const result = await readMaterialUploads([{ file_name: "export.txt", data_base64: utf16.toString("base64") }]);
  assert.equal(result.documents[0]!.content, "中文原文");
  assert.equal(result.documents[0]!.coverage.status, "sufficient");
  const empty = await readMaterialDocuments([{ file_name: "empty.txt", bytes: new Uint8Array() }]);
  assert.equal(empty.documents[0]!.coverage.status, "insufficient");
});

for (const mode of ["cancelled", "revoked", "replaced"] as const) for (const preview of [false, true]) {
  test(`Pages ${preview ? "preview" : "import"} rejects ${mode} after real parsing without committing a partial batch`, async () => {
    const home = await mkdtemp(join(tmpdir(), "pages-import-authority-")), store = openPagesStore(home), service = new ActionService();
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let permitted = true, pause = true, controller = new AbortController();
    const register = () => service.registerProvider({ provider: { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin", project_id: "a" },
      definitions: pagesManifest.actions!, handlers: [...createPagesActionHandlers({ withStore: run => run(store), modelAvailability: () => ({ available: false, code: "offline", reason: "unused" }),
        async prepareImport(files, caller) {
          const prepared = await preparePagesFileImport(files, { signal: caller.signal });
          if (pause) { entered.resolve(); await release.promise; }
          return prepared;
        },
      }), ...createPagesContentHandlers(service)] });
    let dispose = register(), pending: Promise<unknown> | undefined;
    const caller = (): ActionCallContext => ({ actor_id: "owner", audience: "user", project_id: "a", permissions: PAGES_ACTION_PERMISSIONS, signal: controller.signal,
      validate_permissions() { if (!permitted) throw new ActionError("actions.revoked", "权限已撤销"); } });
    const files = [{ name: "source.docx", data: Buffer.from(docx()).toString("base64") }];
    const input = { files, selected_keys: ["document-1"], request_id: randomUUID() };
    try {
      pending = service.invoke(caller(), preview ? pagesActions.previewImport : pagesActions.import, preview ? { files } : input);
      const rejected = assert.rejects(pending, mode === "cancelled" ? { name: "AbortError" } : { code: mode === "revoked" ? "actions.revoked" : "actions.provider_changed" });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("parser gate was bypassed"); })]);
      assert.equal(store.list("a").length, 0);
      if (mode === "cancelled") controller.abort();
      if (mode === "revoked") permitted = false;
      if (mode === "replaced") { dispose(); dispose = register(); }
      pause = false; release.resolve(); await rejected;
      assert.equal(store.list("a").length, 0); assert.equal(store.list("b").length, 0);
      permitted = true; controller = new AbortController();
      await service.invoke(caller(), pagesActions.previewImport, { files }); assert.equal(store.list("a").length, 0);
      const first = await service.invoke(caller(), pagesActions.import, input) as { documents: { id: string }[] };
      const id = first.documents[0]!.id;
      store.update(id, { title: "用户后续编辑" }, "a");
      const replay = await service.invoke(caller(), pagesActions.import, input) as { documents: { id: string; title: string }[] };
      assert.equal(replay.documents[0]!.id, id); assert.equal(replay.documents[0]!.title, "用户后续编辑");
      assert.equal(store.list("a").length, 1); assert.equal(store.list("b").length, 0);
      await assert.rejects(service.invoke({ ...caller(), project_id: "b" }, pagesActions.import, input), { code: "actions.scope_mismatch" });
    } finally { release.resolve(); await pending?.catch(() => {}); dispose(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
}


test("decoded archive text also obeys the aggregate output bound without returning a partial batch", async () => {
  // UTF-16 Chinese expands to UTF-8. Moderate entropy keeps the real ZIP within both ratio and upload limits.
  const text = Buffer.alloc(4_800_000); text[0] = 0xff; text[1] = 0xfe;
  let seed = 12345;
  for (let index = 2; index < text.length; index += 2) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    text.writeUInt16LE(0x4e00 + (seed >>> 26), index);
  }
  const bytes = zipSync({ "a.txt": text, "b.txt": text, "c.txt": text }, { level: 6 });
  assert.ok(bytes.length < 10 * 1024 * 1024);
  await assert.rejects(readMaterialDocuments([{ file_name: "expanded.zip", bytes }]), /正文合计不能超过 20 MiB/);
});
