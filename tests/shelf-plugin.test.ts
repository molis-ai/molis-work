import { extractMaterial } from "../apps/local-host/dist/material-extraction.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { INTERACTION_TEXTURE_STYLES } from "@molis-ai/molis-work-design-system";
import {
  CLIPBOARD_LIMIT,
  SAMPLE_PDF_TEXT,
  isShelfFailure,
  clipFingerprint,
  createExtractablePdf,
  hashBytes,
  isConcealedClipboard,
  isEditableShelfItem,
  initializeShelfFiles,
} from "@molis-ai/molis-work-module-shelf";
import {
  SHELF_STYLES,
  SHELF_EN,
  SHELF_MESSAGES,
  SHELF_CLIENT_FACTORY_SCRIPT,
  SHELF_UI_CONTRIBUTION_ID,
  renderShelfWorkbench,
  shelfManifest,
  shelfUiContribution,
  type ShelfListModel,
  type ShelfUiModel,
} from "@molis-ai/molis-work-plugin-shelf";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";
import { openTestShelfFiles, openTestShelfStore } from "./shelf-direct-actions.js";

const primitives: ShelfUiModel["primitives"] = {
  escape: (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  // The page's words are stable keys; the test reads the Chinese of each.
  text: (key, values) => (SHELF_MESSAGES as Record<string, { zh: string }>)[key]?.zh.replace(/\{(\w+)[^}]*\}/g, (_, name) => String(values?.[name] ?? name)) ?? key,
};

function model(overrides: Partial<ShelfListModel> = {}): ShelfListModel {
  return {
    materials: [],
    results: [],
    clipboard: [],
    selected_id: null,
    primitives,
    ...overrides,
  };
}

/** The key the Shelf page says a Chinese text by: its client carries the key, and the Host shows the words of the person's language. */
const keyOf = (zh: string): string => Object.entries(SHELF_MESSAGES).find(([, text]) => text.zh === zh)?.[0] ?? assert.fail(`no key says "${zh}"`);
/** English of a Chinese text: a Shelf page word has it in its message table, the settings page's and the module's in the dictionary. */
const english = (zh: string): string | undefined => Object.values(SHELF_MESSAGES).find(text => text.zh === zh)?.en ?? SHELF_EN[zh];
const clientSays = (zh: string) => SHELF_CLIENT_FACTORY_SCRIPT.includes(keyOf(zh));

/** No terminal Agent: these tests describe the shelf, not this Mac's CLI. */
const NO_AGENT = { disabled: true } as const;

/** The platform's original-file registry as the store sees it (Shelf S3): the path the request offered stays here, never in Shelf's catalog. */
function platformOriginals(offered: () => string) {
  const paths = new Map<string, string>();
  return {
    claimOriginal: async (itemId: string) => { paths.set(itemId, offered()); },
    readOriginal: async (itemId: string) => {
      const path = paths.get(itemId);
      if (!path) throw Object.assign(new Error("没有登记原件"), { code: "material.original.not_registered" });
      return { bytes: readFileSync(path) };
    },
    releaseOriginal: async (itemId: string) => { paths.delete(itemId); },
  };
}

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-shelf-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("empty shelf seeds a real extractable sample PDF and keeps origin hash", async () => {
  await withHome(async (home) => {
    await openTestShelfFiles(home).write(initializeShelfFiles);
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial });
    const snapshot = await store.snapshot();
    assert.equal(snapshot.materials.length, 1);
    assert.equal(snapshot.materials[0]?.name, "试用示例.pdf");
    assert.equal(snapshot.materials[0]?.kind, "pdf");
    assert.equal(snapshot.results.length, 0);
    assert.equal(snapshot.recipes.find((item) => item.recipe === "extract_text")?.available, true);
    assert.equal(snapshot.recipes.find((item) => item.recipe === "summarize")?.available, false);
    const origin = snapshot.materials[0]!;
    assert.equal("origin_realpath" in origin, false);
    const { job, result, origin_hash } = await store.runJob({ recipe: "extract_text", item_id: origin.item_id });
    assert.equal(job.status, "succeeded");
    assert.equal(origin_hash, origin.origin_hash);
    assert.equal(result?.name, "pdf.md");
    assert.equal(result?.group, "result");
    assert.match(result?.preview_text ?? "", new RegExp(SAMPLE_PDF_TEXT));
    const copy = store.readFile(origin.item_id);
    assert.equal(hashBytes(copy.bytes), origin.origin_hash);
    const jobRoot = join(home, "shelf", "jobs", job.job_id);
    assert.equal(existsSync(join(jobRoot, "input", origin.name)), true);
    assert.equal(existsSync(join(jobRoot, "input", origin.name)), true);
    assert.equal(existsSync(join(jobRoot, "output", "pdf.md")), true);
    assert.equal((await store.snapshot()).results[0]?.name, "pdf.md");
  });
});

