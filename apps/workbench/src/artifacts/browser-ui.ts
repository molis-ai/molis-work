import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactVersionPath, type ArtifactBrowserView, type ArtifactPluginInput } from "./browser-view.js";
import { renderArtifactPortInputs } from "./port-input-ui.js";

/** An undeclared type shows its last segment. */
const typeIdLabel = (typeId: string) => typeId.split(".").filter(Boolean).at(-1) || typeId;

export const ARTIFACT_BROWSER_UI_CONTRIBUTION_ID = "io.molis.work.native.artifacts.browser.v1";

export interface ArtifactBrowserUiModel {
  readonly view: ArtifactBrowserView;
  readonly routePrefix: string;
  /** Sanitized business content supplied by Host composition, never raw Artifact HTML. */
  readonly presentation?: { readonly notice?: string; readonly body_html: string; readonly source_href: string; readonly source_label: string; readonly plugin_id: string; readonly item_id: string };
  /** The name from this version's own producer (A4). */
  readonly typeTitle?: (version: ArtifactBrowserView["versions"][number]) => string | undefined;
  /** A language preparation reads the same controls without copying the held version's original content. */
  readonly languagePreview?: boolean;
  readonly relationship?: "input" | "output";
  /** The plugins that can start new work from the selected version (A4b, 「从这一版继续」), as the host found them declared. */
  readonly continuers?: ReadonlyArray<{ plugin_id: string; plugin_title: string }>;
  /** Who refers to the selected version (A4b, 「被谁引用」), read by the host through `artifacts.links`: by the plugin that declares the link (BL-646). */
  readonly links?: { readonly plugins: ReadonlyArray<{ plugin_id: string; plugin_title: string; objects: ReadonlyArray<{ id: string; title: string; role: "input" | "output"; proposal: boolean; open: { surface: string; id: string } }> }>; readonly other: number;
    /** Objects of other plugins that link to the version (a Pages document), each opening in its plugin (五.1). */
    readonly referrers?: ReadonlyArray<{ title: string; open: { surface: string; id: string }; plugin_title: string }> };
  /** False when the project has no Goals (RAC-400): there is no Goal to take the selected version as an input, so the form is not offered. */
  readonly goalInput?: boolean;
  /** Plugin input ports that take the selected version's type, and what they read now (artifact-positioning, 2026-10-04). */
  readonly pluginInputs?: ReadonlyArray<ArtifactPluginInput>;
  readonly primitives: {
    escape(value: string): string;
    text(value: string): string;
    formatDate(value: string): string;
  };
}

// Importing files and documents is the side panel's 资料 tab (specs/project-knowledge §9); they show here once saved.
function directory({ view, routePrefix, primitives: p, typeTitle, languagePreview }: ArtifactBrowserUiModel): string {
  const glyph = languagePreview ? () => "" : icon;
  if (!view.versions.length) return `<div class="mw-empty" data-artifact-list-empty><span class="mw-empty__mark">${glyph("package")}</span><strong>${uiText("workbench.browser-ui.no-artifacts-yet")}</strong><p>${uiText("workbench.browser-ui.versions-keep-save-fixed-version-pages-questionnaires-decks")}</p></div>`;
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
        ? uiText.text("workbench.browser-ui.archived")
        : artifact.availability === "unavailable"
          ? uiText.text("workbench.browser-ui.content-unavailable")
          : uiText.text("workbench.browser-ui.available");
      const statusTone = artifact.lifecycle_state === "archived"
        ? "quiet"
        : artifact.availability === "unavailable"
          ? "blocked"
          : "done";
      const link = languagePreview ? "" : ` href="${p.escape(routePrefix + artifactVersionPath(artifact))}" draggable="true" data-frame-asset="artifact" data-frame-asset-id="${p.escape(`${artifact.artifact_id}#${artifact.version}`)}" data-frame-asset-title="${p.escape(title)}" data-frame-asset-caption="${p.escape(`v${artifact.version}`)}"`;
      return `<article class="feed-stage-item">
        <a class="feed-stage-entry directory-list-row${selected ? " is-selected" : ""}"${link}>
          ${languagePreview ? "" : `<span class="feed-stage-leading" translate="no"><strong>${p.escape(title)}</strong></span>`}
          <span class="feed-entry-source">v${artifact.version}</span>
          <span class="mw-status mw-status--${statusTone} mw-status--plain feed-entry-status" data-mw-state="${artifact.lifecycle_state === "archived" ? "archived" : artifact.availability === "unavailable" ? "unavailable" : "ready"}">${status}</span>
        </a>
      </article>`;
    }).join("");
    const titles = new Set(versions.map(version => typeTitle?.(version)));
    const title = titles.size === 1 ? titles.values().next().value : undefined;
    return `<details class="goal-collection-fold" data-artifact-type-fold="${p.escape(typeId)}" open>
      <summary>
        <span class="goal-collection-caret" aria-hidden="true">${glyph("chevron-down")}</span>
        <span class="goal-collection-mark is-${tone}" aria-hidden="true">${glyph(mark)}</span>
        <strong>${p.escape(title ?? typeIdLabel(typeId))}</strong>
        <small>${versions.length}</small>
      </summary>
      <div class="artifact-stage-group-body" role="list">${rows}</div>
    </details>`;
  }).join("");
  return `<nav aria-label="${uiText("workbench.browser-ui.artifact-versions")}" class="mw-dir__list artifact-version-list">${folds}</nav>`;
}

