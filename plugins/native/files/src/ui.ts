import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import { renderCompanionBrowserStage, type CompanionStageModel } from "./companion-stage.js";
import { pathLabel } from "./paths.js";
import { previewMessage, type FilePreview } from "./preview.js";
import type { FileTreeNode } from "./tree.js";

export const FILES_UI_CONTRIBUTION_ID = "io.molis.work.native.files.ui.v1";

/** Host mounts these fragments in the existing directory and result slots, worded through its translator. */
export function renderFilesBrowserDirectory(text: (key: string) => string): string {
  return `<section data-files-browser hidden class="files-browser mw-dir">
    <p class="mw-field__label">${text("files.directory.label")}</p>
    <p class="files-notice">${text("files.directory.help")}</p>
    <div class="mw-toolbar files-directory-toolbar"><span class="mw-dir__label">${text("files.directory.title")}</span><button class="mw-btn mw-btn--ghost" type="button" data-files-refresh><span class="mw-spinner" hidden></span><span>${text("files.directory.refresh")}</span></button></div>
    <p data-files-status role="status"></p><div class="mw-dir__list" data-files-tree></div>
  </section>`;
}

export function renderFilesBrowserResult(text: (key: string) => string): string {
  return `<section data-files-results hidden class="files-results mw-frame" data-slot="frame" aria-label="${text("files.reader.label")}">
    <header class="files-reader-head mw-frame__header"><button class="mw-btn mw-btn--ghost" type="button" data-files-close>${text("files.reader.back")}</button><div class="mw-frame__heading"><h2 data-files-title>${text("files.reader.choose")}</h2><p>${text("files.reader.read-only")}</p></div><div class="mw-group"><button class="mw-btn mw-btn--ghost" type="button" data-files-reload disabled aria-label="${text("files.reader.reload-label")}">${text("files.reader.reload")}</button><button class="mw-btn mw-btn--ghost" type="button" data-files-copy disabled>${text("files.reader.copy")}</button></div></header>
    <div class="files-reader-body mw-scroll mw-frame__panel"><p data-files-notice role="status">${text("files.reader.pick")}</p>
    <textarea readonly class="files-preview mw-textarea" data-files-text aria-label="${text("files.reader.text-label")}" spellcheck="false" hidden></textarea>
    <section class="files-snapshots" aria-label="${text("files.snapshot.title")}"><div class="files-snapshot-heading"><h4>${text("files.snapshot.title")}</h4><span data-files-selection-hint>${text("files.snapshot.select-hint")}</span></div>
    <div class="files-actions"><div class="mw-group" aria-label="${text("files.snapshot.sides")}"><button class="mw-btn mw-btn--secondary" type="button" data-files-capture="before" disabled>${text("files.snapshot.before")}</button><button class="mw-btn mw-btn--secondary" type="button" data-files-capture="after" disabled>${text("files.snapshot.after")}</button></div><button class="mw-btn mw-btn--ghost" type="button" data-files-capture="selection" disabled>${text("files.snapshot.selection")}</button></div>
    <p data-files-capture-status role="status"></p></section>
    <details class="mw-collapsible"><summary>${text("files.snapshot.stats")}</summary><div data-files-stats></div></details>
    <details class="mw-collapsible" open><summary>${text("files.snapshot.diff")}</summary><p>${text("files.snapshot.diff-help")}</p><div data-files-diff></div></details></div>
  </section>`;
}

export interface FilesUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
}

export interface FilesUiModel {
  readonly route_prefix: string;
  readonly workspace_name: string | null;
  readonly nodes: readonly FileTreeNode[];
  readonly preview: FilePreview;
  /** True when the root listing stopped before the directory ended. */
  readonly truncated: boolean;
  readonly primitives: FilesUiPrimitives;
}

