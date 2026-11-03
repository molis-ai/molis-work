import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  ShelfClipboardRecord,
  ShelfItemKind,
  ShelfItemRecord,
} from "@molis-ai/molis-work-module-shelf/contract";
import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SHELF_GLYPH, glyphForKind, toneForKind } from "./glyphs.js";

export const SHELF_UI_CONTRIBUTION_ID = "io.molis.work.native.shelf.ui.v1";

/** Shelf has one surface: its tab in the side panel (specs/side-shelf §3.2). It never opens in the work area. */
export type ShelfUiSurface = "side";

export interface ShelfUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

/** What the side panel hands every tab; the rows arrive from the client, which reads the shelf once it starts. */
export interface ShelfUiModel {
  readonly primitives: ShelfUiPrimitives;
}

export interface ShelfListModel extends ShelfUiModel {
  readonly materials: readonly ShelfItemRecord[];
  readonly results: readonly ShelfItemRecord[];
  readonly clipboard: readonly ShelfClipboardRecord[];
  readonly selected_id: string | null;
  readonly current_clip_id?: string | null;
}

export const shelfUiDescriptor: UiContributionDeclaration = {
  contribution_id: SHELF_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "shelf",
  label: "Shelf",
  surfaces: [{ surface_id: "side", target_slot_id: "workbench.side", format: "declarative-html" }],
  slots: [],
};

export const shelfUiContribution: UiContribution<ShelfUiModel> = {
  descriptor: shelfUiDescriptor,
  render(request: UiRenderRequest<ShelfUiModel>): string {
    if ((request.surface as ShelfUiSurface) !== "side") throw new Error(`Shelf UI surface ${(request as UiRenderRequest).surface} 不存在`);
    return renderShelfWorkbench({ materials: [], results: [], clipboard: [], selected_id: null, primitives: request.model.primitives });
  },
};

