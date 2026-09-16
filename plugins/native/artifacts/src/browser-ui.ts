import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { artifactDisplayTitle, artifactVersionPath, type ArtifactBrowserView } from "./browser.js";

export const ARTIFACT_BROWSER_UI_CONTRIBUTION_ID = "io.molis.work.native.artifacts.browser.v1";

export interface ArtifactBrowserUiModel {
  readonly view: ArtifactBrowserView;
  readonly routePrefix: string;
  readonly relationship?: "input" | "output";
  readonly primitives: {
    escape(value: string): string;
    text(value: string): string;
    formatDate(value: string): string;
  };
}

function directory({ view, routePrefix, primitives: p }: ArtifactBrowserUiModel): string {
  if (!view.versions.length) return `<p class="artifact-empty">${p.text("还没有 Artifact")}</p>`;
  return `<nav aria-label="${p.text("Artifact 版本")}" class="artifact-version-list">${view.versions.map((artifact) => {
    const selected = view.selected?.artifact_id === artifact.artifact_id && view.selected.version === artifact.version;
    const title = artifactDisplayTitle(artifact);
    return `<a href="${p.escape(routePrefix + artifactVersionPath(artifact))}" draggable="true" data-frame-asset="artifact" data-frame-asset-id="${p.escape(artifact.artifact_id + "#" + artifact.version)}" data-frame-asset-title="${p.escape(title)}" data-frame-asset-caption="${p.escape("v" + artifact.version + " · " + artifact.artifact_type_id)}"${selected ? ' aria-current="page"' : ""}>
      <strong>${p.escape(title)}</strong><span>v${artifact.version} · ${p.escape(artifact.artifact_type_id)}</span>
      <small>${p.escape(p.formatDate(artifact.created_at))} · ${p.text(artifact.lifecycle_state === "archived" ? "已归档" : artifact.availability === "unavailable" ? "内容不可用" : "可用")}</small>
    </a>`;
  }).join("")}</nav>`;
}

function detail(model: ArtifactBrowserUiModel, embedded: boolean): string {
  const { view, routePrefix, primitives: p } = model;
  const artifact = view.selected;
  if (embedded && !artifact && view.requested) return `<article class="artifact-embed artifact-missing" role="status">
    <h3><a href="${p.escape(routePrefix + artifactVersionPath(view.requested))}">${p.escape(view.requested.artifact_id)} · v${view.requested.version}</a></h3>
    <p>${p.text("关联的版本不可用或不存在。引用仍然保留，不会替换成最新版本。")}</p></article>`;
  if (!artifact) return `<section class="artifact-empty"${view.requested ? ' role="status"' : ""}>
    <h1>${p.text(view.requested ? "找不到这个 Artifact 版本" : view.versions.length ? "选择一个结果版本" : "还没有项目成果")}</h1>
    ${!view.requested && !view.versions.length ? `<p>${p.text("项目发布的成果版本会保存在这里。先推进一项 Goal，提交成果后即可在这里查看。")}</p>` : ""}
    ${view.requested ? `<p>${p.text("它可能属于其他项目，或这个版本尚未发布。请返回列表选择；不会自动替换成最新版本。")}</p><a href="${p.escape(routePrefix + "/artifacts")}">${p.text("返回 Artifact 列表")}</a>` : ""}</section>`;
  const href = routePrefix + artifactVersionPath(artifact);
  const title = artifactDisplayTitle(artifact);
  const notice = view.compatibility?.reason === "artifact_unavailable"
    ? "这个版本的内容不可用；引用和来源信息仍然保留。"
    : view.compatibility?.reason === "artifact_archived"
      ? "这个版本已归档，保留历史信息，不作为可消费的新结果。"
      : view.compatibility?.reason === "consumer_missing"
        ? artifact.content_kind === "inline"
          ? "没有兼容插件。当前可查看版本信息和原始 JSON，或导出本地副本。"
          : "没有兼容插件。当前可查看版本信息和内容引用，或导出本地副本。"
        : "已有兼容的类型声明；具体操作由消费插件提供。";
  const reference = JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version });
  return `<article class="artifact-detail${embedded ? " artifact-embed" : ""}" data-artifact-id="${p.escape(artifact.artifact_id)}" data-artifact-version="${artifact.version}">
    <header>${embedded ? `<h3><a href="${p.escape(href)}">${p.escape(title)}</a></h3>` : `<h1>${p.escape(title)}</h1>`}<span>v${artifact.version}${model.relationship ? ` · ${p.text(model.relationship === "input" ? "输入结果" : "产出结果")}` : ""}</span></header>
    ${embedded ? "" : `<div class="artifact-detail-content">`}<p class="artifact-notice">${p.text(embedded && view.compatibility?.reason === "consumer_missing" ? "没有兼容插件。可打开这个版本查看信息或导出本地副本。" : notice)}</p>
    ${artifact.unavailable_reason ? `<p>${p.escape(artifact.unavailable_reason)}</p>` : ""}
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
