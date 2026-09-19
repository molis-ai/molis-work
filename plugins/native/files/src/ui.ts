import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import { pathLabel } from "./paths.js";
import { previewMessage, type FilePreview } from "./preview.js";
import type { FileTreeNode } from "./tree.js";

export const FILES_UI_CONTRIBUTION_ID = "io.molis.work.native.files.ui.v1";

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
