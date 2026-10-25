import { pagesTestPorts } from "./fixtures/pages-actions.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PagesBody, PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import {
  pagesActions,
  type PagesStore,
  type PreparedPagesImport,
} from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { servePages } from "./fixtures/pages-runtime.js";

const PROJECT = "pages-import-project";
const OTHER = "pages-import-other";
const FILES = [
  { name: "导入甲.md", data: Buffer.from("# 导入甲\n\n正文甲。", "utf8").toString("base64") },
  { name: "导入乙.md", data: Buffer.from("# 导入乙\n\n正文乙。", "utf8").toString("base64") },
];
const bodyOf = (text: string): PagesBody => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function withHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "pages-import-"));
  try { await run(home); }
  finally { await rm(home, { recursive: true, force: true }); }
}

/** The preview and the import are the two actions the page's import routes run; a body the schema refuses is refused here. */
async function post(store: PagesStore, pathname: string, body: Record<string, unknown>, project = PROJECT) {
  const { actions } = pagesTestPorts(store, project);
  const result = pathname.endsWith("/preview") ? await actions.invoke(pagesActions.previewImport, body as never)
    : await actions.invoke(pagesActions.import, body as never);
  return { status: 200, body: result };
}

async function preview(store: PagesStore, files = FILES): Promise<PreparedPagesImport> {
  const response = await post(store, "/api/pages/import/preview", { files });
  assert.equal(response?.status, 200);
  return response.body as PreparedPagesImport;
}

test("Pages 导入预览只转换，选择的文档才落库并可重开编辑", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const folder = store.createFolder({ project_id: PROJECT, title: "导入文件夹" });
    const prepared = await preview(store);
    assert.equal(prepared.documents.length, 2);
    assert.equal(store.list(PROJECT).length, 0);
    const chosen = prepared.documents[1];
    const expectedBody = JSON.parse(JSON.stringify(chosen.body));
    await assert.rejects(post(store, "/api/pages/import", {
      files: FILES, selected_keys: [chosen.key], request_id: randomUUID(), folder_id: folder.id,
      body: bodyOf("客户端伪造正文不应落库"),
    }), { code: "actions.input_invalid" });
    assert.equal(store.list(PROJECT).length, 0);
    const result = await post(store, "/api/pages/import", {
      files: FILES, selected_keys: [chosen.key], request_id: randomUUID(), folder_id: folder.id,
    });
    assert.equal(result?.status, 200);
    const documents = (result.body as { documents: PagesRecord[] }).documents;
    assert.equal(documents.length, 1);
    assert.equal(documents[0].title, chosen.title);
    assert.equal(documents[0].folder_id, folder.id);
    assert.deepEqual(documents[0].body, expectedBody);
    assert.equal(store.list(OTHER).length, 0);
    const id = documents[0].id;
    store.close();
    const reopened = openPagesStore(home);
    assert.deepEqual(reopened.get(id, PROJECT).body, expectedBody);
    reopened.update(id, { body: bodyOf("用户继续编辑") }, PROJECT);
    assert.match(JSON.stringify(reopened.get(id, PROJECT).body), /用户继续编辑/u);
    reopened.close();
  });
});

test("Pages 导入拒绝无选择、重复选择、未知 key、坏请求标识，且不写入", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    try {
      const prepared = await preview(store);
      const key = prepared.documents[0].key;
      for (const selected_keys of [undefined, [], [key, key], ["unknown-document"], [12]]) {
        await assert.rejects(() => post(store, "/api/pages/import", { files: FILES, selected_keys, request_id: randomUUID() }));
      }
      for (const request_id of [undefined, "", "not-a-uuid"]) {
        await assert.rejects(() => post(store, "/api/pages/import", { files: FILES, selected_keys: [key], request_id }));
      }
      assert.equal(store.list(PROJECT).length, 0);
    } finally { store.close(); }
  });
});

