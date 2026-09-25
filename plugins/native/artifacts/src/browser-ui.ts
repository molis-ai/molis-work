import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";
import { artifactDisplayTitle, artifactVersionPath, type ArtifactBrowserView } from "./browser.js";

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  "coding.changeset.v1": "Coding 固定变更",
  "coding.report.v1": "Coding 执行报告",
  "io.molis.work.goal.delivery": "Goal 交付",
  "io.molis.work.feed.capture": "Feed 捕获",
  "io.molis.work.document": "导入文档",
};

function artifactTypeFoldLabel(typeId: string, p: ArtifactBrowserUiModel["primitives"]): string {
  const known = ARTIFACT_TYPE_LABELS[typeId];
  if (known) return p.text(known);
  const last = typeId.split(".").filter(Boolean).at(-1);
  return last || typeId;
}

export const ARTIFACT_BROWSER_UI_CONTRIBUTION_ID = "io.molis.work.native.artifacts.browser.v1";

export interface ArtifactBrowserUiModel {
  readonly view: ArtifactBrowserView;
  readonly routePrefix: string;
  /** Sanitized business content supplied by Host composition, never raw Artifact HTML. */
  readonly presentation?: { readonly notice?: string; readonly body_html: string; readonly source_href: string; readonly source_label: string; readonly plugin_id: string; readonly item_id: string };
  readonly relationship?: "input" | "output";
  readonly primitives: {
    escape(value: string): string;
    text(value: string): string;
    formatDate(value: string): string;
  };
}

function directory({ view, routePrefix, primitives: p }: ArtifactBrowserUiModel): string {
  // An explicit target keeps the Workbench's exact-version fragment navigation from intercepting this full page.
  const importLink = `<header class="plugin-stage-chrome artifact-stage-chrome"><a class="mw-btn mw-btn--ghost tree-create artifact-import-entry" href="${p.escape(routePrefix + "/artifacts/import")}" target="_self">${icon("plus")}<span>${p.text("导入文档")}</span></a></header>`;
  if (!view.versions.length) return `${importLink}<p class="artifact-empty mw-empty">${p.text("还没有 Artifact")}</p>`;
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
      const title = artifactDisplayTitle(artifact);
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
        <strong>${p.escape(artifactTypeFoldLabel(typeId, p))}</strong>
        <small>${versions.length}</small>
      </summary>
      <div class="artifact-stage-group-body" role="list">${rows}</div>
    </details>`;
  }).join("");
  return `${importLink}<nav aria-label="${p.text("Artifact 版本")}" class="mw-dir__list artifact-version-list">${folds}</nav>`;
}

function documentPreview(artifact: NonNullable<ArtifactBrowserView["selected"]>, p: ArtifactBrowserUiModel["primitives"]): string {
  if (artifact.artifact_type_id !== "io.molis.work.document" || artifact.schema_version !== 1
    || artifact.availability !== "available" || artifact.content_kind !== "inline") return "";
  const payload = artifact.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.content !== "string") return "";
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
    <h2>${p.text("文档正文")}</h2><div class="artifact-document-body">${p.escape(payload.content)}</div>
  </section>`;
}

