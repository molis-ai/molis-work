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
  ShelfError,
  clipFingerprint,
  createExtractablePdf,
  hashBytes,
  isConcealedClipboard,
  isEditableShelfItem,
  openShelfStore,
} from "@molis-ai/molis-work-module-shelf";
import {
  SHELF_NATIVE_PLUGIN_ROUTES,
  SHELF_STYLES,
  SHELF_EN,
  SHELF_CLIENT_FACTORY_SCRIPT,
  SHELF_UI_CONTRIBUTION_ID,
  ShelfPluginRouteTable,
  shelfUiContribution,
  type ShelfPluginRouteHandler,
  type ShelfUiModel,
} from "@molis-ai/molis-work-plugin-shelf";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

const primitives: ShelfUiModel["primitives"] = {
  escape: (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  text: (value) => value,
};

function model(overrides: Partial<ShelfUiModel> = {}): ShelfUiModel {
  return {
    materials: [],
    results: [],
    clipboard: [],
    recipes: [],
    selected_id: null,
    primitives,
    ...overrides,
  };
}

/** No terminal Agent: these tests describe the shelf, not this Mac's CLI. */
const NO_AGENT = { disabled: true } as const;

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
    const store = openShelfStore(home, NO_AGENT);
    const snapshot = store.snapshot();
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
    assert.equal(existsSync(join(jobRoot, "work", origin.name)), true);
    assert.equal(existsSync(join(jobRoot, "output", "pdf.md")), true);
    assert.equal(store.snapshot().results[0]?.name, "pdf.md");
  });
});

test("admitting a local file copies bytes and refuses to write if the original hash changes", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, NO_AGENT);
    const originPath = join(home, "quote.pdf");
    const bytes = createExtractablePdf("Quote for the shelf copy.");
    await writeFile(originPath, bytes);
    const item = store.admit({ filename: "quote.pdf", bytes, mime: "application/pdf", origin_realpath: originPath });
    assert.equal(item.origin_hash, hashBytes(bytes));
    await store.runJob({ recipe: "extract_text", item_id: item.item_id });
    assert.equal(hashBytes(readFileSync(originPath)), item.origin_hash);
    await writeFile(originPath, createExtractablePdf("changed original"));
    await assert.rejects(
      store.runJob({ recipe: "extract_text", item_id: item.item_id }),
      (error: unknown) => error instanceof ShelfError && error.code === "shelf.origin_changed",
    );
    await assert.rejects(
      store.runJob({ recipe: "summarize", item_id: item.item_id }),
      (error: unknown) => error instanceof ShelfError
        && error.code === "shelf.no_agent"
        && error.message === "未发现终端 Agent。",
    );
  });
});

test("hide, delete, clipboard, and use-as-material keep copies off the original path", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, NO_AGENT);
    const item = await store.admitText("clipboard body for the shelf", "note");
    store.addClipboard("https://example.com/page");
    store.addClipboard("plain clip");
    const snapshot = store.snapshot();
    assert.equal(snapshot.clipboard[0]?.kind, "text");
    assert.equal(snapshot.clipboard[0]?.title, "plain clip");
    assert.equal(snapshot.clipboard[1]?.kind, "url");
    assert.equal(snapshot.clipboard[1]?.title, "example.com");
    assert.equal(snapshot.current_clip_id, snapshot.clipboard[0]?.clip_id);
    const joined = await store.clipboardToMaterial(snapshot.clipboard[0]!.clip_id);
    assert.equal(joined.group, "material");
    store.hide(item.item_id);
    assert.equal(store.snapshot().materials.some((entry) => entry.item_id === item.item_id), false);
    assert.equal(store.snapshot().materials.some((entry) => entry.name === "试用示例.pdf"), false);
    const quote = store.admit({
      filename: "quote.pdf",
      bytes: createExtractablePdf("Clipboard follow-up quote."),
      mime: "application/pdf",
    });
    const extracted = await store.runJob({ recipe: "extract_text", item_id: quote.item_id });
    const reused = store.useAsMaterial(extracted.result!.item_id);
    assert.equal(reused.group, "material");
    store.deleteCopy(joined.item_id);
    assert.equal(existsSync(join(home, "shelf", joined.relative_path)), false);
    const urlItem = await store.clipboardToMaterial(snapshot.clipboard[1]!.clip_id);
    // A link is captured as a page: the fetch fails offline, the link still lands.
    assert.equal(urlItem.kind, "website");
    assert.match(urlItem.preview_text ?? "", /https:\/\/example\.com\/page/);
    const site = store.admit({
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
    const store = openShelfStore(home, NO_AGENT);
    const first = store.addClipboard("https://example.com/page");
    const again = store.addClipboard("https://example.com/page");
    assert.equal(again?.clip_id, first?.clip_id);
    assert.equal(store.snapshot().clipboard.length, 1);
    assert.equal(store.snapshot().clipboard[0]?.fingerprint, clipFingerprint("url", "https://example.com/page"));
    assert.equal(store.addClipboard("secret password", { types: ["org.nspasteboard.ConcealedType"] }), null);
    assert.equal(isConcealedClipboard(["org.nspasteboard.ConcealedType"]), true);
    assert.equal(store.snapshot().clipboard.length, 1);
    assert.equal(store.snapshot().current_clip_id, null);
    store.addClipboard("https://example.com/page");
    for (let index = 0; index < CLIPBOARD_LIMIT; index += 1) {
      store.addClipboard(`clip body ${index}`);
    }
    const snapshot = store.snapshot();
    assert.equal(snapshot.clipboard.length, CLIPBOARD_LIMIT);
    assert.equal(snapshot.clipboard[0]?.title, `clip body ${CLIPBOARD_LIMIT - 1}`);
    assert.equal(snapshot.clipboard.some((clip) => clip.kind === "url"), false);
    store.deleteClipboard(snapshot.clipboard[0]!.clip_id);
    assert.equal(store.snapshot().clipboard.length, CLIPBOARD_LIMIT - 1);
    assert.equal(store.snapshot().current_clip_id, null);
    assert.equal(store.addClipboard("file:///tmp/local.pdf"), null);
  });
});