function documentPreview(artifact: NonNullable<ArtifactBrowserView["selected"]>, p: ArtifactBrowserUiModel["primitives"], routePrefix: string, ownerPreview = false, languagePreview = false): string {
  if (artifact.artifact_type_id !== "io.molis.work.document" || artifact.schema_version !== /* @version artifact.io.molis.work.document */ 1
    || artifact.availability !== "available" || artifact.content_kind !== "inline") return "";
  const payload = artifact.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.content !== "string") return "";
  // Every imported version can be taken back as a file; a raster image also shows here (A3, full previews in A4).
  const file = `${routePrefix}/api${artifactVersionPath(artifact)}/file`;
  const original = payload.original_file && typeof payload.original_file === "object" && !Array.isArray(payload.original_file) ? payload.original_file : null;
  const mime = typeof original?.mime === "string" ? original.mime : "";
  const image = !languagePreview && /^image\/(?:png|jpeg|gif|webp|avif)$/u.test(mime) ? `<img class="artifact-document-image" src="${p.escape(file)}" alt="${p.escape(artifact.title)}">` : "";
  const actions = `<p class="artifact-document-actions"><a class="mw-btn" href="${p.escape(file)}" download>${uiText(original ? "workbench.browser-ui.download-original-file" : "workbench.browser-ui.download-text")}</a></p>`;
  let sourceLink = "";
  if (typeof payload.source_url === "string" && payload.source_url) {
    try {
      const url = new URL(payload.source_url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        sourceLink = `<a href="${p.escape(url.href)}" target="_blank" rel="noopener noreferrer">${uiText("workbench.browser-ui.open-source-document")}</a>`;
      }
    } catch { /* Imported metadata must never become an executable link. */ }
  }
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter((warning): warning is string => typeof warning === "string") : [];
  return `<section class="artifact-document-preview" aria-label="${uiText("workbench.browser-ui.document-body")}">
    ${sourceLink ? `<p class="artifact-document-source">${sourceLink}</p>` : ""}
    ${warnings.length ? `<aside class="artifact-document-warnings"><h2>${uiText("workbench.browser-ui.import-notes")}</h2>${languagePreview ? "" : `<ul translate="no">${warnings.map(warning => `<li>${p.escape(warning)}</li>`).join("")}</ul>`}</aside>` : ""}
    ${actions}${ownerPreview ? "" : `${image}${payload.content ? `<h2>${uiText("workbench.browser-ui.document-body")}</h2>${languagePreview ? "" : `<div class="artifact-document-body" translate="no">${p.escape(payload.content)}</div>`}` : ""}`}
  </section>`;
}

