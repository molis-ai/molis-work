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
import { icon, renderButton } from "@molis-ai/molis-work-design-system";
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
  plugin_id: "io.molis.work.shelf",
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

export function renderShelfDirectory(_model: ShelfUiModel): string {
  return "";
}

export function renderShelfWorkbench(model: ShelfUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="shelf" data-work-surface-label="Shelf" hidden data-shelf="workbench" data-shelf-stage-shell data-expanded="false">
    <div class="plugin-stage-list" data-shelf="directory">
      <header class="shelf-side-head shelf-stage-chrome">
        <label class="shelf-search shelf-stage-search">${SHELF_GLYPH.search}<input type="search" data-shelf-search placeholder="${p.text("搜索材料")}" aria-label="${p.text("搜索材料")}" autocomplete="off"></label>
        <span class="shelf-side-op" role="button" tabindex="0" data-shelf-pick aria-label="${p.text("添加材料")}" title="${p.text("添加材料")}">${SHELF_GLYPH.plus}</span>
        <span class="shelf-side-op" role="button" tabindex="0" data-shelf-side-more aria-label="${p.text("更多")}" title="${p.text("更多")}" aria-haspopup="menu">${SHELF_GLYPH.more}</span>
        <div class="shelf-side-menu" data-shelf-side-menu role="menu" hidden>
          <span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-paste-clip>${p.text("粘贴当前剪贴板")}</span>
          <span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-multi aria-pressed="false">${p.text("多选材料")}</span>
        </div>
        <input data-shelf-file hidden type="file" multiple>
        <ul class="shelf-find" data-shelf-find hidden></ul>
      </header>
      <div class="shelf-side-scroll">
      ${stageFold(p.text("材料"), "materials", model.materials.length, `<ul class="shelf-tree" data-shelf-list="materials">${model.materials.map((item) => renderRow(item, item.item_id === model.selected_id, p)).join("") || emptyLine(p.text("还没有材料"))}</ul>`)}
      ${stageFold(p.text("生成结果"), "results", model.results.length, `<ul class="shelf-tree" data-shelf-list="results">${model.results.map((item) => renderRow(item, item.item_id === model.selected_id, p)).join("") || emptyLine(p.text("还没有生成结果"))}</ul>`)}
      ${stageFold(p.text("剪贴板历史"), "clipboard", model.clipboard.length, `<p class="shelf-clip-hint" data-shelf-clip-hint ${model.clipboard.length ? "" : "hidden"}>${p.text("单击选择，双击复制为当前。⌘V 仍直接上架当前剪贴板。")}</p><ul class="shelf-tree" data-shelf-list="clipboard">${model.clipboard.map((clip) => renderClip(clip, clip.clip_id === model.current_clip_id, clip.clip_id === model.selected_id, p)).join("") || emptyLine(p.text("剪贴板是空的"))}</ul><button class="shelf-clip-more" type="button" data-shelf-clip-more hidden>${p.text("显示全部")}</button>`)}
      </div>
      <footer class="shelf-side-foot"><span data-shelf-foot-left>${p.text("副本工作区")}</span><span>${p.text("⌘V 粘贴当前")}</span></footer>
      ${renderDropOverlay(p)}
    </div>
    <dialog class="mw-dialog mw-dialog--form" data-shelf-material-dialog aria-label="${p.text("保存项目材料")}">
      <form class="mw-form mw-dialog__shell" data-shelf-material-form>
        <header class="mw-form__header"><h2>${p.text("保存到项目材料")}</h2>${renderButton({ label: p.text("关闭"), variant: "ghost", attrs: { "data-shelf-material-close": "" } })}</header>
        <div class="mw-form__body"><p data-shelf-material-destination></p><p>${p.text("保存下面的固定原文，之后可在 Coding 的「＋ 材料」中选择。编辑或移除 Shelf 副本不会改变已保存版本。")}</p><pre class="shelf-material-body" data-shelf-material-body></pre><p role="status" data-shelf-material-status></p></div>
        <footer class="mw-form__footer">${renderButton({ label: p.text("重新读取"), variant: "secondary", attrs: { "data-shelf-material-refresh": "" } })}${renderButton({ label: p.text("保存固定版本"), type: "submit", attrs: { "data-shelf-material-save": "", disabled: true } })}${renderButton({ label: p.text("设为材料输出"), attrs: { "data-shelf-material-output": "", hidden: true } })}</footer>
      </form>
    </dialog>
    <div class="plugin-stage-workspace" data-shelf-stage-workspace hidden>
      <header class="plugin-stage-detail-bar shelf-chrome" data-shelf-chrome hidden>
        <button class="plugin-stage-back" type="button" data-shelf-collapse aria-label="${p.text("返回材料列表")}" title="${p.text("返回材料列表")}">${icon("chevron-right")}</button>
        <span class="shelf-chrome-title" data-shelf-chrome-title></span>
        <span class="shelf-chrome-tag" data-shelf-chrome-tag></span>
        ${renderButton({ label: p.text("保存到项目材料"), variant: "ghost", attrs: { "data-shelf-project-material": "", hidden: true } })}
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-edit hidden>${p.text("编辑副本")}</span>
      </header>
      <div class="shelf-stage" data-shelf-stage>
      <div class="shelf-tools">
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-compare aria-pressed="false">${SHELF_GLYPH.compare}${p.text("对照原文")}</span>
        <span style="flex:1"></span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-copy-file>${SHELF_GLYPH.copy}${p.text("复制文件")}</span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-use-material>${SHELF_GLYPH.download}${p.text("用作材料")}</span>
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
    </div>
    ${renderDropOverlay(p)}
  </section>`;
}

function renderDropOverlay(p: ShelfUiPrimitives): string {
  return `<div class="shelf-drop" data-shelf-drop aria-hidden="true"><div class="shelf-drop-veil"></div><div class="shelf-drop-frame"></div><div class="shelf-drop-card">${SHELF_GLYPH.tray}<b>${p.text("加入材料")}</b><p>${p.text("发给终端请拖到轮盘")}</p></div></div>`;
}

/** DropAgent colours the group's type mark and keeps the label neutral. */
function stageFold(label: string, id: "materials" | "results" | "clipboard", count: number, body: string): string {
  const mark = id === "clipboard"
    ? { glyph: SHELF_GLYPH.clipboard, tone: "ochre" }
    : id === "results"
      ? { glyph: SHELF_GLYPH.markdown, tone: "slate" }
      : { glyph: SHELF_GLYPH.folder, tone: "ochre" };
  return `<details class="goal-collection-fold shelf-group" data-shelf-stage-group="${id}" open>
    <summary>
      <span class="goal-collection-caret" aria-hidden="true">${icon("chevron-down")}</span>
      <span class="goal-collection-mark shelf-group-mark tone-${mark.tone}" aria-hidden="true">${mark.glyph}</span>
      <strong>${label}</strong>
      <small data-shelf-count="${id}">${count}</small>
    </summary>
    ${body}
  </details>`;
}

function emptyLine(text: string): string {
  return `<li class="shelf-empty-line" data-shelf-empty>${text}</li>`;
}

/** DropAgent stamps results H:mm and marks a failed row, both hidden while the row actions show. */
function clockLabel(stamp: string): string {
  const when = new Date(stamp);
  if (Number.isNaN(when.getTime())) return "";
  return `${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}`;
}

/** Keep a file extension visible while the stem yields. URLs stay one run of text. */
function renderShelfName(name: string, escape: (value: unknown) => string): string {
  const match = name.includes("://") ? null : name.match(/^(.+?)(\.[A-Za-z0-9]{1,8})$/);
  if (!match || match[1].length < 2) return `<span class="shelf-name">${escape(name)}</span>`;
  return `<span class="shelf-name"><span class="shelf-name__stem">${escape(match[1])}</span><span class="shelf-name__ext">${escape(match[2])}</span></span>`;
}

function renderRow(item: ShelfItemRecord, selected: boolean, p: ShelfUiPrimitives): string {
  const tone = toneForKind(item.kind, item.group);
  const failed = item.status === "failed";
  const when = item.group === "result" && !failed ? clockLabel(item.created_at) : "";
  return `<li class="shelf-row${selected ? " is-on" : ""}${failed ? " is-failed" : ""}" data-shelf-item="${p.escape(item.item_id)}" data-shelf-kind="${item.kind}" data-shelf-group="${item.group}" data-shelf-name="${p.escape(item.name)}" role="option" aria-label="${p.escape(item.name)}" aria-selected="${selected ? "true" : "false"}" draggable="${failed && !item.relative_path ? "false" : "true"}">
    <span class="shelf-glyph tone-${tone}">${glyphForKind(item.kind)}</span>
    ${renderShelfName(item.name, p.escape)}
    ${when ? `<span class="shelf-when">${when}</span>` : ""}
    ${failed ? `<span class="shelf-status" title="${p.text("失败")}" aria-label="${p.text("失败")}">${SHELF_GLYPH.alert}</span>` : ""}
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
  return `<li class="shelf-row${selected ? " is-on" : ""}" data-shelf-clip="${p.escape(clip.clip_id)}" data-shelf-kind="${kind}" data-shelf-group="clipboard" data-shelf-name="${p.escape(clip.title)}" role="option" aria-label="${p.escape(clip.title)}" aria-selected="${selected ? "true" : "false"}">
    <span class="shelf-glyph tone-${tone}">${glyphForKind(kind)}</span>
    ${renderShelfName(clip.title, p.escape)}
    ${current ? `<span class="shelf-now" data-shelf-current>${p.text("当前")}</span>` : ""}
    <span class="shelf-ops">
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="copy" aria-label="${p.text("复制")}">${SHELF_GLYPH.copy}</span>
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="join" aria-label="${p.text("加入材料")}">${SHELF_GLYPH.download}</span>
      <span class="shelf-op is-danger" role="button" tabindex="0" data-shelf-row-action="delete" aria-label="${p.text("删除记录")}" title="${p.text("删除记录")}">${SHELF_GLYPH.trash}</span>
    </span>
  </li>`;
}