test("admitting a local file copies bytes and refuses to write if the original hash changes", async () => {
  await withHome(async (home) => {
    const originPath = join(home, "quote.pdf");
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial, ...platformOriginals(() => originPath) });
    const bytes = createExtractablePdf("Quote for the shelf copy.");
    await writeFile(originPath, bytes);
    const item = await store.admit({ filename: "quote.pdf", bytes, mime: "application/pdf" });
    await store.claimOriginal(item.item_id);
    assert.equal(item.origin_hash, hashBytes(bytes));
    await store.runJob({ recipe: "extract_text", item_id: item.item_id });
    assert.equal(hashBytes(readFileSync(originPath)), item.origin_hash);
    await writeFile(originPath, createExtractablePdf("changed original"));
    await assert.rejects(
      store.runJob({ recipe: "extract_text", item_id: item.item_id }),
      (error: unknown) => isShelfFailure(error) && error.code === "shelf.origin_changed",
    );
    await assert.rejects(
      store.runJob({ recipe: "summarize", item_id: item.item_id }),
      (error: unknown) => isShelfFailure(error)
        && error.code === "shelf.no_model"
        && /AI 模型/u.test(error.message),
    );
  });
});

test("a folder over 32 MB is refused whole with a message that says how to split it (64 MB → 32 MB, Shelf S3)", async () => {
  await withHome(async (home) => {
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial });
    const half = Buffer.alloc(16 * 1024 * 1024, 0x61);
    await assert.rejects(store.admitFolder({ name: "big", entries: [{ relative: "a.txt", bytes: half }, { relative: "b.txt", bytes: half }, { relative: "c.txt", bytes: Buffer.from("x") }] }),
      (error: unknown) => isShelfFailure(error) && error.code === "shelf.too_large" && error.message === "这个文件夹超过 32 MB，请把它拆成几个小一点的文件夹再放进来");
    assert.equal((await store.snapshot()).materials.length, 0, "nothing of a refused folder lands on the shelf");
    const fits = await store.admitFolder({ name: "fits", entries: [{ relative: "a.txt", bytes: half }, { relative: "b.txt", bytes: half }] });
    assert.equal(fits.size_bytes, 32 * 1024 * 1024);
  });
});

test("hide, delete, clipboard, and use-as-material keep copies off the original path", async () => {
  await withHome(async (home) => {
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial });
    const item = await store.admitText("clipboard body for the shelf", "note");
    await store.addClipboard("https://example.com/page");
    await store.addClipboard("plain clip");
    const snapshot = await store.snapshot();
    assert.equal(snapshot.clipboard[0]?.kind, "text");
    assert.equal(snapshot.clipboard[0]?.title, "plain clip");
    assert.equal(snapshot.clipboard[1]?.kind, "url");
    assert.equal(snapshot.clipboard[1]?.title, "example.com");
    assert.equal(snapshot.current_clip_id, snapshot.clipboard[0]?.clip_id);
    const joined = await store.clipboardToMaterial(snapshot.clipboard[0]!.clip_id);
    assert.equal(joined.group, "material");
    await store.hide(item.item_id);
    assert.equal((await store.snapshot()).materials.some((entry) => entry.item_id === item.item_id), false);
    assert.equal((await store.snapshot()).materials.some((entry) => entry.name === "试用示例.pdf"), false);
    const quote = await store.admit({
      filename: "quote.pdf",
      bytes: createExtractablePdf("Clipboard follow-up quote."),
      mime: "application/pdf",
    });
    const extracted = await store.runJob({ recipe: "extract_text", item_id: quote.item_id });
    const reused = await store.useAsMaterial(extracted.result!.item_id);
    assert.equal(reused.group, "material");
    await store.deleteCopy(joined.item_id);
    assert.equal(existsSync(join(home, "shelf", joined.relative_path)), false);
    const urlItem = await store.clipboardToMaterial(snapshot.clipboard[1]!.clip_id);
    // A link is captured as a page: the fetch fails offline, the link still lands.
    assert.equal(urlItem.kind, "website");
    assert.match(urlItem.preview_text ?? "", /https:\/\/example\.com\/page/);
    const site = await store.admit({
      filename: "Example Domain.md",
      bytes: Buffer.from("# Example Domain\n\nhttps://example.com/\n\nHello\n", "utf8"),
      mime: "text/x-shelf-website",
    });
    assert.equal(site.kind, "website");
    assert.equal(site.mime, "text/x-shelf-website");
    assert.match(site.preview_text ?? "", /https:\/\/example.com\//);
  });
});

