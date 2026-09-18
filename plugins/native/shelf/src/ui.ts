import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  ShelfClipboardRecord,
  ShelfItemKind,
  ShelfItemRecord,
  ShelfRecipeAvailability,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { SHELF_GLYPH, glyphForKind, toneForKind } from "./glyphs.js";

export const SHELF_UI_CONTRIBUTION_ID = "io.molis.work.native.shelf.ui.v1";

export type ShelfUiSurface = "directory" | "workbench";

export interface ShelfUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface ShelfUiModel {
  readonly materials: readonly ShelfItemRecord[];
  readonly results: readonly ShelfItemRecord[];
  readonly clipboard: readonly ShelfClipboardRecord[];
  readonly recipes: readonly ShelfRecipeAvailability[];
  readonly selected_id: string | null;
  readonly current_clip_id?: string | null;
  readonly primitives: ShelfUiPrimitives;
}

export const shelfUiDescriptor: UiContributionDescriptor = {
  contribution_id: SHELF_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.native.shelf",
  kind: "primary-page",
  navigation_id: "shelf",
  label: "Shelf",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const shelfUiContribution: UiContribution<ShelfUiModel> = {
  descriptor: shelfUiDescriptor,
  render(request: UiRenderRequest<ShelfUiModel>): string {
    switch (request.surface as ShelfUiSurface) {
      case "directory":
        return renderShelfDirectory(request.model);
      case "workbench":
        return renderShelfWorkbench(request.model);
      default:
        throw new Error(`Shelf UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderShelfDirectory(model: ShelfUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-directory-panel" data-slot="directory" data-directory-panel="shelf" data-shelf="directory">
    <label class="shelf-search">${SHELF_GLYPH.search}<input type="search" data-shelf-search placeholder="${p.text("搜索材料")}" aria-label="${p.text("搜索材料")}" autocomplete="off"></label>
    <input data-shelf-file hidden type="file" multiple>
    <ul class="shelf-find" data-shelf-find hidden></ul>
    ${renderDropOverlay(p)}
    <div class="shelf-side-scroll">
      ${fold(p.text("材料"), "ochre", model.materials.length, "materials")}
      <ul class="shelf-tree" data-shelf-list="materials">${model.materials.map((item) => renderRow(item, item.item_id === model.selected_id, p)).join("") || emptyLine(p.text("还没有材料"))}</ul>
      <div data-shelf-results ${model.results.length ? "" : "hidden"}>
        ${fold(p.text("生成结果"), "slate", model.results.length, "results", true)}
        <ul class="shelf-tree" data-shelf-list="results">${model.results.map((item) => renderRow(item, item.item_id === model.selected_id, p)).join("")}</ul>
      </div>
      ${fold(p.text("剪贴板历史"), "ochre", model.clipboard.length, "clipboard", true)}
      <p class="shelf-clip-hint" data-shelf-clip-hint ${model.clipboard.length ? "" : "hidden"}>${p.text("单击选择，双击复制为当前。⌘V 仍直接上架当前剪贴板。")}</p>
      <ul class="shelf-tree" data-shelf-list="clipboard">${model.clipboard.map((clip) => renderClip(clip, clip.clip_id === model.current_clip_id, clip.clip_id === model.selected_id, p)).join("") || emptyLine(p.text("剪贴板是空的"))}</ul>
      <button class="shelf-clip-more" type="button" data-shelf-clip-more hidden>${p.text("显示全部")}</button>
    </div>
  </section>`;
}

export function renderShelfWorkbench(model: ShelfUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-work-surface" data-work-surface="shelf" data-work-surface-label="Shelf" hidden data-shelf="workbench">
    <div class="shelf-stage" data-shelf-stage>
      <div class="shelf-tools">
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-compare aria-pressed="false">${SHELF_GLYPH.compare}${p.text("对照原文")}</span>
        <span style="flex:1"></span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-copy-file>${SHELF_GLYPH.copy}${p.text("复制文件")}</span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-use-material>${SHELF_GLYPH.download}${p.text("用作材料")}</span>
      </div>
      <div class="shelf-chrome" data-shelf-chrome hidden>
        <span class="shelf-chrome-title" data-shelf-chrome-title></span>
        <span class="shelf-chrome-tag" data-shelf-chrome-tag></span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-edit hidden>${p.text("编辑副本")}</span>
      </div>
      <div class="shelf-preview" data-shelf-preview></div>
      <div class="shelf-tty" data-shelf-tty>
        <div class="shelf-tty-bar"><span class="tone-plum">${p.text("对话")}</span> · <span data-shelf-tty-actor>${p.text("发给终端不是副本沙箱")}</span><span style="margin-left:auto"><span class="shelf-paper quiet" role="button" tabindex="0" data-shelf-fold-talk>${p.text("收起")}</span></span></div>
        <div class="shelf-tty-screen" data-shelf-tty-screen></div>
        <div class="shelf-tty-in"><input data-shelf-tty-input placeholder="${p.text("发给当前终端，不会生成新文件")}"></div>
      </div>
      <div class="shelf-drawer" data-shelf-drawer>
        <p class="shelf-confirm-head">
          <span class="shelf-confirm-title" data-shelf-confirm-title>${p.text("提取 PDF 文字")}</span>
          <span class="shelf-confirm-count" data-shelf-confirm-count></span>
        </p>
        <p class="shelf-confirm-out" data-shelf-confirm-out>${p.text("将生成 pdf.md。原文件保持不变。")}</p>
        <div class="shelf-choice" data-shelf-choice hidden>
          <span class="shelf-choice-label" data-shelf-choice-label></span>
          <span class="shelf-seg" role="radiogroup" data-shelf-seg><span class="shelf-seg-plate" data-shelf-seg-plate aria-hidden="true"></span></span>
          <span class="shelf-choice-hint" data-shelf-choice-hint></span>
        </div>
        <dl class="shelf-facts">
          <div class="shelf-fact"><dt>${p.text("读取")}</dt><dd data-shelf-fact="read">${p.text("1 份材料的副本")}</dd></div>
          <div class="shelf-fact"><dt>${p.text("写入")}</dt><dd data-shelf-fact="write">${p.text("仅任务目录")}</dd></div>
          <div class="shelf-fact"><dt>${p.text("网络")}</dt><dd data-shelf-fact="network">${p.text("关")}</dd></div>
          <div class="shelf-fact"><dt>${p.text("隔离")}</dt><dd data-shelf-fact="isolation">${p.text("本机提取，不发送")}</dd></div>
        </dl>
        <p class="shelf-actor" data-shelf-actor>${p.text("本机提取，不发送。")}</p>
        <div class="shelf-drawer-actions">
          <span class="shelf-primary" role="button" tabindex="0" data-shelf-run>${p.text("开始提取")}</span>
          <span class="shelf-paper" role="button" tabindex="0" data-shelf-back>${p.text("返回")}</span>
          <span class="shelf-paper" role="button" tabindex="0" data-shelf-cancel hidden>${p.text("取消")}</span>
        </div>
        <p class="shelf-run-line" data-shelf-run-line hidden>${p.text("正在从副本抽取可选中文字…")}</p>
      </div>
      <div class="shelf-bar-wrap">
        <p class="shelf-bar-hint" data-shelf-bar-hint hidden>${p.text("总结、翻译等动作需要本机 Agent。图片与 PDF 可直接提取文字。")}</p>
        <div class="shelf-bar" data-shelf-bar></div>
      </div>
      ${renderDropOverlay(p)}
    </div>
  </section>`;
}

function renderDropOverlay(p: ShelfUiPrimitives): string {
  return `<div class="shelf-drop" data-shelf-drop aria-hidden="true"><div class="shelf-drop-veil"></div><div class="shelf-drop-frame"></div><div class="shelf-drop-card">${SHELF_GLYPH.tray}<b>${p.text("加入材料")}</b><p>${p.text("发给终端请拖到轮盘")}</p></div></div>`;
}

function fold(label: string, tone: string, count: number, id: string, gap = false): string {
  return `<button class="shelf-fold${gap ? " shelf-fold-gap" : ""}" type="button" data-shelf-fold="${id}">${SHELF_GLYPH.chevron}<span class="tone-${tone}">${label}</span><span class="shelf-count" data-shelf-count="${id}">${count}</span></button>`;
}

function emptyLine(text: string): string {
  return `<li class="shelf-empty-line" data-shelf-empty>${text}</li>`;
}

function renderRow(item: ShelfItemRecord, selected: boolean, p: ShelfUiPrimitives): string {
  const tone = toneForKind(item.kind, item.group);
  const cap = capFor(item.kind);
  return `<li class="shelf-row${selected ? " is-on" : ""}" data-shelf-item="${p.escape(item.item_id)}" data-shelf-kind="${item.kind}" data-shelf-group="${item.group}" data-shelf-name="${p.escape(item.name)}" role="option" aria-selected="${selected ? "true" : "false"}" draggable="true">
    <span class="shelf-glyph tone-${tone}">${glyphForKind(item.kind)}</span>
    <span class="shelf-name">${p.escape(item.name)}</span>
    <span class="shelf-cap">${cap}</span>
    <span class="shelf-ops">
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="copy" aria-label="${p.text("复制")}">${SHELF_GLYPH.copy}</span>
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="hide" aria-label="${p.text("隐藏（列表拿掉，副本还在）")}" title="${p.text("隐藏（列表拿掉，副本还在）")}">${SHELF_GLYPH.hide}</span>
      <span class="shelf-op is-danger" role="button" tabindex="0" data-shelf-row-action="delete" aria-label="${p.text("删除副本")}" title="${p.text("删除副本")}">${SHELF_GLYPH.trash}</span>
    </span>
  </li>`;
}

function renderClip(clip: ShelfClipboardRecord, current: boolean, selected: boolean, p: ShelfUiPrimitives): string {
  const kind: ShelfItemKind = clip.kind === "url" ? "url" : "text";
  const tone = toneForKind(kind, "clipboard");
  return `<li class="shelf-row${selected ? " is-on" : ""}" data-shelf-clip="${p.escape(clip.clip_id)}" data-shelf-kind="${kind}" data-shelf-group="clipboard" data-shelf-name="${p.escape(clip.title)}" role="option" aria-selected="${selected ? "true" : "false"}">
    <span class="shelf-glyph tone-${tone}">${glyphForKind(kind)}</span>
    <span class="shelf-name">${p.escape(clip.title)}</span>
    ${current ? `<span class="shelf-now" data-shelf-current>${p.text("当前")}</span>` : ""}
    <span class="shelf-ops">
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="copy" aria-label="${p.text("复制")}">${SHELF_GLYPH.copy}</span>
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="join" aria-label="${p.text("加入材料")}">${SHELF_GLYPH.download}</span>
      <span class="shelf-op is-danger" role="button" tabindex="0" data-shelf-row-action="delete" aria-label="${p.text("删除记录")}" title="${p.text("删除记录")}">${SHELF_GLYPH.trash}</span>
    </span>
  </li>`;
}

function capFor(kind: string): string {
  if (kind === "folder") return "DIR";
  if (kind === "pdf") return "PDF";
  if (kind === "markdown") return "MD";
  if (kind === "image") return "IMG";
  if (kind === "website") return "WEB";
  if (kind === "url") return "URL";
  return "FILE";
}