test("Pages 导入的文件夹隔离：别的项目的文件夹被拒绝，且不写入", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    try {
      const prepared = await preview(store);
      const foreignFolder = store.createFolder({ project_id: OTHER, title: "其他项目" });
      await assert.rejects(() => post(store, "/api/pages/import", {
        files: FILES, selected_keys: [prepared.documents[0].key], request_id: randomUUID(), folder_id: foreignFolder.id,
      }), /找不到这个文件夹/u);
      assert.equal(store.list(PROJECT).length, 0);
      assert.equal(store.list(OTHER).length, 0);
    } finally { store.close(); }
  });
});

test("W5-01-PAGES-02 a project_id in the query or the body that is not this project's is refused on the import routes, and nothing is written", async (t) => {
  const pages = await servePages(t);
  const refused = async (suffix: string, body: Record<string, unknown>, query = "") => {
    const response = await pages.request(suffix + query, body);
    assert.notEqual(response.status, 200, `${suffix}${query}`);
    assert.equal((await response.json() as { code: string }).code, "actions.scope_mismatch");
  };
  for (const suffix of ["/import/preview", "/import"]) {
    await refused(suffix, { files: FILES, selected_keys: ["x"], request_id: randomUUID(), project_id: OTHER });
    await refused(suffix, { files: FILES, selected_keys: ["x"], request_id: randomUUID() }, `?project_id=${OTHER}`);
  }
  const store = openPagesStore(pages.home);
  try { assert.equal(store.list(pages.project.project_id).length + store.list(OTHER).length, 0); } finally { store.close(); }
  // The project it is mounted in is accepted, and the page's own id is stripped before the action sees it.
  const prepared = await pages.http<PreparedPagesImport>("/import/preview", { files: FILES, project_id: pages.project.project_id });
  assert.equal(prepared.documents.length, 2);
});

test("Pages 整批创建失败会回滚，失败请求可用相同标识重试", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    try {
      const existing = store.create({ project_id: PROJECT, title: "原有文档", body: bodyOf("不应改动") });
      const batch = {
        project_id: PROJECT, request_id: randomUUID(), request_hash: "a".repeat(64),
        documents: [{ title: "第一篇", body: bodyOf("第一篇") }, { title: "长".repeat(81), body: bodyOf("第二篇") }],
      };
      assert.throws(() => store.importDocuments(batch), /标题须为/u);
      assert.deepEqual(store.list(PROJECT), [existing]);
      const retried = store.importDocuments({ ...batch, documents: [{ title: "第一篇", body: bodyOf("第一篇") }] });
      assert.equal(retried.length, 1);
      assert.equal(store.list(PROJECT).length, 2);
    } finally { store.close(); }
  });
});

test("Pages 一批文件中有坏文件时，预览与导入都不写入", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    try {
      const prepared = await preview(store);
      const files = [FILES[0], { name: "坏文件.md", data: "not base64!" }];
      for (const pathname of ["/api/pages/import/preview", "/api/pages/import"]) {
        await assert.rejects(() => post(store, pathname, {
          files, selected_keys: [prepared.documents[0].key], request_id: randomUUID(),
        }));
        assert.equal(store.list(PROJECT).length, 0);
      }
    } finally { store.close(); }
  });
});

test("Pages 导入重试返回相同 ID 与最新编辑，重开后仍幂等", async () => {
  await withHome(async (home) => {
    let store = openPagesStore(home);
    try {
      const prepared = await preview(store);
      const input = { files: FILES, selected_keys: prepared.documents.map((document) => document.key), request_id: randomUUID() };
      const first = await post(store, "/api/pages/import", input);
      const original = (first?.body as { documents: PagesRecord[] }).documents;
      const edited = store.update(original[0].id, { title: "导入后已改标题", body: bodyOf("导入后编辑") }, PROJECT);
      store.close();
      store = openPagesStore(home);
      const second = await post(store, "/api/pages/import", { ...input, selected_keys: [...input.selected_keys].reverse() });
      const retried = (second?.body as { documents: PagesRecord[] }).documents;
      assert.deepEqual(retried.map((document) => document.id), original.map((document) => document.id));
      assert.deepEqual(retried[0], edited);
      assert.equal(store.list(PROJECT).length, 2);
      const other = await post(store, "/api/pages/import", input, OTHER);
      assert.notEqual((other?.body as { documents: PagesRecord[] }).documents[0].id, original[0].id);
      assert.equal(store.list(OTHER).length, 2);
    } finally { store.close(); }
  });
});

