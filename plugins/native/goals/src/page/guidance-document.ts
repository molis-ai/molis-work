import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalsHintOptions } from "./ports.js";

/** The fields of a project's guidance this page shows: an entry in force or switched off, and one revision of it. */
interface GuidanceEntry { guidance_id: string; kind: string; content: string; revision: number; updated_at: string }
interface GuidanceRevision {
  kind: string; content: string; revision: number; active: boolean; change_kind: string;
  changed_by: string; confirmation_summary: string; reason: string; created_at: string;
}
interface ProjectGuidanceView { entries: readonly GuidanceEntry[]; inactive_entries: readonly GuidanceEntry[]; revisions: readonly GuidanceRevision[] }

/** The project's guidance page: what is in force by kind, what was switched off, and every revision. */
export function createProjectGuidanceDocumentRenderer(ports: {
  readText: (text: string, values?: Record<string, string | number>) => string;
  escapeHtml: (value: unknown) => string;
  formatDate: (value: string | null | undefined) => string;
  icon: (name: PluginIconName) => string;
  renderHint: (options: GoalsHintOptions) => string;
}) {
  const { escapeHtml, formatDate, icon, renderHint } = ports;

  function renderProjectGuidanceDocument(guidance: ProjectGuidanceView): string {
    const kindMeta: Record<string, { label: string; description: string }> = {
      context: { label: uiText.text("goals.guidance-document.project-context"), description: uiText.text("goals.guidance-document.what-project-facts-that-remain-true") },
      requirement: { label: uiText.text("goals.guidance-document.shared-requirement"), description: uiText.text("goals.guidance-document.product-business-requirements-all-work-project-must-meet") },
      constraint: { label: uiText.text("goals.guidance-document.constraint"), description: uiText.text("goals.guidance-document.boundaries-that-no-work-may-cross") },
      convention: { label: uiText.text("goals.guidance-document.convention"), description: uiText.text("goals.guidance-document.naming-communication-collaboration-conventions") },
      workflow: { label: uiText.text("goals.guidance-document.workflow"), description: uiText.text("goals.guidance-document.project-s-stable-way-working") },
      quality_bar: { label: uiText.text("goals.guidance-document.quality-bar"), description: uiText.text("goals.guidance-document.shared-standard-completed-work") },
    };
    const orderedKinds = ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"];
    const sections = orderedKinds.map((kind) => {
      const entries = guidance.entries.filter((entry) => entry.kind === kind);
      const meta = kindMeta[kind]!;
      return `<section class="guidance-section" aria-labelledby="guidance-${kind}"><header class="guidance-section-heading"><h2 id="guidance-${kind}">${meta.label}</h2><p>${meta.description}</p></header><button type="button" class="mw-btn mw-btn--link guidance-category-add" data-guidance-new data-guidance-kind="${kind}" aria-label="${meta.label} · ${uiText("goals.guidance-document.add-guidance")}">${icon("plus")}${uiText("goals.guidance-document.add")}</button><div class="guidance-entry-list">${entries.map((entry) => `<article class="guidance-entry" data-guidance-entry="${escapeHtml(entry.guidance_id)}"><p>${escapeHtml(entry.content)}</p><footer><span class="guidance-entry-meta">${uiText("goals.guidance-document.revision-revision-updated-time", { revision: entry.revision, time: formatDate(entry.updated_at) })}</span><span class="guidance-entry-actions"><button class="mw-btn mw-btn--link" type="button" data-guidance-edit="${escapeHtml(entry.guidance_id)}">${uiText("goals.guidance-document.change")}</button><button class="mw-btn mw-btn--danger-outline" type="button" data-guidance-action="deactivate" data-guidance-id="${escapeHtml(entry.guidance_id)}">${uiText("goals.guidance-document.disable")}</button></span></footer></article>`).join("")}</div></section>`;
    }).join("");
    const inactiveItems = guidance.inactive_entries.length > 0
      ? `<ul class="guidance-inactive-list">${guidance.inactive_entries.map((entry) => `<li><p>${escapeHtml(entry.content)}</p><button class="mw-btn mw-btn--link" type="button" data-guidance-action="restore" data-guidance-id="${escapeHtml(entry.guidance_id)}">${uiText("goals.guidance-document.restore-entry")}</button></li>`).join("")}</ul>`
      : `<p>${uiText("goals.guidance-document.there-no-deactivated-entries")}</p>`;
    const changeLabels: Record<string, string> = {
      created: uiText.text("goals.guidance-document.add-2"),
      edited: uiText.text("goals.guidance-document.change"),
      deactivated: uiText.text("goals.guidance-document.disable"),
      restored: uiText.text("goals.guidance-document.restore"),
    };
    const historyRows = guidance.revisions.map((revision) => {
      const content = cutWithEllipsis(revision.content, 220, { prefixLength: 220 });
      const stateLabel = revision.active ? uiText.text("goals.guidance-document.active-revision") : uiText.text("goals.guidance-document.deactivated-revision");
      return `<article class="guidance-history-row"><div><strong>${escapeHtml(changeLabels[revision.change_kind] ?? revision.change_kind)}</strong><div class="guidance-history-state${revision.active ? "" : " guidance-history-state--inactive"}">${uiText("goals.guidance-document.revision-revision", { revision: revision.revision })} · ${stateLabel}</div></div><div><strong>${escapeHtml(kindMeta[revision.kind]?.label ?? revision.kind)}</strong><p>${escapeHtml(content)}</p><details class="guidance-history-entry"><summary>${uiText("goals.guidance-document.view-full-revision-change-reason")}</summary><dl class="guidance-history-full"><div><dt>${uiText("goals.guidance-document.full-text")}</dt><dd>${escapeHtml(revision.content)}</dd></div><div><dt>${uiText("goals.guidance-document.change-reason")}</dt><dd>${escapeHtml(revision.reason)}</dd></div><div><dt>${uiText("goals.guidance-document.changed")}</dt><dd>${escapeHtml(revision.changed_by)}</dd></div><div><dt>${uiText("goals.guidance-document.confirmation-record")}</dt><dd>${escapeHtml(revision.confirmation_summary)}</dd></div></dl></details></div><time datetime="${escapeHtml(revision.created_at)}">${formatDate(revision.created_at)}</time></article>`;
    }).join("");
    const guidanceData = JSON.stringify(guidance).replaceAll("<", "\\u003c");
    return `<section class="guidance-document" aria-labelledby="guidance-title">
      <header class="guidance-page-header"><div><div class="settings-heading-title"><h1 id="guidance-title">${uiText("goals.guidance-document.project-guidance")}</h1>${renderHint({ id: "settings-hint-guidance", label: uiText.text("goals.guidance-document.how-runtime-uses"), text: uiText.text("goals.guidance-document.only-active-revisions-sent-placed-before-round-s") })}</div><p>${uiText("goals.guidance-document.long-term-guidance-shared-all-work-project-assistant")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-guidance-new>${icon("plus")}${uiText("goals.guidance-document.add-guidance")}</button></header>
      <div class="settings-body"><p class="project-rules-receipt" data-guidance-receipt role="status" aria-live="polite" hidden></p>
      <section class="guidance-editor" data-guidance-editor data-cover-layer hidden aria-labelledby="guidance-editor-title"><header><div><h2 id="guidance-editor-title" data-guidance-editor-title></h2><p data-guidance-editor-description></p></div></header><form data-guidance-form><input type="hidden" name="action"><input type="hidden" name="guidance_id"><div class="guidance-editor-body"><div class="guidance-editor-fields" data-guidance-editor-fields><label>${uiText("goals.guidance-document.category")}<select name="kind"><option value="context">${uiText("goals.guidance-document.project-context")}</option><option value="requirement">${uiText("goals.guidance-document.shared-requirement")}</option><option value="constraint">${uiText("goals.guidance-document.constraint")}</option><option value="convention">${uiText("goals.guidance-document.convention")}</option><option value="workflow">${uiText("goals.guidance-document.workflow")}</option><option value="quality_bar">${uiText("goals.guidance-document.quality-bar")}</option></select></label><label>${uiText("goals.guidance-document.guidance-text")}<textarea name="content" maxlength="4000" rows="5" placeholder="${uiText("goals.guidance-document.write-complete-instruction-future-runtime-can-understand-follow")}"></textarea></label></div><p class="guidance-editor-preview" data-guidance-editor-preview hidden></p><label>${uiText("goals.guidance-document.why-make-change")}<textarea name="reason" rows="3" required placeholder="${uiText("goals.guidance-document.reason-kept-revision-history-so-decision-remains-understandable")}"></textarea></label></div><div class="guidance-editor-actions"><p class="guidance-editor-error" data-guidance-editor-error role="alert" hidden></p><footer><button class="mw-btn mw-btn--secondary" type="button" data-guidance-editor-close>${uiText("goals.guidance-document.cancel")}</button><button class="mw-btn mw-btn--primary" type="submit">${uiText("goals.guidance-document.save-guidance")}</button></footer></div></form></section>
      <div class="guidance-settings-list">${sections}</div>
      <div class="guidance-advanced-list">
      <details class="settings-advanced guidance-history"><summary><span class="setting-copy"><strong>${uiText("goals.guidance-document.revision-history")}</strong><span>${uiText("goals.guidance-document.count-count", { count: guidance.revisions.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-history-list">${historyRows || `<p>${uiText("goals.guidance-document.there-no-revision-history-yet")}</p>`}</div></details>
      <details class="settings-advanced guidance-inactive"><summary><span class="setting-copy"><strong>${uiText("goals.guidance-document.deactivated-guidance")}</strong><span>${uiText("goals.guidance-document.count-count-2", { count: guidance.inactive_entries.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-inactive-body">${inactiveItems}</div></details>
      </div>
      </div>
      <script type="application/json" data-project-guidance-json>${guidanceData}</script>
    </section>`;
  }

  return renderProjectGuidanceDocument;
}