function detail(model: ArtifactBrowserUiModel, embedded: boolean): string {
  const { view, routePrefix, primitives: p, languagePreview } = model;
  const artifact = view.selected;
  if (embedded && !artifact && view.requested) return `<article class="artifact-embed artifact-missing" role="status">
    <h3><a href="${p.escape(routePrefix + artifactVersionPath(view.requested))}">${p.escape(view.requested.artifact_id)} · v${view.requested.version}</a></h3>
    <p>${uiText("workbench.browser-ui.linked-version-unavailable-missing-its-reference-retained-latest")}</p></article>`;
  if (!artifact) return `<section class="artifact-empty"${view.requested ? ' role="status"' : ""}>
    <h1>${uiText(view.requested ? "workbench.browser-ui.artifact-version-not-found" : view.versions.length ? "workbench.browser-ui.choose-result-version" : "workbench.browser-ui.no-project-results-yet")}</h1>
    ${view.requested ? `<p>${uiText("workbench.browser-ui.may-belong-another-project-version-has-not-been")}</p><a href="${p.escape(routePrefix + "/artifacts")}">${uiText("workbench.browser-ui.back-artifact-list")}</a>` : ""}</section>`;
  const href = routePrefix + artifactVersionPath(artifact);
  const title = languagePreview ? "" : artifact.title;
  const rawJson = (value: unknown) => languagePreview ? "" : `<pre translate="no">${p.escape(JSON.stringify(value, null, 2))}</pre>`;
  const preview = documentPreview(artifact, p, routePrefix, Boolean(model.presentation), languagePreview);
  const notice = model.presentation && artifact.lifecycle_state !== "archived" ? "workbench.browser-ui.pinned-version-later-changes-original-do-not-change" : view.compatibility?.reason === "artifact_unavailable"
    ? "workbench.browser-ui.version-s-content-unavailable-its-reference-source-information"
    : view.compatibility?.reason === "artifact_archived"
      ? "workbench.browser-ui.version-archived-its-history-retained-but-not-offered"
      : preview
        ? "workbench.browser-ui.document-version-saved-import-later-changes-source-not"
        : view.compatibility?.reason === "consumer_missing"
          ? artifact.content_kind === "inline"
            ? "workbench.browser-ui.no-compatible-plugin-can-inspect-version-information-raw"
            : "workbench.browser-ui.no-compatible-plugin-can-inspect-version-information-content"
          : "workbench.browser-ui.pinned-version-later-changes-original-do-not-change";
  const reference = JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version });
  const versionLabel = `v${artifact.version}${model.relationship ? ` · ${uiText.text(model.relationship === "input" ? "workbench.browser-ui.inputs" : "workbench.browser-ui.deliverable")}` : ""}`;
  const heading = embedded
    ? `<header><h3 translate="no"><a href="${p.escape(href)}">${p.escape(title)}</a></h3><span>${versionLabel}</span></header>`
    : `<header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-artifact-collapse aria-label="${uiText("workbench.browser-ui.back-artifact-list")}" title="${uiText("workbench.browser-ui.back-artifact-list")}">${languagePreview ? "" : icon("chevron-right")}</button><h1 translate="no">${p.escape(title)}</h1><span>${versionLabel}</span></header>`;
  const detailNotice = embedded && !preview && view.compatibility?.reason === "consumer_missing"
    ? uiText.text("workbench.browser-ui.no-compatible-plugin-open-version-inspect-its-information")
    : (artifact.lifecycle_state !== "archived" ? model.presentation?.notice : undefined) ?? uiText.text(notice);
  return `<article class="artifact-detail${embedded ? " artifact-embed" : ""}" data-artifact-id="${p.escape(artifact.artifact_id)}" data-artifact-version="${artifact.version}">
    ${heading}
    ${embedded ? "" : `<div class="artifact-detail-content">`}<p class="artifact-notice">${p.escape(detailNotice)}</p>
    ${!languagePreview && artifact.unavailable_reason ? `<p translate="no">${p.escape(artifact.unavailable_reason)}</p>` : ""}
    ${!embedded && model.presentation ? `${model.presentation.source_href ? `<p><a class="mw-btn" href="${p.escape(model.presentation.source_href)}" data-workbench-item-plugin="${p.escape(model.presentation.plugin_id)}" data-workbench-item-id="${p.escape(model.presentation.item_id)}" data-workbench-item-title="${p.escape(title)}">${p.escape(model.presentation.source_label)}</a></p>` : ""}<section class="artifact-business-preview mw-prose" data-artifact-business-preview translate="no">${model.presentation.body_html}</section>` : ""}
    ${!embedded && model.continuers?.length ? continueActions(model.continuers, artifact, p) : ""}
    ${!embedded ? handoffActions(artifact, p, languagePreview) : ""}
    ${preview}
    ${!embedded && model.links ? linksSection(model.links, routePrefix, p, artifact, model.goalInput !== false, languagePreview) : ""}
    ${!embedded && model.pluginInputs?.length ? renderArtifactPortInputs(model.pluginInputs, { artifact_id: artifact.artifact_id, version: artifact.version }, p) : ""}
    <dl class="artifact-facts">
      <div><dt>${uiText("workbench.browser-ui.result-type")}</dt><dd>${p.escape(model.typeTitle?.(artifact) ?? typeIdLabel(artifact.artifact_type_id))} · ${p.escape(artifact.artifact_type_id)} · Schema ${artifact.schema_version}</dd></div>
      <div><dt>${uiText("workbench.browser-ui.source-plugin")}</dt><dd>${p.escape(artifact.producer_plugin_id)} · ${p.escape(artifact.producer_plugin_version)}</dd></div>
      <div><dt>${uiText("workbench.browser-ui.scope")}</dt><dd>${uiText(artifact.scope === "personal" ? "workbench.browser-ui.personal" : "workbench.browser-ui.shared-team-project")}</dd></div>
      <div><dt>${uiText("workbench.browser-ui.published")}</dt><dd>${p.escape(p.formatDate(artifact.created_at))}</dd></div>
    </dl>
    ${embedded ? `<a href="${p.escape(href)}">${uiText("workbench.browser-ui.view-version")}</a>` : `
      <details class="artifact-raw"><summary>${uiText("workbench.browser-ui.cite-version")}</summary><label class="artifact-reference-label">${uiText("workbench.browser-ui.exact-version-reference")}<input readonly value="${p.escape(reference)}" aria-label="${uiText("workbench.browser-ui.exact-version-reference")}"></label></details>
      ${artifact.content_kind === "inline" && artifact.availability === "available" ? `<details class="artifact-raw"><summary>${uiText("workbench.browser-ui.view-raw-json-not-application-preview")}</summary>${rawJson(artifact.payload)}</details>` : artifact.content_ref ? `<section class="artifact-content-reference"><h2>${uiText("workbench.browser-ui.content-reference")}</h2><p>${uiText("workbench.browser-ui.locator-only-current-file-may-no-longer-match")}</p><input readonly aria-label="${uiText("workbench.browser-ui.content-reference")}" value="${languagePreview ? "" : p.escape(artifact.content_ref)}"></section>` : ""}
      <details class="artifact-raw"><summary>${uiText("workbench.browser-ui.view-raw-metadata")}</summary>${rawJson(artifact.metadata)}</details>`}
    ${embedded ? "" : `</div>
      <div class="artifact-actions"><a class="artifact-export" href="${p.escape(routePrefix + "/api" + artifactVersionPath(artifact) + "/export")}" download>${uiText("workbench.browser-ui.export-version")}</a><span>${uiText("workbench.browser-ui.downloads-local-copy-only-nothing-published-shared")}</span></div>`}
  </article>`;
}