test("clipboard history dedupes, caps at 10, skips concealed types, and deletes records", async () => {
  await withHome(async (home) => {
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial });
    const first = await store.addClipboard("https://example.com/page");
    const again = await store.addClipboard("https://example.com/page");
    assert.equal(again?.clip_id, first?.clip_id);
    assert.equal((await store.snapshot()).clipboard.length, 1);
    assert.equal((await store.snapshot()).clipboard[0]?.fingerprint, clipFingerprint("url", "https://example.com/page"));
    assert.equal(await store.addClipboard("secret password", { types: ["org.nspasteboard.ConcealedType"] }), null);
    assert.equal(isConcealedClipboard(["org.nspasteboard.ConcealedType"]), true);
    assert.equal((await store.snapshot()).clipboard.length, 1);
    assert.equal((await store.snapshot()).current_clip_id, null);
    await store.addClipboard("https://example.com/page");
    for (let index = 0; index < CLIPBOARD_LIMIT; index += 1) {
      await store.addClipboard(`clip body ${index}`);
    }
    const snapshot = await store.snapshot();
    assert.equal(snapshot.clipboard.length, CLIPBOARD_LIMIT);
    assert.equal(snapshot.clipboard[0]?.title, `clip body ${CLIPBOARD_LIMIT - 1}`);
    assert.equal(snapshot.clipboard.some((clip) => clip.kind === "url"), false);
    await store.deleteClipboard(snapshot.clipboard[0]!.clip_id);
    assert.equal((await store.snapshot()).clipboard.length, CLIPBOARD_LIMIT - 1);
    assert.equal((await store.snapshot()).current_clip_id, null);
    assert.equal(await store.addClipboard("file:///tmp/local.pdf"), null);
  });
});

test("writeCopy edits the shelf copy and leaves the original file hash untouched", async () => {
  await withHome(async (home) => {
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial });
    const originPath = join(home, "note.md");
    await writeFile(originPath, "# keep\n");
    const item = await store.admit({
      filename: "note.md",
      bytes: Buffer.from("# keep\n"),
      mime: "text/markdown",
    });
    assert.equal(isEditableShelfItem(item), true);
    const edited = await store.writeCopy(item.item_id, "# edited\n");
    assert.equal(edited.preview_text, "# edited\n");
    assert.equal(edited.origin_hash, item.origin_hash);
    assert.equal(readFileSync(originPath, "utf8"), "# keep\n");
    assert.equal(store.readFile(item.item_id).bytes.toString("utf8"), "# edited\n");
    // 提取文字 is for PDFs and images; a Markdown copy is already text.
    await assert.rejects(
      store.runJob({ recipe: "extract_text", item_id: item.item_id }),
      (error: unknown) => isShelfFailure(error) && error.code === "shelf.recipe_unavailable",
    );
    await writeFile(originPath, "# changed original\n");
    const pdfBytes = createExtractablePdf("PDF stays read-only on the shelf.");
    const pdf = await store.admit({ filename: "locked.pdf", bytes: pdfBytes, mime: "application/pdf" });
    assert.equal(isEditableShelfItem(pdf), false);
    await assert.rejects(
      () => store.writeCopy(pdf.item_id, "nope"),
      (error: unknown) => isShelfFailure(error) && error.code === "shelf.not_text",
    );
  });
});

test("hide keeps the copy; delete removes the copy and job folder, not the original", async () => {
  await withHome(async (home) => {
    const store = openTestShelfStore(home, NO_AGENT, { extract: extractMaterial });
    const originPath = join(home, "keep-me.md");
    await writeFile(originPath, "# original stays\n");
    const item = await store.admit({
      filename: "keep-me.md",
      bytes: Buffer.from("# original stays\n"),
      mime: "text/markdown",
    });
    const copyPath = join(home, "shelf", item.relative_path);
    const source = await store.admit({
      filename: "keep-me.pdf",
      bytes: createExtractablePdf("Keep the original where it is."),
      mime: "application/pdf",
    });
    const extracted = await store.runJob({ recipe: "extract_text", item_id: source.item_id });
    const jobRoot = join(home, "shelf", "jobs", extracted.job.job_id);
    assert.equal(existsSync(jobRoot), true);
    await store.hide(extracted.result!.item_id);
    assert.equal((await store.snapshot()).results.some((entry) => entry.item_id === extracted.result!.item_id), false);
    assert.match(store.readFile(extracted.result!.item_id).bytes.toString("utf8"), /Keep the original where it is/);
    await store.deleteCopy(extracted.result!.item_id);
    assert.equal(existsSync(join(home, "shelf", extracted.result!.relative_path)), false);
    assert.equal(existsSync(jobRoot), false);
    assert.equal(readFileSync(copyPath, "utf8"), "# original stays\n");
    await store.hide(item.item_id);
    assert.equal((await store.snapshot()).materials.some((entry) => entry.item_id === item.item_id), false);
    assert.equal(readFileSync(copyPath, "utf8"), "# original stays\n");
    assert.equal(readFileSync(originPath, "utf8"), "# original stays\n");
    await store.deleteCopy(item.item_id);
    assert.equal(existsSync(copyPath), false);
    assert.equal(readFileSync(originPath, "utf8"), "# original stays\n");
  });
});