export const filesUiDescriptor: UiContributionDeclaration = {
  contribution_id: FILES_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "files",
  label: "Files",
  surfaces: [
    { surface_id: "tree", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "reader", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    // The browser the Coding page embeds (`ui.embedded_plugins`): the slots are the ones that page opens, by their ids.
    { surface_id: "browser-directory", target_slot_id: "coding.companion-directory", format: "declarative-html" },
    { surface_id: "browser-result", target_slot_id: "coding.companion-result", format: "declarative-html" },
  ],
  slots: [],
};

export const filesUiContribution: UiContribution<FilesUiModel | CompanionStageModel> = {
  descriptor: filesUiDescriptor,
  render(request: UiRenderRequest<FilesUiModel | CompanionStageModel>): string {
    const stage = request.model as CompanionStageModel;
    switch (request.surface) {
      case "workbench": return renderFilesStage(stage);
      case "tree": return "nodes" in request.model ? renderFilesTree(request.model) : renderFilesBrowserDirectory(stage.primitives.text);
      case "browser-directory": return renderFilesBrowserDirectory(stage.primitives.text);
      case "browser-result": return renderFilesBrowserResult(stage.primitives.text);
      case "reader": return renderFilesReader(request.model as FilesUiModel);
      default: return renderFilesTree(request.model as FilesUiModel);
    }
  },
};

/** Files' stage in the project page: its browser beside a note while no file is open. */
export function renderFilesStage(model: CompanionStageModel): string {
  const { text } = model.primitives;
  return renderCompanionBrowserStage({ surface: "files", label: "Files", icon: "file", route_prefix: model.route_prefix, manage: text("files.stage.manage"),
    empty: { title: text("files.stage.empty-title"), body: text("files.stage.empty-body") }, directory: renderFilesBrowserDirectory(text), result: renderFilesBrowserResult(text) });
}

export function renderFilesTree(model: FilesUiModel): string {
  const { escape } = model.primitives;
  if (model.workspace_name === null) {
    return `<section class="files-tree" data-phase="waiting"><p class="files-empty">`
      + `这个项目还没有绑定工作目录</p></section>`;
  }
  const truncated = model.truncated
    ? `<p class="files-truncated">目录太大，只列出了一部分</p>`
    : "";
  return `<section class="files-tree" data-phase="ready" data-route="${escape(model.route_prefix)}">`
    + `<h2 class="files-root">${escape(model.workspace_name)}</h2>`
    + renderNodes(model.nodes, model.primitives)
    + `${truncated}</section>`;
}

function renderNodes(nodes: readonly FileTreeNode[], primitives: FilesUiPrimitives): string {
  if (nodes.length === 0) return `<p class="files-empty">这个目录是空的</p>`;
  const { escape, icon } = primitives;
  const items = nodes.map((node) => {
    const label = `${icon(node.kind === "directory" ? (node.expanded ? "folder-open" : "folder") : "file")}`
      + `<span class="files-name">${escape(node.name)}</span>`;
    const state = node.error !== undefined
      ? `<span class="files-error">${escape(node.error)}</span>`
      : node.loading
        ? `<span class="files-loading">读取中…</span>`
        : node.truncated
          ? `<span class="files-truncated">只列出了一部分</span>`
          : "";
    const children = node.children === undefined ? "" : renderNodes(node.children, primitives);
    return `<li data-kind="${escape(node.kind)}" data-path="${escape(pathLabel(node.path))}"`
      + `${node.selected ? ` data-selected="true"` : ""}${node.expanded ? ` data-expanded="true"` : ""}>`
      + `<button type="button" data-action="files.open" data-path="${escape(pathLabel(node.path))}">`
      + `${label}</button>${state}${children}</li>`;
  }).join("");
  return `<ul class="files-nodes">${items}</ul>`;
}

/**
 * The reader.
 *
 * Text is escaped and placed as a text node; Files never renders file contents
 * as markup. A file that happens to contain HTML is a file, not a fragment of
 * this application's DOM.
 */
export function renderFilesReader(model: FilesUiModel): string {
  const { escape } = model.primitives;
  const preview = model.preview;
  if (preview.status === "text") {
    return `<section class="files-reader" data-status="text" data-path="${escape(pathLabel(preview.path))}">`
      + `<pre class="files-text">${escape(preview.text)}</pre></section>`;
  }
  const path = preview.status === "none" ? "" : ` data-path="${escape(pathLabel(preview.path))}"`;
  return `<section class="files-reader" data-status="${escape(preview.status)}"${path}>`
    + `<p class="files-notice">${escape(previewMessage(preview))}</p></section>`;
}