/** 「从这一版继续」: one button per plugin that declares it can continue from this type. */
function continueActions(continuers: NonNullable<ArtifactBrowserUiModel["continuers"]>, artifact: NonNullable<ArtifactBrowserView["selected"]>, p: ArtifactBrowserUiModel["primitives"]): string {
  const reference = p.escape(JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version }));
  return `<p class="artifact-continue-actions">${continuers.map(item => `<button class="mw-btn" type="button" data-artifact-continue="${p.escape(item.plugin_id)}" data-artifact-reference="${reference}">${uiText("workbench.browser-ui.continue-in-plugin", { plugin: item.plugin_title })}</button>`).join("")}</p>`;
}

/**
 * 「交给助理 / Coding」 (artifact-positioning 五.1): the version goes to a new work as material, with what the detail shows of
 * it. Coding is offered only where the project has it; the 成果 client finds out and shows the button.
 */
function handoffActions(artifact: NonNullable<ArtifactBrowserView["selected"]>, p: ArtifactBrowserUiModel["primitives"], languagePreview?: boolean): string {
  if (artifact.availability !== "available" || artifact.lifecycle_state === "archived") return "";
  const data = languagePreview ? "" : `data-artifact-subject="${p.escape(artifactSubjectId(artifact))}" data-artifact-title="${p.escape(artifact.title)}" data-artifact-version="${artifact.version}"`;
  return `<p class="artifact-continue-actions" data-artifact-handoff ${data}><button class="mw-btn" type="button" data-artifact-hand="assistant">${uiText("workbench.browser-ui.hand-assistant")}</button><button class="mw-btn" type="button" data-artifact-hand="coding" hidden>${uiText("workbench.browser-ui.hand-coding")}</button></p>`;
}