export function renderShelfWorkbench(model: ShelfListModel): string {
  const { primitives: p } = model;
  return `<section data-work-surface="shelf" data-work-surface-label="Shelf" hidden data-shelf="workbench" data-shelf-stage-shell data-expanded="false">
    <div class="plugin-stage-list" data-shelf="directory">
      <header class="shelf-side-head shelf-stage-chrome">
        <label class="shelf-search shelf-stage-search">${SHELF_GLYPH.search}<input type="search" data-shelf-search placeholder="${p.text("shelf.ui.search-materials")}" aria-label="${p.text("shelf.ui.search-materials")}" autocomplete="off"></label>
        <span class="shelf-side-op shelf-side-op--add" role="button" tabindex="0" data-shelf-pick aria-label="${p.text("shelf.ui.add-files")}" title="${p.text("shelf.ui.add-files")}">${SHELF_GLYPH.plus}<b>${p.text("shelf.ui.add-files")}</b></span>
        <span class="shelf-side-op" role="button" tabindex="0" data-shelf-side-more aria-label="${p.text("shelf.ui.more")}" title="${p.text("shelf.ui.more")}" aria-haspopup="menu">${SHELF_GLYPH.more}</span>
        <div class="shelf-side-menu" data-shelf-side-menu role="menu" hidden>
          <span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-receive-open>${p.text("shelf.ui.receive-project-results")}</span>
          <span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-paste-clip>${p.text("shelf.ui.paste-current-clipboard")}</span>
          <span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-multi aria-pressed="false">${p.text("shelf.rows.select-multiple-files")}</span>
        </div>
        <input data-shelf-file hidden type="file" multiple>
        <ul class="shelf-find" data-shelf-find hidden></ul>
      </header>
      <div class="shelf-side-scroll">
      ${stageFold(p.text("shelf.preview.material"), "materials", model.materials.length, `<ul class="shelf-tree" data-shelf-list="materials">${model.materials.map((item) => renderRow(item, item.item_id === model.selected_id, p)).join("") || `<li class="shelf-empty-line shelf-drop-line" data-shelf-empty role="button" tabindex="0" data-shelf-pick>${SHELF_GLYPH.tray}<span>${p.text("shelf.ui.drop-files-here-or-press")}</span></li>`}</ul>`)}
      ${stageFold(p.text("shelf.ui.results"), "results", model.results.length, `<ul class="shelf-tree" data-shelf-list="results">${model.results.map((item) => renderRow(item, item.item_id === model.selected_id, p)).join("") || emptyLine(p.text("shelf.rows.no-results-yet"))}</ul>`)}
      ${stageFold(p.text("shelf.ui.clipboard-history"), "clipboard", model.clipboard.length, `<p class="shelf-clip-hint" data-shelf-clip-hint ${model.clipboard.length ? "" : "hidden"}>${p.text("shelf.ui.click-to-select-double-make")}</p><ul class="shelf-tree" data-shelf-list="clipboard">${model.clipboard.map((clip) => renderClip(clip, clip.clip_id === model.current_clip_id, clip.clip_id === model.selected_id, p)).join("") || emptyLine(p.text("shelf.rows.clipboard-is-empty"))}</ul><button class="shelf-clip-more" type="button" data-shelf-clip-more hidden>${p.text("shelf.rows.show-all")}</button>`)}
      </div>
      <footer class="shelf-side-foot"><span data-shelf-foot-left>${p.text("shelf.rows.working-copies")}</span><span>${p.text("shelf.ui.v-pastes-current")}</span></footer>
      ${renderDropOverlay(p)}
    </div>
    <dialog class="mw-dialog mw-dialog--form" data-shelf-result-dialog aria-label="${p.text("shelf.ui.receive-project-results")}">
      <form class="mw-form mw-dialog__shell" data-shelf-result-form>
        <header class="mw-form__header"><h2>${p.text("shelf.ui.receive-project-results")}</h2>${renderButton({ label: p.text("shelf.ui.close"), variant: "ghost", attrs: { "data-shelf-result-close": "" } })}</header>
        <div class="mw-form__body"><label class="mw-form__field">${p.text("shelf.ui.choose-a-saved-result")}<select class="mw-select" data-shelf-result-choice aria-label="${p.text("shelf.ui.choose-a-saved-result")}"></select></label><pre class="shelf-material-body" data-shelf-result-body></pre><p role="status" data-shelf-result-status></p></div>
        <footer class="mw-form__footer">${renderButton({ label: p.text("shelf.ui.refresh-results"), variant: "secondary", attrs: { "data-shelf-result-refresh": "" } })}${renderButton({ label: p.text("shelf.ui.receive-and-open-copy"), type: "submit", attrs: { "data-shelf-result-receive": "", disabled: true } })}</footer>
      </form>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form" data-shelf-material-dialog aria-label="${p.text("shelf.ui.save-to-project-knowledge")}">
      <form class="mw-form mw-dialog__shell" data-shelf-material-form>
        <header class="mw-form__header"><h2>${p.text("shelf.ui.save-to-project-knowledge")}</h2>${renderButton({ label: p.text("shelf.ui.close"), variant: "ghost", attrs: { "data-shelf-material-close": "" } })}</header>
        <div class="mw-form__body"><p data-shelf-material-destination></p><p>${p.text("shelf.ui.save-a-copy-of-this")}</p><pre class="shelf-material-body" data-shelf-material-body></pre><p role="status" data-shelf-material-status></p></div>
        <footer class="mw-form__footer">${renderButton({ label: p.text("shelf.ui.reload"), variant: "secondary", attrs: { "data-shelf-material-refresh": "" } })}${renderButton({ label: p.text("shelf.ui.save-to-project-knowledge"), type: "submit", attrs: { "data-shelf-material-save": "", disabled: true } })}</footer>
      </form>
    </dialog>
    <div class="plugin-stage-workspace" data-shelf-stage-workspace hidden>
      <header class="plugin-stage-detail-bar shelf-chrome" data-shelf-chrome hidden>
        <button class="plugin-stage-back" type="button" data-shelf-collapse aria-label="${p.text("shelf.ui.back-to-material-list")}" title="${p.text("shelf.ui.back-to-material-list")}">${icon("chevron-right")}</button>
        <span class="shelf-chrome-title" data-shelf-chrome-title></span>
        <span class="shelf-chrome-tag" data-shelf-chrome-tag></span>
        <span data-placement-slot data-placement-scope="home" data-placement-saved="off"></span>
        ${renderButton({ label: p.text("shelf.ui.use-in-this-project"), variant: "ghost", attrs: { "data-shelf-use-in-project": "", hidden: true, title: p.text("shelf.ui.the-project-home-lists-it") } })}
        ${renderButton({ label: p.text("shelf.ui.save-to-project-knowledge"), variant: "ghost", attrs: { "data-shelf-project-material": "", hidden: true, title: p.text("shelf.ui.save-an-unchanging-copy-to") } })}
        <a class="mw-btn mw-btn--ghost" data-shelf-original-artifact hidden>${p.text("shelf.ui.view-original-saved-result")}</a>
        <span class="shelf-chrome-tag" data-shelf-origin-gone hidden>${p.text("shelf.preview.origin-project-deleted")}</span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-edit hidden>${p.text("shelf.preview.edit-copy")}</span>
      </header>
      <div class="shelf-stage" data-shelf-stage>
      <div class="shelf-tools">
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-compare aria-pressed="false">${SHELF_GLYPH.compare}${p.text("shelf.ui.compare-original")}</span>
        <span style="flex:1"></span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-copy-file>${SHELF_GLYPH.copy}${p.text("shelf.preview.copy-file")}</span>
        <span class="shelf-paper" role="button" tabindex="0" data-shelf-use-material>${SHELF_GLYPH.download}${p.text("shelf.bar.use-as-material")}</span>
      </div>
      <div class="shelf-preview" data-shelf-preview></div>
      <div class="shelf-tty" data-shelf-tty>
        <div class="shelf-tty-bar"><span class="tone-plum">${p.text("shelf.bar.conversation")}</span> · <span data-shelf-tty-actor>${p.text("shelf.ui.sending-to-the-terminal-is")}</span><span style="margin-left:auto"><span class="shelf-paper quiet" role="button" tabindex="0" data-shelf-fold-talk>${p.text("shelf.ui.collapse-all")}</span></span></div>
        <div class="shelf-tty-screen" data-shelf-tty-screen></div>
        <div class="shelf-tty-in"><input data-shelf-tty-input placeholder="${p.text("shelf.ui.send-to-the-current-terminal")}"></div>
      </div>
      <div class="shelf-drawer" data-shelf-drawer>
        <p class="shelf-confirm-head">
          <span class="shelf-confirm-title" data-shelf-confirm-title>${p.text("shelf.confirm.extract-pdf-text")}</span>
          <span class="shelf-confirm-count" data-shelf-confirm-count></span>
        </p>
        <p class="shelf-confirm-out" data-shelf-confirm-out>${p.text("shelf.ui.creates-pdf-md-your-original")}</p>
        <div class="shelf-choice" data-shelf-choice hidden>
          <span class="shelf-choice-label" data-shelf-choice-label></span>
          <span class="shelf-seg" role="radiogroup" data-shelf-seg><span class="shelf-seg-plate" data-shelf-seg-plate aria-hidden="true"></span></span>
          <span class="shelf-choice-hint" data-shelf-choice-hint></span>
        </div>
        <dl class="shelf-facts">
          <div class="shelf-fact"><dt>${p.text("shelf.ui.read")}</dt><dd data-shelf-fact="read">${p.text("shelf.ui.copies-of-1-material")}</dd></div>
          <div class="shelf-fact"><dt>${p.text("shelf.ui.write")}</dt><dd data-shelf-fact="write">${p.text("shelf.ui.job-folder-only")}</dd></div>
          <div class="shelf-fact"><dt>${p.text("shelf.ui.network")}</dt><dd data-shelf-fact="network">${p.text("shelf.confirm.off")}</dd></div>
          <div class="shelf-fact"><dt>${p.text("shelf.ui.isolation")}</dt><dd data-shelf-fact="isolation">${p.text("shelf.confirm.on-device-extraction-not-sent")}</dd></div>
        </dl>
        <p class="shelf-actor" data-shelf-actor>${p.text("shelf.confirm.on-device-extraction-not-sent-2")}</p>
        <div class="shelf-drawer-actions">
          <span class="shelf-primary" role="button" tabindex="0" data-shelf-run>${p.text("shelf.confirm.start-extraction")}</span>
          <span class="shelf-paper" role="button" tabindex="0" data-shelf-back>${p.text("shelf.confirm.back")}</span>
          <span class="shelf-paper" role="button" tabindex="0" data-shelf-cancel hidden>${p.text("shelf.composer.cancel")}</span>
        </div>
        <p class="shelf-run-line" data-shelf-run-line hidden>${p.text("shelf.run.extracting-selectable-text-from-the")}</p>
      </div>
      <div class="shelf-bar-wrap">
        <p class="shelf-bar-hint" data-shelf-bar-hint hidden>${p.text("shelf.ui.configure-an-ai-model-in")}</p>
        <div class="shelf-bar" data-shelf-bar></div>
      </div>
      ${renderDropOverlay(p)}
      </div>
    </div>
    ${renderDropOverlay(p)}
  </section>`;
}

