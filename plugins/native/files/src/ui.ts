import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import { pathLabel } from "./paths.js";
import { previewMessage, type FilePreview } from "./preview.js";
import type { FileTreeNode } from "./tree.js";

export const FILES_UI_CONTRIBUTION_ID = "io.molis.work.native.files.ui.v1";

/** Host mounts these fragments in the existing directory and result slots. */
export function renderFilesBrowserDirectory(): string {
  return `<section data-files-browser hidden class="files-browser">
    <label class="mw-field">浏览工作区<select class="mw-select" data-files-workspace aria-label="文件浏览工作区"></select></label>
    <p class="files-notice">这里只切换文件浏览，不改变当前编码任务的工作区。</p>
    <button class="mw-btn" type="button" data-files-refresh>刷新文件</button>
    <p data-files-status role="status"></p><div data-files-tree></div>
  </section>`;
}

export function renderFilesBrowserResult(): string {
  return `<section data-files-results hidden class="files-results" aria-label="文件阅读与快照">
    <header><h3 data-files-title>选择一个文件</h3><button class="mw-btn" type="button" data-files-close>返回执行结果</button></header>
    <p data-files-notice role="status">从左侧文件目录选择要读取的文件。</p>
    <textarea readonly class="files-preview mw-input" data-files-text aria-label="文件正文（只读，可选择片段）" spellcheck="false" hidden></textarea>
    <div class="files-actions"><button class="mw-btn" type="button" data-files-copy disabled>复制全文</button>
      <button class="mw-btn" type="button" data-files-capture="before" disabled>固定为对比前</button>
      <button class="mw-btn" type="button" data-files-capture="after" disabled>固定为对比后</button>
      <button class="mw-btn" type="button" data-files-capture="selection" disabled>保存选区</button></div>
    <p data-files-capture-status role="status"></p>
    <details><summary>对比前快照的文本统计</summary><div data-files-stats></div></details>
    <details open><summary>两份固定快照的差异</summary><p>固定后不会随磁盘文件改变；再次固定才更新这一侧。</p><div data-files-diff></div></details>
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

export const filesUiDescriptor: UiContributionDescriptor = {
  contribution_id: FILES_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.files",
  kind: "primary-page",
  navigation_id: "files",
  label: "Files",
  surfaces: [
    { surface_id: "tree", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "reader", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const filesUiContribution: UiContribution<FilesUiModel> = {
  descriptor: filesUiDescriptor,
  render(request: UiRenderRequest<FilesUiModel>): string {
    return request.surface === "reader" ? renderFilesReader(request.model) : renderFilesTree(request.model);
  },
};

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