function detail(model: ArtifactBrowserUiModel, embedded: boolean): string {
  const { view, routePrefix, primitives: p } = model;
  const artifact = view.selected;
  if (embedded && !artifact && view.requested) return `<article class="artifact-embed artifact-missing" role="status">
    <h3><a href="${p.escape(routePrefix + artifactVersionPath(view.requested))}">${p.escape(view.requested.artifact_id)} · v${view.requested.version}</a></h3>
    <p>${p.text("关联的版本不可用或不存在。引用仍然保留，不会替换成最新版本。")}</p></article>`;
  if (!artifact) return `<section class="artifact-empty"${view.requested ? ' role="status"' : ""}>
    <h1>${p.text(view.requested ? "找不到这个 Artifact 版本" : view.versions.length ? "选择一个结果版本" : "还没有项目成果")}</h1>
    ${!view.requested && !view.versions.length ? `<p>${p.text("项目成果与导入的文档会保存在这里。可以先导入文档，或推进 Goal 后提交成果。")}</p>` : ""}
    ${view.requested ? `<p>${p.text("它可能属于其他项目，或这个版本尚未发布。请返回列表选择；不会自动替换成最新版本。")}</p><a href="${p.escape(routePrefix + "/artifacts")}">${p.text("返回 Artifact 列表")}</a>` : ""}</section>`;
  const href = routePrefix + artifactVersionPath(artifact);
  const title = artifactDisplayTitle(artifact);
  const preview = documentPreview(artifact, p);
  const notice = model.presentation && artifact.lifecycle_state !== "archived" ? model.presentation.notice ?? "这是保存时的固定报告。阅读不会重新执行任务，也不代表目标验收。" : view.compatibility?.reason === "artifact_unavailable"
    ? "这个版本的内容不可用；引用和来源信息仍然保留。"
    : view.compatibility?.reason === "artifact_archived"
      ? "这个版本已归档，保留历史信息，不作为可消费的新结果。"
      : preview
        ? "这是导入时保存的文档版本；原文后续修改不会自动同步。"
        : view.compatibility?.reason === "consumer_missing"
          ? artifact.content_kind === "inline"
            ? "没有兼容插件。当前可查看版本信息和原始 JSON，或导出本地副本。"
            : "没有兼容插件。当前可查看版本信息和内容引用，或导出本地副本。"
          : "已有兼容的类型声明；具体操作由消费插件提供。";
  const reference = JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version });
  const versionLabel = `v${artifact.version}${model.relationship ? ` · ${p.text(model.relationship === "input" ? "输入结果" : "产出结果")}` : ""}`;
  const heading = embedded
    ? `<header><h3><a href="${p.escape(href)}">${p.escape(title)}</a></h3><span>${versionLabel}</span></header>`
    : `<header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-artifact-collapse aria-label="${p.text("返回 Artifact 列表")}" title="${p.text("返回 Artifact 列表")}">${icon("chevron-right")}</button><h1>${p.escape(title)}</h1><span>${versionLabel}</span></header>`;
  return `<article class="artifact-detail${embedded ? " artifact-embed" : ""}" data-artifact-id="${p.escape(artifact.artifact_id)}" data-artifact-version="${artifact.version}">
    ${heading}
    ${embedded ? "" : `<div class="artifact-detail-content">`}<p class="artifact-notice">${p.text(embedded && !preview && view.compatibility?.reason === "consumer_missing" ? "没有兼容插件。可打开这个版本查看信息或导出本地副本。" : notice)}</p>
    ${artifact.unavailable_reason ? `<p>${p.escape(artifact.unavailable_reason)}</p>` : ""}
    ${!embedded && model.presentation ? `<p><a class="mw-btn" href="${p.escape(model.presentation.source_href)}" data-workbench-item-plugin="${p.escape(model.presentation.plugin_id)}" data-workbench-item-id="${p.escape(model.presentation.item_id)}" data-workbench-item-title="${p.escape(title)}">${p.text(model.presentation.source_label)}</a></p><section class="artifact-business-preview mw-prose" data-artifact-business-preview>${model.presentation.body_html}</section>` : ""}
    ${preview}
    <dl class="artifact-facts">
      <div><dt>${p.text("结果类型")}</dt><dd>${p.escape(artifact.artifact_type_id)} · Schema ${artifact.schema_version}</dd></div>
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

export function renderArtifactFrameBlock({ view, primitives: p }: ArtifactBrowserUiModel): string {
  const artifact = view.selected;
  if (!artifact) {
    return `<article class="frame-reading" data-frame-reading="artifact"><p>${p.text(view.requested ? "找不到这个 Artifact 版本" : view.versions.length ? "选择一个结果版本" : "还没有项目成果")}</p></article>`;
  }
  return `<article class="frame-reading" data-frame-reading="artifact" data-artifact-id="${p.escape(artifact.artifact_id)}" data-artifact-version="${artifact.version}">
    <p class="frame-reading-meta">v${artifact.version} · ${p.escape(artifact.artifact_type_id)}</p>
    ${documentPreview(artifact, p)}
    <div class="artifact-facts">
      <p>${p.escape(artifact.artifact_type_id)} · Schema ${artifact.schema_version} · ${p.escape(artifact.producer_plugin_id)} ${p.escape(artifact.producer_plugin_version)} · ${p.escape(p.formatDate(artifact.created_at))}</p>
    </div>
  </article>`;
}

export const artifactBrowserUiContribution: UiContribution<ArtifactBrowserUiModel> = {
  descriptor: {
    contribution_id: ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.artifacts",
    kind: "primary-page", navigation_id: "artifacts", label: "Artifacts", slots: [],
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
      default: throw new Error(`Artifact UI surface ${surface} 不存在`);
    }
  },
};