function renderDropOverlay(p: ShelfUiPrimitives): string {
  return `<div class="shelf-drop" data-shelf-drop aria-hidden="true"><div class="shelf-drop-veil"></div><div class="shelf-drop-frame"></div><div class="shelf-drop-card">${SHELF_GLYPH.tray}<b>${p.text("shelf.bar.add-to-materials")}</b><p>${p.text("shelf.ui.to-send-a-terminal-drop")}</p></div></div>`;
}

/** DropAgent colours the group's type mark and keeps the label neutral. */
export function stageFold(label: string, id: "materials" | "results" | "clipboard", count: number, body: string): string {
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

export function renderRow(item: ShelfItemRecord, selected: boolean, p: ShelfUiPrimitives): string {
  const tone = toneForKind(item.kind, item.group);
  const failed = item.status === "failed";
  const when = item.group === "result" && !failed ? clockLabel(item.created_at) : "";
  return `<li class="shelf-row${selected ? " is-on" : ""}${failed ? " is-failed" : ""}" data-shelf-item="${p.escape(item.item_id)}" data-shelf-kind="${item.kind}" data-shelf-group="${item.group}" data-shelf-name="${p.escape(item.name)}" role="option" aria-label="${p.escape(item.name)}" aria-selected="${selected ? "true" : "false"}" draggable="${failed && !item.relative_path ? "false" : "true"}">
    <span class="shelf-glyph tone-${tone}">${glyphForKind(item.kind)}</span>
    ${renderShelfName(item.name, p.escape)}
    ${when ? `<span class="shelf-when">${when}</span>` : ""}
    ${failed ? `<span class="shelf-status" title="${p.text("shelf.rows.failed")}" aria-label="${p.text("shelf.rows.failed")}">${SHELF_GLYPH.alert}</span>` : ""}
    <span class="shelf-ops">
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="copy" aria-label="${p.text("shelf.rows.copy")}">${SHELF_GLYPH.copy}</span>
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="hide" aria-label="${p.text("shelf.rows.hide-from-list-keep-the")}" title="${p.text("shelf.rows.hide-from-list-keep-the")}">${SHELF_GLYPH.hide}</span>
      <span class="shelf-op is-danger" role="button" tabindex="0" data-shelf-row-action="delete" aria-label="${p.text("shelf.rows.delete-copy")}" title="${p.text("shelf.rows.delete-copy")}">${SHELF_GLYPH.trash}</span>
    </span>
  </li>`;
}

function renderClip(clip: ShelfClipboardRecord, current: boolean, selected: boolean, p: ShelfUiPrimitives): string {
  const kind: ShelfItemKind = clip.kind === "url" ? "url" : "text";
  const tone = toneForKind(kind, "clipboard");
  return `<li class="shelf-row${selected ? " is-on" : ""}" data-shelf-clip="${p.escape(clip.clip_id)}" data-shelf-kind="${kind}" data-shelf-group="clipboard" data-shelf-name="${p.escape(clip.title)}" role="option" aria-label="${p.escape(clip.title)}" aria-selected="${selected ? "true" : "false"}">
    <span class="shelf-glyph tone-${tone}">${glyphForKind(kind)}</span>
    ${renderShelfName(clip.title, p.escape)}
    ${current ? `<span class="shelf-now" data-shelf-current>${p.text("shelf.rows.current")}</span>` : ""}
    <span class="shelf-ops">
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="copy" aria-label="${p.text("shelf.rows.copy")}">${SHELF_GLYPH.copy}</span>
      <span class="shelf-op" role="button" tabindex="0" data-shelf-row-action="join" aria-label="${p.text("shelf.bar.add-to-materials")}">${SHELF_GLYPH.download}</span>
      <span class="shelf-op is-danger" role="button" tabindex="0" data-shelf-row-action="delete" aria-label="${p.text("shelf.rows.delete-entry")}" title="${p.text("shelf.rows.delete-entry")}">${SHELF_GLYPH.trash}</span>
    </span>
  </li>`;
}