test("writeCopy edits the shelf copy and leaves the original file hash untouched", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, NO_AGENT);
    const originPath = join(home, "note.md");
    await writeFile(originPath, "# keep\n");
    const item = store.admit({
      filename: "note.md",
      bytes: Buffer.from("# keep\n"),
      mime: "text/markdown",
      origin_realpath: originPath,
    });
    assert.equal(isEditableShelfItem(item), true);
    const edited = store.writeCopy(item.item_id, "# edited\n");
    assert.equal(edited.preview_text, "# edited\n");
    assert.equal(edited.origin_hash, item.origin_hash);
    assert.equal(readFileSync(originPath, "utf8"), "# keep\n");
    assert.equal(store.readFile(item.item_id).bytes.toString("utf8"), "# edited\n");
    // 提取文字 is for PDFs and images; a Markdown copy is already text.
    await assert.rejects(
      store.runJob({ recipe: "extract_text", item_id: item.item_id }),
      (error: unknown) => error instanceof ShelfError && error.code === "shelf.recipe_unavailable",
    );
    await writeFile(originPath, "# changed original\n");
    const pdfBytes = createExtractablePdf("PDF stays read-only on the shelf.");
    const pdf = store.admit({ filename: "locked.pdf", bytes: pdfBytes, mime: "application/pdf" });
    assert.equal(isEditableShelfItem(pdf), false);
    assert.throws(
      () => store.writeCopy(pdf.item_id, "nope"),
      (error: unknown) => error instanceof ShelfError && error.code === "shelf.not_text",
    );
  });
});

test("hide keeps the copy; delete removes the copy and job folder, not the original", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, NO_AGENT);
    const originPath = join(home, "keep-me.md");
    await writeFile(originPath, "# original stays\n");
    const item = store.admit({
      filename: "keep-me.md",
      bytes: Buffer.from("# original stays\n"),
      mime: "text/markdown",
      origin_realpath: originPath,
    });
    const copyPath = join(home, "shelf", item.relative_path);
    const source = store.admit({
      filename: "keep-me.pdf",
      bytes: createExtractablePdf("Keep the original where it is."),
      mime: "application/pdf",
    });
    const extracted = await store.runJob({ recipe: "extract_text", item_id: source.item_id });
    const jobRoot = join(home, "shelf", "jobs", extracted.job.job_id);
    assert.equal(existsSync(jobRoot), true);
    store.hide(extracted.result!.item_id);
    assert.equal(store.snapshot().results.some((entry) => entry.item_id === extracted.result!.item_id), false);
    assert.match(store.readFile(extracted.result!.item_id).bytes.toString("utf8"), /Keep the original where it is/);
    store.deleteCopy(extracted.result!.item_id);
    assert.equal(existsSync(join(home, "shelf", extracted.result!.relative_path)), false);
    assert.equal(existsSync(jobRoot), false);
    assert.equal(readFileSync(copyPath, "utf8"), "# original stays\n");
    store.hide(item.item_id);
    assert.equal(store.snapshot().materials.some((entry) => entry.item_id === item.item_id), false);
    assert.equal(readFileSync(copyPath, "utf8"), "# original stays\n");
    assert.equal(readFileSync(originPath, "utf8"), "# original stays\n");
    store.deleteCopy(item.item_id);
    assert.equal(existsSync(copyPath), false);
    assert.equal(readFileSync(originPath, "utf8"), "# original stays\n");
  });
});