test("Pages 同一导入标识更改文件、选择或文件夹都会冲突，不写入新文档", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    try {
      const prepared = await preview(store);
      const input = { files: FILES, selected_keys: prepared.documents.map((document) => document.key), request_id: randomUUID() };
      await post(store, "/api/pages/import", input);
      const before = store.list(PROJECT);
      const folder = store.createFolder({ project_id: PROJECT, title: "其他文件夹" });
      const alternatives = [
        { ...input, files: [{ ...FILES[0], data: Buffer.from("改变的正文").toString("base64") }, FILES[1]] },
        { ...input, selected_keys: [input.selected_keys[0]] },
        { ...input, folder_id: folder.id },
      ];
      for (const alternate of alternatives) {
        await assert.rejects(() => post(store, "/api/pages/import", alternate), (error: unknown) => {
          assert.equal(actionErrorResponse(error).status, 409);
          return true;
        });
        assert.deepEqual(store.list(PROJECT), before);
      }
    } finally { store.close(); }
  });
});

test("Pages 导入已删除文档的旧请求不会把文档重新创建", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    try {
      const prepared = await preview(store);
      const input = { files: FILES, selected_keys: prepared.documents.map((document) => document.key), request_id: randomUUID() };
      const first = await post(store, "/api/pages/import", input);
      const documents = (first?.body as { documents: PagesRecord[] }).documents;
      store.delete(documents[0].id, PROJECT);
      await assert.rejects(() => post(store, "/api/pages/import", input), (error: unknown) => {
        const result = actionErrorResponse(error);
        assert.equal(result.status, 409, "已完成的导入不能被当作初次输入错误而重新创建");
        assert.match(result.body.error, /导入已完成.*部分文档已删除.*不会重新创建/u);
        return true;
      });
      assert.deepEqual(store.list(PROJECT), [documents[1]]);
    } finally { store.close(); }
  });
});

test("W5-01-PAGES-03 Pages on the Runtime: only the two import routes accept bodies above 1 MB, and the preview-to-save flow runs", async (t) => {
  const pages = await servePages(t);
  const padding = " ".repeat(1_050_000);
  const largeFiles = [{ name: "large.txt", data: Buffer.from("正文" + " ".repeat(790_000)).toString("base64") }];
  const prepared = await pages.http<PreparedPagesImport>("/import/preview", { files: largeFiles });
  const imported = await pages.http<{ documents: PagesRecord[] }>("/import", {
    files: largeFiles, selected_keys: [prepared.documents[0].key], request_id: randomUUID(),
  });
  assert.equal(imported.documents.length, 1);
  for (const suffix of ["", `/${imported.documents[0].id}`]) {
    const ordinary = await pages.request(suffix, { title: "应拒绝", padding });
    // W3-02-D: a body that is too large is 413 (kind too_large), no longer the generic 400; the Pages import client clears the submission on it.
    assert.equal(ordinary.status, 413);
    assert.match((await ordinary.json() as { error: string }).error, /请求内容过大/u);
  }
  const tooLarge = await pages.request("/import/preview", { files: FILES, padding: " ".repeat(15_000_000) });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { error: "请求内容过大", code: "actions.input_too_large" });
  const persisted = openPagesStore(pages.home);
  try {
    assert.equal(persisted.list(pages.project.project_id).length, 1);
    assert.equal(persisted.list(pages.project.project_id)[0].title, prepared.documents[0].title);
  } finally { persisted.close(); }
});