test("Shelf UI contribution paints stage folds and DropAgent command chrome", () => {
  const host = new UiHost();
  host.register(shelfUiContribution);
  assert.equal(host.list()[0]?.contribution_id, SHELF_UI_CONTRIBUTION_ID);
  // Shelf has one surface, its tab in the side panel; the work area has no Shelf stage or directory to render.
  for (const surface of ["directory", "workbench"]) {
    assert.throws(() => host.render({ contribution_id: SHELF_UI_CONTRIBUTION_ID, surface, model: { primitives } }), /不存在/);
  }
  const side = host.render({ contribution_id: SHELF_UI_CONTRIBUTION_ID, surface: "side", model: { primitives } satisfies ShelfUiModel });
  assert.match(side, /data-shelf-stage-shell/);
  assert.match(side, /data-shelf="directory"[\s\S]*shelf-side-head[\s\S]*shelf-side-scroll[\s\S]*shelf-side-foot/);
  assert.doesNotMatch(side, /desktop-work-surface|plugin-stage-shell"/, "the side tab is not a work-area stage");
  // The rows arrive from the client; the same markup with rows in it:
  const workbench = renderShelfWorkbench(model({
      materials: [{
        item_id: "item_pdf",
        group: "material",
        kind: "pdf",
        name: "试用示例.pdf",
        relative_path: "files/item_pdf/试用示例.pdf",
        mime: "application/pdf",
        size_bytes: 12,
        origin_hash: "abc",
        hidden: false,
        created_at: "2026-09-17T00:00:00.000Z",
        source_item_id: null,
        job_id: null,
        preview_text: SAMPLE_PDF_TEXT,
      }],
      selected_id: "item_pdf",
  }));
  assert.doesNotMatch(workbench, /data-directory-panel="shelf"/);
  assert.match(workbench, /data-shelf-stage-shell/);
  assert.match(workbench, /data-shelf="directory"/);
  assert.match(workbench, /data-shelf-stage-group="materials"/);
  assert.match(workbench, /data-shelf-stage-group="results"/);
  assert.match(workbench, /data-shelf-stage-group="clipboard"/);
  assert.match(workbench, /#icon-search/);
  assert.match(workbench, /#icon-copy/);
  assert.match(workbench, /data-shelf-drop/);
  assert.match(workbench, /隐藏（列表拿掉，副本还在）/);
  assert.match(workbench, /试用示例\.pdf/);
  assert.match(workbench, /shelf-name__stem">试用示例<\/span><span class="shelf-name__ext">\.pdf/);
  assert.match(workbench, /aria-label="试用示例\.pdf"/);
  assert.match(workbench, /shelf-glyph tone-clay/);
  assert.doesNotMatch(workbench, /shelf-cap/);
  assert.match(workbench, /剪贴板历史/);
  assert.match(workbench, /显示全部/);
  assert.match(workbench, /单击选择，双击复制为当前/);
  assert.match(workbench, /data-work-surface="shelf"/);
  assert.match(workbench, /对照原文/);
  assert.match(workbench, /编辑副本/);
  assert.match(workbench, /data-shelf-edit/);
  assert.match(workbench, /plugin-stage-detail-bar shelf-chrome/);
  assert.match(workbench, /data-shelf-chrome-title/);
  assert.doesNotMatch(workbench, /data-stage-back-only/);
  assert.match(workbench, /开始提取/);
  assert.match(workbench, /加入材料/);
  assert.match(workbench, /发给终端请拖到轮盘/);
  assert.match(workbench, /data-shelf-bar-hint/);
  assert.match(workbench, /data-shelf-confirm-title/);
  assert.match(workbench, /#icon-columns/);
  assert.match(workbench, /data-shelf-collapse/);
  // DropAgent's sidebar header: a + that picks files, and a ··· menu of paste / multi-select.
  assert.match(workbench, /data-shelf-pick aria-label="添加材料"/);
  assert.match(workbench, /data-shelf-paste-clip>粘贴当前剪贴板/);
  assert.match(workbench, /data-shelf-multi aria-pressed="false">多选材料/);
  assert.match(workbench, /data-shelf="directory"[\s\S]*shelf-side-head[\s\S]*shelf-side-scroll[\s\S]*shelf-side-foot/);
  assert.match(workbench, /shelf-side-foot[\s\S]*副本工作区[\s\S]*⌘V 粘贴当前/);
  assert.ok(clientSays("已选 {count} 份材料"));
  assert.equal(english("副本工作区"), "Working copies");
  assert.ok(clientSays("结束多选"));
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /min-width: 761px/);
  // Wide enough (the panel widened), the list stays beside an open item; narrower, the item covers the list (a back button).
  assert.match(SHELF_STYLES, /@container shelf \(min-width: 640px\) \{[\s\S]*?\[data-shelf-stage-shell\]\[data-expanded="true"\] > \[data-shelf="directory"\] \{[^}]*width: 213px/);
  assert.match(SHELF_STYLES, /\[data-shelf-stage-shell\] \{[^}]*container: shelf \/ inline-size/);
  assert.match(SHELF_STYLES, /shelf-side-foot \{[\s\S]*margin-top: auto/);
  assert.match(SHELF_STYLES, /\[data-shelf\] \.shelf-stage-chrome \{[\s\S]*height: 30px;/);
  assert.match(SHELF_STYLES, /\[data-shelf\] \.shelf-search \{[\s\S]*height: 30px;[\s\S]*margin: 0;/);
  assert.match(SHELF_STYLES, /\[data-shelf\] \.shelf-side-op \{[\s\S]*width: 30px; height: 30px;[\s\S]*margin: 0;/);
  assert.doesNotMatch(workbench, /plugin-stage-chrome shelf-stage-chrome/);
  assert.doesNotMatch(SHELF_STYLES, /margin: 12px 0 6px/);
  // The group mark is a neutral label beside a coloured type glyph, never a green tick.
  assert.match(workbench, /goal-collection-mark shelf-group-mark tone-ochre/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /is-ready|icon-check/);
  const withClip = renderShelfWorkbench(model({
      clipboard: [{
        clip_id: "clip_now",
        kind: "text",
        title: "本周待办",
        body: "本周待办：完善文件预览与结果对照。",
        created_at: "2026-09-17T00:00:00.000Z",
        fingerprint: "t:demo",
      }, {
        clip_id: "clip_url",
        kind: "url",
        title: "https://cdn.example.com/file.pdf",
        body: "https://cdn.example.com/file.pdf",
        created_at: "2026-09-17T00:00:00.000Z",
        fingerprint: "u:demo",
      }],
      current_clip_id: "clip_now",
      selected_id: "clip_now",
  }));
  assert.match(withClip, /data-shelf-current/);
  assert.match(withClip, /删除记录/);
  assert.match(withClip, /本周待办/);
  assert.match(withClip, /class="shelf-name">本周待办<\/span>/);
  assert.match(withClip, /class="shelf-name">https:\/\/cdn\.example\.com\/file\.pdf<\/span>/);
  assert.doesNotMatch(withClip, /shelf-name__ext/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /href="#icon-/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-expanded|dataset\.expanded/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-collapse/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /copy:"copy",hide:"x",down:"download",trash:"trash"/);
  // Soft Workbench (DESIGN.md → Typography): the confirm heading takes the 600 title role.
  assert.match(SHELF_STYLES, /shelf-confirm-title \{[^}]*font-weight: var\(--weight-title, 600\)/);
  assert.match(workbench, /data-shelf-confirm-out/);
  assert.match(workbench, /将生成 pdf.md。原文件保持不变。/);
  assert.match(SHELF_STYLES, /shelf-drop-frame/);
  assert.match(SHELF_STYLES, /shelf-act-rule/);
  assert.match(SHELF_STYLES, /is-talk\.is-confirm/);
  assert.match(SHELF_STYLES, /\[aria-disabled="true"\]/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /application\/x-molis-shelf/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-act-rule/);
  assert.ok(clientSays("整理动作"));
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-confirm-title/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /is-fail/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /others\.forEach/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-act=summarize/);
  assert.match(SHELF_STYLES, /--da-side: var\(--content-side\)/);
  assert.match(SHELF_STYLES, /\[data-shelf-stage-shell\] > \[data-shelf="directory"\] \{[^}]*background: var\(--paper\)/);
  assert.doesNotMatch(SHELF_STYLES, /\[data-shelf="directory"\] \{[^}]*background: var\(--da-side\)/);
  assert.doesNotMatch(SHELF_STYLES, /shelf-settings-nav|shelf-settings-tab/);
  assert.match(SHELF_STYLES, /shelf-runtime-pick:has\(input:checked\)/);
  assert.match(SHELF_STYLES, /max-width: 640px/);
  assert.equal(english("原材料已不在工作区，无法对照。"), "The source material is no longer in this workspace.");
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-editor/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-compare-pane/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /\/edit/);
  assert.equal(english("正在编辑副本。原文件保持不变。"), "Editing a copy. The original stays unchanged.");
  assert.equal(english("将生成 pdf.md。原文件保持不变。"), "Creates pdf.md. Your original file stays unchanged.");
  assert.equal(english("整理动作"), "Arrange actions");
  assert.equal(english("快捷键"), "Shortcuts");
  assert.equal(english("打开 / 关闭 Shelf"), "Open / close Shelf");
  assert.equal(english("按下…"), "Press…");
  assert.equal(english("默认"), "Default");
  assert.equal(english("这个组合被占用。"), "This shortcut is already in use.");
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /molis-shelf-notice/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /molis-shelf-refresh/);
  assert.ok(clientSays("原材料已不在工作区，无法对照。"));
  assert.match(SHELF_STYLES, /--da-font: var\(--font\)/);
  assert.match(SHELF_STYLES, /--clay: var\(--mark-clay\)/);
  assert.match(SHELF_STYLES, /--da-panel: var\(--content-paper\)/);
  assert.match(SHELF_STYLES, /\.shelf-row\.is-on \{[\s\S]*background: var\(--da-select\)/);
  assert.match(SHELF_STYLES, /\.shelf-row \{[\s\S]*color: var\(--ink\)/);
  assert.match(SHELF_STYLES, /\.shelf-name \{[\s\S]*flex: 0 1 auto;/);
  assert.match(SHELF_STYLES, /\.shelf-name \{[\s\S]*font-size: 13px/);
  assert.match(SHELF_STYLES, /\.shelf-name \{[\s\S]*color: var\(--ink\)/);
  assert.match(SHELF_STYLES, /\.shelf-row:is\(:hover, :focus-within, \.is-on\):not\(\.is-child\) \{ padding-right: 72px; \}/);
  assert.match(SHELF_STYLES, /\.shelf-row \.shelf-ops \{[\s\S]*display: flex;[\s\S]*opacity: 0/);
  assert.match(SHELF_STYLES, /\.shelf-row:is\(:hover, :focus-within, \.is-on\):not\(\.is-child\) \.shelf-ops \{ opacity: 1/);
  assert.doesNotMatch(SHELF_STYLES, /\.shelf-ops \{[^}]*display: none/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /shelf-name__stem/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /includes\(":\/\/"\)/);
  assert.doesNotMatch(SHELF_STYLES, /shelf-cap/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /shelf-cap/);
  assert.match(SHELF_STYLES, /\.shelf-row \.shelf-when \{[\s\S]*color: var\(--da-faint\)/);
  assert.match(SHELF_STYLES, /\.shelf-row:is\(:hover, :focus-within, \.is-on\):not\(\.is-child\) :is\(\.shelf-when, \.shelf-status, \.shelf-now\)/);
  assert.match(SHELF_STYLES, /html\[data-resolved-theme="dark"\] \[data-shelf\] \.shelf-paper \{[\s\S]*background: var\(--da-panel\)/);
  assert.match(SHELF_STYLES, /\.shelf-paper:active \{ background: var\(--da-press\); \}/);
  // No work-area stage, so no rule reaches into the workbench's plugin sections or its immersive body.
  assert.doesNotMatch(SHELF_STYLES, /data-plugin-section="shelf"|body\.immersive-workbench/);
  assert.doesNotMatch(SHELF_STYLES, /#5e6ad2|--focus:|filter: brightness/);
  const sheet = renderMolisWorkWorkbenchStylesheet();
  // Soft Workbench (DESIGN.md → Plugin identity): Shelf keeps DropAgent structure on the shared tokens —
  // graphite for its primary action, copper for focus, links and on-states.
  assert.ok(sheet.indexOf(INTERACTION_TEXTURE_STYLES) < sheet.lastIndexOf("--da-action: var(--content-accent)"));
  assert.match(SHELF_STYLES, /--da-accent: var\(--accent\);/);
  assert.match(SHELF_STYLES, /\.shelf-primary \{[^}]*background: var\(--da-action\);/);
  assert.match(sheet, /\[data-plugin-id="shelf"\][\s\S]*--plugin-tint: var\(--plugin-shelf\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--content-accent: var\(--action\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--content-side: var\(--surface-soft\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--mark-clay: #B27460;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /data-resolved-theme="dark"[\s\S]*--hue-slate: #a6afd5;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /data-resolved-theme="dark"[\s\S]*--mark-clay: #D29C87;/);
});

test("Shelf declares its routes in its manifest, relative to the plugin's own prefix (Shelf S3: no Host table left)", () => {
  const routes = shelfManifest.routes ?? [];
  const admit = routes.find((route) => route.route_id === "shelf.admit");
  assert.deepEqual([admit?.method, admit?.path], ["POST", "/items"]);
  assert.deepEqual(routes.filter((route) => route.path.startsWith("/api/")).map((route) => route.route_id), []);
});

test("PG-026-S4-01 PG-026-S4-02 demo HTTP restores samples and preserves a successful project when sample restoration fails", { timeout: 60_000 }, async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "shelf-demo-http-"));
  const token = "shelf-plugin-http-token-01234567890123";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(homeDirectory, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`, shelf = origin + "/api/plugins/io.molis.work.shelf/";
  const post = (url: string, body: object) => fetch(url, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": crypto.randomUUID(),
  }, body: JSON.stringify(body) });
  const snapshot = async () => {
    const response = await fetch(shelf); assert.equal(response.status, 200);
    return await response.json() as { materials: Array<{ item_id: string; name: string }> };
  };
  const demo = (action: string, user_confirmed = true) => post(origin + "/api/settings/demo", { action, user_confirmed });
  const projects = async () => await (await fetch(origin + "/api/settings/projects")).json() as { projects: Array<{ project_id: string }> };
  const initialProjects = await projects();
  assert.equal((await demo("create", false)).status, 400);
  assert.deepEqual(await projects(), initialProjects, "an unconfirmed operation creates no project");
  assert.equal((await snapshot()).materials[0]?.name, "试用示例.pdf", "the real Home installation is active");
  for (const action of ["create", "reset"]) {
    const before = await snapshot();
    const removed = await post(shelf + `items/${before.materials[0]!.item_id}/delete`, {});
    assert.equal(removed.status, 200, "the actual Shelf write grant is available");
    assert.equal((await snapshot()).materials.length, 0);
    const response = await demo(action);
    assert.equal(response.status, 200);
    const result = await response.json() as { status: string; project: { project_id: string }; warning?: string };
    assert.equal(result.status, action === "create" ? "created" : "reset");
    assert.equal(result.warning, undefined);
    assert.ok((await projects()).projects.some(project => project.project_id === result.project.project_id));
    assert.equal((await snapshot()).materials[0]?.name, "试用示例.pdf", "a swallowed forbidden error cannot restore the deleted sample");
  }
  const catalog = join(homeDirectory, "shelf", "catalog.json");
  for (const action of ["create", "reset"]) {
    const saved = readFileSync(catalog);
    try {
      await writeFile(catalog, "{broken-shelf-catalog");
      const response = await demo(action);
      assert.equal(response.status, 200, "sample corruption cannot turn a committed project into a reported failure");
      const result = await response.json() as { status: string; project: { project_id: string }; message: string; warning?: string; error?: string };
      assert.equal(result.status, action === "create" ? "existing" : "reset");
      assert.equal(result.message, action === "create" ? "示例项目已经存在" : "示例项目已重建；用户项目未修改");
      assert.equal(result.warning, "Shelf 示例未能恢复，请在 Shelf 中查看后重试。");
      assert.equal(result.error, undefined);
      assert.doesNotMatch(JSON.stringify(result), /broken-shelf-catalog|SyntaxError|Unexpected|catalog\.json/);
      assert.ok((await projects()).projects.some(project => project.project_id === result.project.project_id));
    } finally { await writeFile(catalog, saved); }
    const recovered = await demo(action);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json() as { warning?: string }).warning, undefined);
    assert.equal((await snapshot()).materials[0]?.name, "试用示例.pdf");
  }
});

test("the Shelf plugin routes admit, extract, and do not expose origin paths", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-shelf-http-"));
  const agentSetting = process.env.MOLIS_WORK_SHELF_AGENT;
  process.env.MOLIS_WORK_SHELF_AGENT = "off";
  t.after(() => {
    if (agentSetting === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT;
    else process.env.MOLIS_WORK_SHELF_AGENT = agentSetting;
  });
  const token = "shelf-plugin-http-token-01234567890123";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(homeDirectory, { recursive: true, force: true });
  });
  const headers = () => ({
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": `shelf-http-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  const first = await (await fetch(`${origin}/api/plugins/io.molis.work.shelf/`)).json() as {
    materials: Array<{ item_id: string; name: string; origin_hash: string; origin_realpath?: string }>;
    recipes: Array<{ recipe: string; available: boolean }>;
  };
  assert.equal(first.materials[0]?.name, "试用示例.pdf");
  assert.equal(first.materials[0]?.origin_realpath, undefined);
  assert.equal(first.recipes.find((item) => item.recipe === "extract_text")?.available, true);
  const extractedResponse = await fetch(`${origin}/api/plugins/io.molis.work.shelf/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ recipe: "extract_text", item_id: first.materials[0]!.item_id }),
  });
  assert.equal(extractedResponse.status, 200);
  const extracted = await extractedResponse.json() as { result: { item_id: string; name: string; preview_text: string }; origin_hash: string; snapshot: { results: Array<{ name: string }> } };
  assert.equal(extracted.result.name, "pdf.md");
  assert.equal(extracted.origin_hash, first.materials[0]?.origin_hash);
  assert.match(extracted.result.preview_text, new RegExp(SAMPLE_PDF_TEXT));
  assert.equal(extracted.snapshot.results[0]?.name, "pdf.md");
  const editedResponse = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(extracted.result.item_id)}/edit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: `${extracted.result.preview_text}\n编辑过的副本` }),
  });
  assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json() as { item: { preview_text: string; origin_hash: string } };
  assert.match(edited.item.preview_text, /编辑过的副本/);
  const copy = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(extracted.result.item_id)}/file`);
  assert.match(await copy.text(), /编辑过的副本/);
  const blocked = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(first.materials[0]!.item_id)}/edit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "nope" }),
  });
  assert.equal(blocked.status, 400);
  const still = await (await fetch(`${origin}/api/plugins/io.molis.work.shelf/`)).json() as { materials: Array<{ origin_hash: string }> };
  assert.equal(still.materials[0]?.origin_hash, first.materials[0]?.origin_hash);
  const hidden = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(extracted.result.item_id)}/hide`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  assert.equal(hidden.status, 200);
  const afterHide = await hidden.json() as { snapshot: { results: Array<{ item_id: string }> } };
  assert.equal(afterHide.snapshot.results.some((entry) => entry.item_id === extracted.result.item_id), false);
  const hiddenFile = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(extracted.result.item_id)}/file`);
  assert.equal(hiddenFile.status, 200);
  assert.match(await hiddenFile.text(), /编辑过的副本/);
  const removed = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(extracted.result.item_id)}/delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  assert.equal(removed.status, 200);
  const gone = await fetch(`${origin}/api/plugins/io.molis.work.shelf/items/${encodeURIComponent(extracted.result.item_id)}/file`);
  assert.equal(gone.status, 404);
  const afterResultDelete = await (await fetch(`${origin}/api/plugins/io.molis.work.shelf/`)).json() as { materials: Array<{ origin_hash: string }>; results: unknown[] };
  assert.equal(afterResultDelete.materials[0]?.origin_hash, first.materials[0]?.origin_hash);
  assert.equal(afterResultDelete.results.length, 0);
  const denied = await fetch(`${origin}/api/plugins/io.molis.work.shelf/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ recipe: "summarize", item_id: first.materials[0]!.item_id }),
  });
  assert.equal(denied.status, 503, "no model configured is the platform's actions.connection_required, as at Jelly, Todo, Form and Dataset");
  const clipResponse = await fetch(`${origin}/api/plugins/io.molis.work.shelf/clipboard`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "本周待办：完善文件预览与结果对照。" }),
  });
  assert.equal(clipResponse.status, 200);
  const clip = await clipResponse.json() as { clip: { clip_id: string; title: string }; snapshot: { clipboard: Array<{ clip_id: string }>; current_clip_id: string | null } };
  assert.equal(clip.clip.title, "本周待办：完善文件预览与结果对照。");
  assert.equal(clip.snapshot.clipboard.length, 1);
  assert.equal(clip.snapshot.current_clip_id, clip.clip.clip_id);
  const again = await fetch(`${origin}/api/plugins/io.molis.work.shelf/clipboard`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "本周待办：完善文件预览与结果对照。" }),
  });
  const againBody = await again.json() as { clip: { clip_id: string }; snapshot: { clipboard: unknown[] } };
  assert.equal(againBody.clip.clip_id, clip.clip.clip_id);
  assert.equal(againBody.snapshot.clipboard.length, 1);
  const concealed = await fetch(`${origin}/api/plugins/io.molis.work.shelf/clipboard`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "hunter2", types: ["org.nspasteboard.ConcealedType"] }),
  });
  const concealedBody = await concealed.json() as { clip: null; snapshot: { clipboard: unknown[]; current_clip_id: string | null } };
  assert.equal(concealedBody.clip, null);
  assert.equal(concealedBody.snapshot.clipboard.length, 1);
  assert.equal(concealedBody.snapshot.current_clip_id, null);
  const deleted = await fetch(`${origin}/api/plugins/io.molis.work.shelf/clipboard/${encodeURIComponent(clip.clip.clip_id)}/delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  assert.equal(deleted.status, 200);
  const afterDelete = await deleted.json() as { snapshot: { clipboard: unknown[] } };
  assert.equal(afterDelete.snapshot.clipboard.length, 0);
});