test("Shelf UI contribution paints stage folds and DropAgent command chrome", () => {
  const host = new UiHost();
  host.register(shelfUiContribution);
  assert.equal(host.list()[0]?.contribution_id, SHELF_UI_CONTRIBUTION_ID);
  assert.equal(host.render({
    contribution_id: SHELF_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: model(),
  }), "");
  const workbench = host.render({
    contribution_id: SHELF_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({
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
    }),
  });
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
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /已选 \{count\} 份材料/);
  assert.equal(SHELF_EN["副本工作区"], "Working copies");
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /结束多选/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /min-width: 761px/);
  assert.match(SHELF_STYLES, /\[data-shelf-stage-shell\]\[data-expanded="true"\] \{ --tree-width: 213px/);
  assert.match(SHELF_STYLES, /shelf-side-foot \{[\s\S]*margin-top: auto/);
  assert.match(SHELF_STYLES, /\[data-shelf\] \.shelf-stage-chrome \{[\s\S]*height: 30px;/);
  assert.match(SHELF_STYLES, /\[data-shelf\] \.shelf-search \{[\s\S]*height: 30px;[\s\S]*margin: 0;/);
  assert.match(SHELF_STYLES, /\[data-shelf\] \.shelf-side-op \{[\s\S]*width: 30px; height: 30px;[\s\S]*margin: 0;/);
  assert.doesNotMatch(workbench, /plugin-stage-chrome shelf-stage-chrome/);
  assert.doesNotMatch(SHELF_STYLES, /margin: 12px 0 6px/);
  // The group mark is a neutral label beside a coloured type glyph, never a green tick.
  assert.match(workbench, /goal-collection-mark shelf-group-mark tone-ochre/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /is-ready|icon-check/);
  const withClip = host.render({
    contribution_id: SHELF_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({
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
    }),
  });
  assert.match(withClip, /data-shelf-current/);
  assert.match(withClip, /删除记录/);
  assert.match(withClip, /本周待办/);
  assert.match(withClip, /class="shelf-name">本周待办<\/span>/);
  assert.match(withClip, /class="shelf-name">https:\/\/cdn\.example\.com\/file\.pdf<\/span>/);
  assert.doesNotMatch(withClip, /shelf-name__ext/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /href="#icon-'\s*\+/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /expandShelfStage/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-collapse/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /copy: "copy", hide: "x", down: "download", trash: "trash"/);
  assert.match(SHELF_STYLES, /shelf-confirm-title \{[\s\S]*font-weight: 400/);
  assert.match(workbench, /data-shelf-confirm-out/);
  assert.match(workbench, /将生成 pdf.md。原文件保持不变。/);
  assert.match(SHELF_STYLES, /shelf-drop-frame/);
  assert.match(SHELF_STYLES, /shelf-act-rule/);
  assert.match(SHELF_STYLES, /is-talk\.is-confirm/);
  assert.match(SHELF_STYLES, /\[aria-disabled="true"\]/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /application\/x-molis-shelf/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-act-rule/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /整理动作/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-confirm-title/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /is-fail/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /others\.forEach/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-act=summarize/);
  assert.match(SHELF_STYLES, /--da-side: var\(--content-side\)/);
  assert.match(SHELF_STYLES, /max-width: 640px/);
  assert.equal(SHELF_EN["原材料已不在工作区，无法对照。"], "The source material is no longer in this workspace.");
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-editor/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /data-shelf-compare-pane/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /\/edit/);
  assert.equal(SHELF_EN["正在编辑副本。原文件保持不变。"], "Editing a copy. The original stays unchanged.");
  assert.equal(SHELF_EN["将生成 pdf.md。原文件保持不变。"], "Creates pdf.md. Your original file stays unchanged.");
  assert.equal(SHELF_EN["整理动作"], "Arrange actions");
  assert.equal(SHELF_EN["快捷键"], "Shortcuts");
  assert.equal(SHELF_EN["打开 / 关闭 Shelf"], "Open / close Shelf");
  assert.equal(SHELF_EN["按下…"], "Press…");
  assert.equal(SHELF_EN["默认"], "Default");
  assert.equal(SHELF_EN["这个组合被占用。"], "This shortcut is already in use.");
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /molis-shelf-notice/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /molis-shelf-refresh/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /原材料已不在工作区，无法对照/);
  assert.match(SHELF_STYLES, /--da-font: var\(--font\)/);
  assert.match(SHELF_STYLES, /--clay: var\(--mark-clay\)/);
  assert.match(SHELF_STYLES, /--da-panel: var\(--content-paper\)/);
  assert.match(SHELF_STYLES, /\.shelf-row\.is-on \{[\s\S]*background: var\(--da-select\)/);
  assert.match(SHELF_STYLES, /\.shelf-row \{[\s\S]*color: var\(--ink\)/);
  assert.match(SHELF_STYLES, /\.shelf-name \{[\s\S]*flex: 0 1 auto;/);
  assert.match(SHELF_STYLES, /\.shelf-name \{[\s\S]*font-size: 13px/);
  assert.match(SHELF_STYLES, /\.shelf-name \{[\s\S]*color: var\(--ink\)/);
  assert.match(SHELF_STYLES, /\.shelf-row:is\(:hover, \.is-on\):not\(\.is-child\) \{ padding-right: 72px; \}/);
  assert.match(SHELF_STYLES, /\.shelf-row \.shelf-ops \{[\s\S]*display: flex;[\s\S]*opacity: 0/);
  assert.match(SHELF_STYLES, /\.shelf-row:is\(:hover, \.is-on\):not\(\.is-child\) \.shelf-ops \{ opacity: 1/);
  assert.doesNotMatch(SHELF_STYLES, /\.shelf-ops \{[^}]*display: none/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /yieldName/);
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /includes\(":\/\/"\)/);
  assert.doesNotMatch(SHELF_STYLES, /shelf-cap/);
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /shelf-cap/);
  assert.match(SHELF_STYLES, /\.shelf-row \.shelf-when \{[\s\S]*color: var\(--da-faint\)/);
  assert.match(SHELF_STYLES, /\.shelf-row:is\(:hover, \.is-on\):not\(\.is-child\) :is\(\.shelf-when, \.shelf-status, \.shelf-now\)/);
  assert.match(SHELF_STYLES, /html\[data-resolved-theme="dark"\] \[data-shelf\] \.shelf-paper \{[\s\S]*background: var\(--da-panel\)/);
  assert.match(SHELF_STYLES, /\.shelf-paper:active \{ background: var\(--da-press\); \}/);
  assert.match(SHELF_STYLES, /plugin-section\[data-plugin-section="shelf"\] > \.immersive-plugin-link \{[\s\S]*display: none !important;/);
  assert.doesNotMatch(SHELF_STYLES, /#5e6ad2|--focus:|filter: brightness/);
  const sheet = renderMolisWorkWorkbenchStylesheet();
  assert.ok(sheet.indexOf(INTERACTION_TEXTURE_STYLES) < sheet.lastIndexOf("--da-accent: var(--content-accent)"));
  assert.match(sheet, /\[data-plugin-id="shelf"\][\s\S]*--plugin-tint: var\(--plugin-shelf\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--content-accent: var\(--hue-slate\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--mark-clay: #B27460;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /data-resolved-theme="dark"[\s\S]*--hue-slate: #a6afd5;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /data-resolved-theme="dark"[\s\S]*--mark-clay: #D29C87;/);
});

test("Shelf route table owns matching while Host handlers admit and extract", async () => {
  const fallback: ShelfPluginRouteHandler = () => ({ status: 204 });
  let admitted = "";
  const handlers = Object.fromEntries(SHELF_NATIVE_PLUGIN_ROUTES.map((definition) => [
    definition.route_id,
    definition.route_id === "shelf.admit"
      ? (({ request }) => {
          admitted = String(request.body.filename ?? "");
          return { status: 200, body: { item: { name: admitted } } };
        }) satisfies ShelfPluginRouteHandler
      : fallback,
  ]));
  const routes = new ShelfPluginRouteTable(handlers);
  const result = await routes.handle({
    method: "POST",
    pathname: "/api/shelf/items",
    query: new URLSearchParams(),
    body: { filename: "quote.pdf", bytes_base64: "QQ==" },
  });
  assert.equal(result?.status, 200);
  assert.equal(admitted, "quote.pdf");
  assert.equal(await routes.handle({
    method: "GET",
    pathname: "/api/inbox",
    query: new URLSearchParams(),
    body: {},
  }), null);
});

test("local host /api/shelf admits, extracts, and does not expose origin paths", async (t) => {
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
  const first = await (await fetch(`${origin}/api/shelf`)).json() as {
    materials: Array<{ item_id: string; name: string; origin_hash: string; origin_realpath?: string }>;
    recipes: Array<{ recipe: string; available: boolean }>;
  };
  assert.equal(first.materials[0]?.name, "试用示例.pdf");
  assert.equal(first.materials[0]?.origin_realpath, undefined);
  assert.equal(first.recipes.find((item) => item.recipe === "extract_text")?.available, true);
  const extractedResponse = await fetch(`${origin}/api/shelf/jobs`, {
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
  const editedResponse = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(extracted.result.item_id)}/edit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: `${extracted.result.preview_text}\n编辑过的副本` }),
  });
  assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json() as { item: { preview_text: string; origin_hash: string } };
  assert.match(edited.item.preview_text, /编辑过的副本/);
  const copy = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(extracted.result.item_id)}/file`);
  assert.match(await copy.text(), /编辑过的副本/);
  const blocked = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(first.materials[0]!.item_id)}/edit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "nope" }),
  });
  assert.equal(blocked.status, 400);
  const still = await (await fetch(`${origin}/api/shelf`)).json() as { materials: Array<{ origin_hash: string }> };
  assert.equal(still.materials[0]?.origin_hash, first.materials[0]?.origin_hash);
  const hidden = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(extracted.result.item_id)}/hide`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  assert.equal(hidden.status, 200);
  const afterHide = await hidden.json() as { snapshot: { results: Array<{ item_id: string }> } };
  assert.equal(afterHide.snapshot.results.some((entry) => entry.item_id === extracted.result.item_id), false);
  const hiddenFile = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(extracted.result.item_id)}/file`);
  assert.equal(hiddenFile.status, 200);
  assert.match(await hiddenFile.text(), /编辑过的副本/);
  const removed = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(extracted.result.item_id)}/delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  assert.equal(removed.status, 200);
  const gone = await fetch(`${origin}/api/shelf/items/${encodeURIComponent(extracted.result.item_id)}/file`);
  assert.equal(gone.status, 404);
  const afterResultDelete = await (await fetch(`${origin}/api/shelf`)).json() as { materials: Array<{ origin_hash: string }>; results: unknown[] };
  assert.equal(afterResultDelete.materials[0]?.origin_hash, first.materials[0]?.origin_hash);
  assert.equal(afterResultDelete.results.length, 0);
  const denied = await fetch(`${origin}/api/shelf/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ recipe: "summarize", item_id: first.materials[0]!.item_id }),
  });
  assert.equal(denied.status, 409);
  const clipResponse = await fetch(`${origin}/api/shelf/clipboard`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "本周待办：完善文件预览与结果对照。" }),
  });
  assert.equal(clipResponse.status, 200);
  const clip = await clipResponse.json() as { clip: { clip_id: string; title: string }; snapshot: { clipboard: Array<{ clip_id: string }>; current_clip_id: string | null } };
  assert.equal(clip.clip.title, "本周待办：完善文件预览与结果对照。");
  assert.equal(clip.snapshot.clipboard.length, 1);
  assert.equal(clip.snapshot.current_clip_id, clip.clip.clip_id);
  const again = await fetch(`${origin}/api/shelf/clipboard`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "本周待办：完善文件预览与结果对照。" }),
  });
  const againBody = await again.json() as { clip: { clip_id: string }; snapshot: { clipboard: unknown[] } };
  assert.equal(againBody.clip.clip_id, clip.clip.clip_id);
  assert.equal(againBody.snapshot.clipboard.length, 1);
  const concealed = await fetch(`${origin}/api/shelf/clipboard`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: "hunter2", types: ["org.nspasteboard.ConcealedType"] }),
  });
  const concealedBody = await concealed.json() as { clip: null; snapshot: { clipboard: unknown[]; current_clip_id: string | null } };
  assert.equal(concealedBody.clip, null);
  assert.equal(concealedBody.snapshot.clipboard.length, 1);
  assert.equal(concealedBody.snapshot.current_clip_id, null);
  const deleted = await fetch(`${origin}/api/shelf/clipboard/${encodeURIComponent(clip.clip.clip_id)}/delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  assert.equal(deleted.status, 200);
  const afterDelete = await deleted.json() as { snapshot: { clipboard: unknown[] } };
  assert.equal(afterDelete.snapshot.clipboard.length, 0);
});
