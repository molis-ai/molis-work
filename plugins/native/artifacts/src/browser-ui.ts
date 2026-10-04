import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactVersionPath, type ArtifactBrowserView } from "./browser.js";
import { renderArtifactImportDialog, type ArtifactImportUiModel } from "./import-ui.js";

/** A type's display name as its owner declares it (artifact-positioning A4); an undeclared type shows its last segment. */
function artifactTypeLabel(typeId: string, titles: ArtifactBrowserUiModel["typeTitles"], p: ArtifactBrowserUiModel["primitives"]): string {
  const declared = titles?.[typeId];
  if (declared) return p.text(declared);
  return typeId.split(".").filter(Boolean).at(-1) || typeId;
}

export const ARTIFACT_BROWSER_UI_CONTRIBUTION_ID = "io.molis.work.native.artifacts.browser.v1";

export interface ArtifactBrowserUiModel {
  readonly view: ArtifactBrowserView;
  readonly routePrefix: string;
  /** Sanitized business content supplied by Host composition, never raw Artifact HTML. */
  readonly presentation?: { readonly notice?: string; readonly body_html: string; readonly source_href: string; readonly source_label: string; readonly plugin_id: string; readonly item_id: string };
  /** Display names the owners declare for their 成果 types (A4). */
  readonly typeTitles?: Readonly<Record<string, string>>;
  readonly relationship?: "input" | "output";
  /** The plugins that can start new work from the selected version (A4b, 「从这一版继续」), as the host found them declared. */
  readonly continuers?: ReadonlyArray<{ plugin_id: string; plugin_title: string }>;
  /** Who refers to the selected version (A4b, 「被谁引用」), read by the host through `artifacts.links`. */
  readonly links?: { readonly goals: ReadonlyArray<{ goal_id: string; title: string; role: "input" | "deliverable" | "proposed" }>; readonly other: number };
  /** The import dialog's connected services; the directory offers the 成果库's one import entry when present (A3). */
  readonly importForm?: Pick<ArtifactImportUiModel, "connections" | "connectionStatus">;
  readonly primitives: {
    escape(value: string): string;
    text(value: string): string;
    formatDate(value: string): string;
  };
}