const LINK_ROLES = { input: "workbench.browser-ui.inputs", output: "workbench.browser-ui.deliverable", proposed_input: "workbench.browser-ui.proposed-input", proposed_output: "workbench.browser-ui.proposed-deliverable" } as const;
/**
 * 「被谁引用」: under each plugin that declares the link, its objects that use this version, each opening in the workbench; the
 * Assistant's works, and how many other links there are.
 */
function linksSection(links: NonNullable<ArtifactBrowserUiModel["links"]>, routePrefix: string, p: ArtifactBrowserUiModel["primitives"], artifact: NonNullable<ArtifactBrowserView["selected"]>, goalInput = true, languagePreview = false): string {
  const open = (target: { surface: string; id: string }, title: string) => languagePreview ? "" : `<a href="#" data-workbench-item-plugin="${p.escape(target.surface)}" data-workbench-item-id="${p.escape(target.id)}" data-workbench-item-title="${p.escape(title)}" translate="no">${p.escape(title)}</a>`;
  const linked = links.plugins.map(group => `<h3 class="artifact-links-heading">${p.escape(group.plugin_title)}</h3><ul data-artifact-linked-plugin="${p.escape(group.plugin_id)}">${group.objects
    .map(link => `<li>${open(link.open, link.title)}<span>${uiText(LINK_ROLES[link.proposal ? (link.role === "input" ? "proposed_input" : "proposed_output") : link.role])}</span></li>`).join("")}</ul>`).join("");
  const referrers = (links.referrers ?? []).map(row => `<li>${open(row.open, row.title)}<span>${p.escape(row.plugin_title)} · ${uiText("workbench.browser-ui.links-version")}</span></li>`).join("");
  const other = links.other ? `<p class="artifact-links-other">${uiText("workbench.browser-ui.other-references")} · ${links.other}</p>` : "";
  // 「作为 Goal 的输入」 (A4b): only a version people can still use is offered.
  const usable = artifact.availability === "available" && artifact.lifecycle_state !== "archived";
  const reference = p.escape(JSON.stringify({ artifact_id: artifact.artifact_id, version: artifact.version }));
  const asInput = usable && goalInput ? `<details class="artifact-goal-input" data-artifact-goal-input><summary>${uiText("workbench.browser-ui.use-goal-s-input")}</summary><form data-artifact-goal-input-form data-artifact-reference="${reference}"><select class="mw-select" name="goal" required aria-label="${uiText("workbench.browser-ui.choose-goal")}"><option value="">${uiText("workbench.browser-ui.loading-goals")}</option></select><button class="mw-btn" type="submit">${uiText("workbench.browser-ui.record-input")}</button><span data-artifact-goal-input-status role="status"></span></form></details>` : "";
  // Assistant works that started from this version, took it as material or produced it: the Assistant keeps these in its
  // own store, so the 成果 client reads them once the detail shows. A version is named by its subject or, from a tab, its path
  // (with the project's prefix when the tab came from a direct link).
  const subjects = p.escape(JSON.stringify([...new Set([artifactSubjectId(artifact), artifactVersionPath(artifact), routePrefix + artifactVersionPath(artifact)])]));
  const works = `<div class="artifact-links-works" data-artifact-works="${subjects}" hidden><h3>${uiText("workbench.browser-ui.assistant-work")}</h3><ul></ul></div>`;
  return `<section class="artifact-links" data-artifact-links><h2>${uiText("workbench.browser-ui.referenced")}</h2>${linked}${!linked && !referrers ? `<p>${uiText("workbench.browser-ui.nothing-refers-version-yet")}</p>` : ""}${referrers ? `<h3 class="artifact-links-heading">${uiText("workbench.browser-ui.page")}</h3><ul data-artifact-referrers>${referrers}</ul>` : ""}${works}${other}${asInput}</section>`;
}

function renderArtifactFrameBlock({ view, routePrefix, primitives: p }: ArtifactBrowserUiModel): string {
  const artifact = view.selected;
  if (!artifact) {
    return `<article class="frame-reading" data-frame-reading="artifact"><p>${uiText(view.requested ? "workbench.browser-ui.artifact-version-not-found" : view.versions.length ? "workbench.browser-ui.choose-result-version" : "workbench.browser-ui.no-project-results-yet")}</p></article>`;
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
    contribution_id: ARTIFACT_BROWSER_UI_CONTRIBUTION_ID,
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