function directory({ view, routePrefix, primitives: p, importForm, typeTitles }: ArtifactBrowserUiModel): string {
  // The one import entry (specs/artifact-positioning A3): a dialog in the workbench, never a page of its own.
  const importLink = importForm ? `<header class="plugin-stage-chrome artifact-stage-chrome"><button class="mw-btn mw-btn--ghost tree-create artifact-import-entry" type="button" data-artifact-import-open>${icon("plus")}<span>${p.text("导入")}</span></button>${renderArtifactImportDialog({ ...importForm, routePrefix, primitives: p })}</header>` : "";
  if (!view.versions.length) return `${importLink}<p class="artifact-empty mw-empty">${p.text("还没有成果")}</p>`;
  const groups = new Map<string, Array<(typeof view.versions)[number]>>();
  for (const artifact of view.versions) {
    const list = groups.get(artifact.artifact_type_id);
    if (list) list.push(artifact);
    else groups.set(artifact.artifact_type_id, [artifact]);
  }
  const folds = [...groups.entries()].map(([typeId, versions]) => {
    const attention = versions.some((artifact) => artifact.availability === "unavailable" || artifact.lifecycle_state === "archived");
    const mark = attention ? "alert" : "check";
    const tone = attention ? "attention" : "ready";
    const rows = versions.map((artifact) => {
      const selected = view.selected?.artifact_id === artifact.artifact_id && view.selected.version === artifact.version;
      const title = artifact.title;
      const status = artifact.lifecycle_state === "archived"
        ? p.text("已归档")
        : artifact.availability === "unavailable"
          ? p.text("内容不可用")
          : p.text("可用");
      const statusTone = artifact.lifecycle_state === "archived"
        ? "quiet"
        : artifact.availability === "unavailable"
          ? "blocked"
          : "done";
      return `<article class="feed-stage-item">
        <a class="feed-stage-entry directory-list-row${selected ? " is-selected" : ""}" href="${p.escape(routePrefix + artifactVersionPath(artifact))}" draggable="true" data-frame-asset="artifact" data-frame-asset-id="${p.escape(`${artifact.artifact_id}#${artifact.version}`)}" data-frame-asset-title="${p.escape(title)}" data-frame-asset-caption="${p.escape(`v${artifact.version}`)}">
          <span class="feed-stage-leading"><strong>${p.escape(title)}</strong></span>
          <span class="feed-entry-source">v${artifact.version}</span>
          <span class="mw-status mw-status--${statusTone} mw-status--plain feed-entry-status">${status}</span>
        </a>
      </article>`;
    }).join("");
    return `<details class="goal-collection-fold" data-artifact-type-fold="${p.escape(typeId)}" open>
      <summary>
        <span class="goal-collection-caret" aria-hidden="true">${icon("chevron-down")}</span>
        <span class="goal-collection-mark is-${tone}" aria-hidden="true">${icon(mark)}</span>
        <strong>${p.escape(artifactTypeLabel(typeId, typeTitles, p))}</strong>
        <small>${versions.length}</small>
      </summary>
      <div class="artifact-stage-group-body" role="list">${rows}</div>
    </details>`;
  }).join("");
  return `${importLink}<nav aria-label="${p.text("成果版本")}" class="mw-dir__list artifact-version-list">${folds}</nav>`;
}

function documentPreview(artifact: NonNullable<ArtifactBrowserView["selected"]>, p: ArtifactBrowserUiModel["primitives"], routePrefix: string, ownerPreview = false): string {
  if (artifact.artifact_type_id !== "io.molis.work.document" || artifact.schema_version !== 1
    || artifact.availability !== "available" || artifact.content_kind !== "inline") return "";
  const payload = artifact.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.content !== "string") return "";
  // Every imported version can be taken back as a file; a raster image also shows here (A3, full previews in A4).
  const file = `${routePrefix}/api${artifactVersionPath(artifact)}/file`;
  const original = payload.original_file && typeof payload.original_file === "object" && !Array.isArray(payload.original_file) ? payload.original_file : null;
  const mime = typeof original?.mime === "string" ? original.mime : "";
  const image = /^image\/(?:png|jpeg|gif|webp|avif)$/u.test(mime) ? `<img class="artifact-document-image" src="${p.escape(file)}" alt="${p.escape(artifact.title)}">` : "";
  const actions = `<p class="artifact-document-actions"><a class="mw-btn" href="${p.escape(file)}" download>${p.text(original ? "下载原文件" : "下载正文")}</a></p>`;
  let sourceLink = "";
  if (typeof payload.source_url === "string" && payload.source_url) {
    try {
      const url = new URL(payload.source_url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        sourceLink = `<a href="${p.escape(url.href)}" target="_blank" rel="noopener noreferrer">${p.text("打开来源文档")}</a>`;
      }
    } catch { /* Imported metadata must never become an executable link. */ }
  }
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter((warning): warning is string => typeof warning === "string") : [];
  return `<section class="artifact-document-preview" aria-label="${p.text("文档正文")}">
    ${sourceLink ? `<p class="artifact-document-source">${sourceLink}</p>` : ""}
    ${warnings.length ? `<aside class="artifact-document-warnings"><h2>${p.text("导入说明")}</h2><ul>${warnings.map(warning => `<li>${p.text(warning)}</li>`).join("")}</ul></aside>` : ""}
    ${actions}${ownerPreview ? "" : `${image}${payload.content ? `<h2>${p.text("文档正文")}</h2><div class="artifact-document-body">${p.escape(payload.content)}</div>` : ""}`}
  </section>`;
}

function detail(model: ArtifactBrowserUiModel, embedded: boolean): string {
  const { view, routePrefix, primitives: p } = model;
  const artifact = view.selected;
  if (embedded && !artifact && view.requested) return `<article class="artifact-embed artifact-missing" role="status">
    <h3><a href="${p.escape(routePrefix + artifactVersionPath(view.requested))}">${p.escape(view.requested.artifact_id)} · v${view.requested.version}</a></h3>
    <p>${p.text("关联的版本不可用或不存在。引用仍然保留，不会替换成最新版本。")}</p></article>`;
  if (!artifact) return `<section class="artifact-empty"${view.requested ? ' role="status"' : ""}>
    <h1>${p.text(view.requested ? "找不到这个成果版本" : view.versions.length ? "选择一个结果版本" : "还没有项目成果")}</h1>
    ${!view.requested && !view.versions.length ? `<p>${p.text("在 Pages、问卷、演示稿、数据表里「存为固定版本」，或在这里导入文件，固定下来的版本都在这里。")}</p>` : ""}
    ${view.requested ? `<p>${p.text("它可能属于其他项目，或这个版本尚未发布。请返回列表选择；不会自动替换成最新版本。")}</p><a href="${p.escape(routePrefix + "/artifacts")}">${p.text("返回成果列表")}</a>` : ""}</section>`;
  const href = routePrefix + artifactVersionPath(artifact);
  const title = artifact.title;
  const preview = documentPreview(artifact, p, routePrefix, Boolean(model.presentation));
  const notice = model.presentation && artifact.lifecycle_state !== "archived" ? model.presentation.notice ?? "这是固定下来的一版；原对象之后的修改不会改变它。" : view.compatibility?.reason === "artifact_unavailable"
    ? "这个版本的内容不可用；引用和来源信息仍然保留。"
    : view.compatibility?.reason === "artifact_archived"
      ? "这个版本已归档，保留历史信息，不作为可消费的新结果。"
      : preview
        ? "这是导入时保存的文档版本；原文后续修改不会自动同步。"
        : view.compatibility?.reason === "consumer_missing"
          ? artifact.content_kind === "inline"
            ? "没有兼容插件。当前可查看版本信息和原始 JSON，或导出本地副本。"
            : "没有兼容插件。当前可查看版本信息和内容引用，或导出本地副本。"
          : "这是固定下来的一版；原对象之后的修改不会改变它。";
  const reference = JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version });
  const versionLabel = `v${artifact.version}${model.relationship ? ` · ${p.text(model.relationship === "input" ? "输入" : "交付物")}` : ""}`;
  const heading = embedded
    ? `<header><h3><a href="${p.escape(href)}">${p.escape(title)}</a></h3><span>${versionLabel}</span></header>`
    : `<header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-artifact-collapse aria-label="${p.text("返回成果列表")}" title="${p.text("返回成果列表")}">${icon("chevron-right")}</button><h1>${p.escape(title)}</h1><span>${versionLabel}</span></header>`;
  return `<article class="artifact-detail${embedded ? " artifact-embed" : ""}" data-artifact-id="${p.escape(artifact.artifact_id)}" data-artifact-version="${artifact.version}">
    ${heading}
    ${embedded ? "" : `<div class="artifact-detail-content">`}<p class="artifact-notice">${p.text(embedded && !preview && view.compatibility?.reason === "consumer_missing" ? "没有兼容插件。可打开这个版本查看信息或导出本地副本。" : notice).replace("{version}", String(artifact.version))}</p>
    ${artifact.unavailable_reason ? `<p>${p.escape(artifact.unavailable_reason)}</p>` : ""}
    ${!embedded && model.presentation ? `${model.presentation.source_href ? `<p><a class="mw-btn" href="${p.escape(model.presentation.source_href)}" data-workbench-item-plugin="${p.escape(model.presentation.plugin_id)}" data-workbench-item-id="${p.escape(model.presentation.item_id)}" data-workbench-item-title="${p.escape(title)}">${p.text(model.presentation.source_label)}</a></p>` : ""}<section class="artifact-business-preview mw-prose" data-artifact-business-preview>${model.presentation.body_html}</section>` : ""}
    ${!embedded && model.continuers?.length ? continueActions(model.continuers, artifact, p) : ""}
    ${preview}
    ${!embedded && model.links ? linksSection(model.links, routePrefix, p, artifact) : ""}
    <dl class="artifact-facts">
      <div><dt>${p.text("结果类型")}</dt><dd>${p.escape(artifactTypeLabel(artifact.artifact_type_id, model.typeTitles, p))} · ${p.escape(artifact.artifact_type_id)} · Schema ${artifact.schema_version}</dd></div>
      <div><dt>${p.text("来源插件")}</dt><dd>${p.escape(artifact.producer_plugin_id)} · ${p.escape(artifact.producer_plugin_version)}</dd></div>
      <div><dt>${p.text("范围")}</dt><dd>${p.text(artifact.scope === "personal" ? "个人" : "已共享到 Team Project")}</dd></div>
      <div><dt>${p.text("发布时间")}</dt><dd>${p.escape(p.formatDate(artifact.created_at))}</dd></div>
    </dl>
    ${embedded ? `<a href="${p.escape(href)}">${p.text("查看这个版本")}</a>` : `
      <details class="artifact-raw"><summary>${p.text("引用这个版本")}</summary><label class="artifact-reference-label">${p.text("精确版本引用")}<input readonly value="${p.escape(reference)}" aria-label="${p.text("精确版本引用")}"></label></details>
      ${artifact.content_kind === "inline" && artifact.availability === "available" ? `<details class="artifact-raw"><summary>${p.text("查看原始 JSON（非业务预览）")}</summary><pre>${p.escape(JSON.stringify(artifact.payload, null, 2))}</pre></details>` : artifact.content_ref ? `<section class="artifact-content-reference"><h2>${p.text("内容引用")}</h2><p>${p.text("这里只保留定位信息，不保证当前文件仍对应这个版本；读取和校验由消费插件处理。")}</p><input readonly aria-label="${p.text("内容引用")}" value="${p.escape(artifact.content_ref)}"></section>` : ""}
      <details class="artifact-raw"><summary>${p.text("查看原始元数据")}</summary><pre>${p.escape(JSON.stringify(artifact.metadata, null, 2))}</pre></details>`}
    ${embedded ? "" : `</div>
      <div class="artifact-actions"><a class="artifact-export" href="${p.escape(routePrefix + "/api" + artifactVersionPath(artifact) + "/export")}" download>${p.text("导出这个版本")}</a><span>${p.text("仅下载本地副本，不会发布或共享。")}</span></div>`}
  </article>`;
}

/** 「从这一版继续」: one button per plugin that declares it can continue from this type. */
function continueActions(continuers: NonNullable<ArtifactBrowserUiModel["continuers"]>, artifact: NonNullable<ArtifactBrowserView["selected"]>, p: ArtifactBrowserUiModel["primitives"]): string {
  const reference = p.escape(JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version }));
  return `<p class="artifact-continue-actions">${continuers.map(item => `<button class="mw-btn" type="button" data-artifact-continue="${p.escape(item.plugin_id)}" data-artifact-reference="${reference}">${p.text(`在 ${item.plugin_title} 继续`)}</button>`).join("")}</p>`;
}

const LINK_ROLES = { input: "输入", deliverable: "交付物", proposed: "提议的交付物" } as const;
/** 「被谁引用」: the Goals that use this version, each opening in the workbench, the Assistant's works, and how many other links there are. */
function linksSection(links: NonNullable<ArtifactBrowserUiModel["links"]>, routePrefix: string, p: ArtifactBrowserUiModel["primitives"], artifact: NonNullable<ArtifactBrowserView["selected"]>): string {
  const goals = links.goals.map(link => `<li><a href="${p.escape(`${routePrefix}/goals/${encodeURIComponent(link.goal_id)}`)}">${p.escape(link.title)}</a><span>${p.text(LINK_ROLES[link.role])}</span></li>`).join("");
  const other = links.other ? `<p class="artifact-links-other">${p.text("另有其他引用")} · ${links.other}</p>` : "";
  // 「作为 Goal 的输入」 (A4b): only a version people can still use is offered.
  const usable = artifact.availability === "available" && artifact.lifecycle_state !== "archived";
  const reference = p.escape(JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version }));
  const asInput = usable ? `<details class="artifact-goal-input" data-artifact-goal-input><summary>${p.text("作为 Goal 的输入")}</summary><form data-artifact-goal-input-form data-artifact-reference="${reference}"><select class="mw-select" name="goal" required aria-label="${p.text("选择目标")}"><option value="">${p.text("正在读取目标…")}</option></select><button class="mw-btn" type="submit">${p.text("记为输入")}</button><span data-artifact-goal-input-status role="status"></span></form></details>` : "";
  // Assistant works that started from this version, took it as material or produced it: the Assistant keeps these in its
  // own store, so the 成果 client reads them once the detail shows. A version is named by its subject or, from a tab, its path.
  const subjects = p.escape(JSON.stringify([artifactSubjectId(artifact), artifactVersionPath(artifact)]));
  const works = `<div class="artifact-links-works" data-artifact-works="${subjects}" hidden><h3>${p.text("助理工作")}</h3><ul></ul></div>`;
  return `<section class="artifact-links" data-artifact-links><h2>${p.text("被谁引用")}</h2>${goals ? `<ul>${goals}</ul>` : `<p>${p.text("还没有目标引用这一版。")}</p>`}${works}${other}${asInput}</section>`;
}

export function renderArtifactFrameBlock({ view, routePrefix, primitives: p }: ArtifactBrowserUiModel): string {
  const artifact = view.selected;
  if (!artifact) {
    return `<article class="frame-reading" data-frame-reading="artifact"><p>${p.text(view.requested ? "找不到这个成果版本" : view.versions.length ? "选择一个结果版本" : "还没有项目成果")}</p></article>`;
  }
  return `<article class="frame-reading" data-frame-reading="artifact" data-artifact-id="${p.escape(artifact.artifact_id)}" data-artifact-version="${artifact.version}">
    <p class="frame-reading-meta">v${artifact.version} · ${p.escape(artifact.artifact_type_id)}</p>
    ${documentPreview(artifact, p, routePrefix)}
    <div class="artifact-facts">
      <p>${p.escape(artifact.artifact_type_id)} · Schema ${artifact.schema_version} · ${p.escape(artifact.producer_plugin_id)} ${p.escape(artifact.producer_plugin_version)} · ${p.escape(p.formatDate(artifact.created_at))}</p>
    </div>
  </article>`;
}

export const artifactBrowserUiContribution: UiContribution<ArtifactBrowserUiModel> = {
  descriptor: {
    contribution_id: ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.artifacts",
    kind: "primary-page", navigation_id: "artifacts", label: "成果", slots: [],
    surfaces: [
      { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
      { surface_id: "detail", target_slot_id: "workbench.main", format: "declarative-html" },
      { surface_id: "embed", target_slot_id: "workbench.main", format: "declarative-html" },
      { surface_id: "frame-block", target_slot_id: "workbench.main", format: "declarative-html" },
    ],
  },
  render({ surface, model }) {
    switch (surface) {
      case "directory": return directory(model);
      case "detail": return detail(model, false);
      case "embed": return detail(model, true);
      case "frame-block": return renderArtifactFrameBlock(model);
      default: throw new Error(`成果 UI surface ${surface} 不存在`);
    }
  },
};
