import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderHint } from "@molis-ai/molis-work-design-system";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/project-guidance";

/**
 * The project settings' guidance page (specs/plugin-equal-standing/contract-design.md §9): what is in force by kind, what was switched
 * off, and every revision. The platform keeps the project's guidance, so the page is the settings' own, whichever plugins are enabled.
 */
export function createProjectGuidanceDocumentRenderer(ports: {
  escapeHtml: (value: unknown) => string;
  formatDate: (value: string | null | undefined) => string;
  icon: (name: PluginIconName) => string;
}) {
  const { escapeHtml, formatDate, icon } = ports;

  function renderProjectGuidanceDocument(guidance: ProjectGuidanceView): string {
    const kindMeta: Record<string, { label: string; description: string }> = {
      context: { label: uiText.text("workbench.project-guidance.project-context"), description: uiText.text("workbench.project-guidance.what-project-facts-that-remain-true") },
      requirement: { label: uiText.text("workbench.project-guidance.shared-requirement"), description: uiText.text("workbench.project-guidance.product-business-requirements-all-work-project-must-meet") },
      constraint: { label: uiText.text("workbench.project-guidance.constraint"), description: uiText.text("workbench.project-guidance.boundaries-that-no-work-may-cross") },
      convention: { label: uiText.text("workbench.project-guidance.convention"), description: uiText.text("workbench.project-guidance.naming-communication-collaboration-conventions") },
      workflow: { label: uiText.text("workbench.project-guidance.workflow"), description: uiText.text("workbench.project-guidance.project-s-stable-way-working") },
      quality_bar: { label: uiText.text("workbench.project-guidance.quality-bar"), description: uiText.text("workbench.project-guidance.shared-standard-completed-work") },
    };
    const orderedKinds = ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"];
    const sections = orderedKinds.map((kind) => {
      const entries = guidance.entries.filter((entry) => entry.kind === kind);
      const meta = kindMeta[kind]!;
      return `<section class="guidance-section" aria-labelledby="guidance-${kind}"><header class="guidance-section-heading"><h2 id="guidance-${kind}">${meta.label}</h2><p>${meta.description}</p></header><button type="button" class="mw-btn mw-btn--link guidance-category-add" data-guidance-new data-guidance-kind="${kind}" aria-label="${meta.label} · ${uiText("workbench.project-guidance.add-guidance")}">${icon("plus")}${uiText("workbench.project-guidance.add")}</button><div class="guidance-entry-list">${entries.map((entry) => `<article class="guidance-entry" data-guidance-entry="${escapeHtml(entry.guidance_id)}"><p>${escapeHtml(entry.content)}</p><footer><span class="guidance-entry-meta">${uiText("workbench.project-guidance.revision-revision-updated-time", { revision: entry.revision, time: formatDate(entry.updated_at) })}</span><span class="guidance-entry-actions"><button class="mw-btn mw-btn--link" type="button" data-guidance-edit="${escapeHtml(entry.guidance_id)}">${uiText("workbench.project-guidance.change")}</button><button class="mw-btn mw-btn--danger-outline" type="button" data-guidance-action="deactivate" data-guidance-id="${escapeHtml(entry.guidance_id)}">${uiText("workbench.project-guidance.disable")}</button></span></footer></article>`).join("")}</div></section>`;
    }).join("");
    const inactiveItems = guidance.inactive_entries.length > 0
      ? `<ul class="guidance-inactive-list">${guidance.inactive_entries.map((entry) => `<li><p>${escapeHtml(entry.content)}</p><button class="mw-btn mw-btn--link" type="button" data-guidance-action="restore" data-guidance-id="${escapeHtml(entry.guidance_id)}">${uiText("workbench.project-guidance.restore-entry")}</button></li>`).join("")}</ul>`
      : `<p>${uiText("workbench.project-guidance.there-no-deactivated-entries")}</p>`;
    const changeLabels: Record<string, string> = {
      created: uiText.text("workbench.project-guidance.add-2"),
      edited: uiText.text("workbench.project-guidance.change"),
      deactivated: uiText.text("workbench.project-guidance.disable"),
      restored: uiText.text("workbench.project-guidance.restore"),
    };
    const historyRows = guidance.revisions.map((revision) => {
      const content = cutWithEllipsis(revision.content, 220, { prefixLength: 220 });
      const stateLabel = revision.active ? uiText.text("workbench.project-guidance.active-revision") : uiText.text("workbench.project-guidance.deactivated-revision");
      return `<article class="guidance-history-row"><div><strong>${escapeHtml(changeLabels[revision.change_kind] ?? revision.change_kind)}</strong><div class="guidance-history-state${revision.active ? "" : " guidance-history-state--inactive"}">${uiText("workbench.project-guidance.revision-revision", { revision: revision.revision })} · ${stateLabel}</div></div><div><strong>${escapeHtml(kindMeta[revision.kind]?.label ?? revision.kind)}</strong><p>${escapeHtml(content)}</p><details class="guidance-history-entry"><summary>${uiText("workbench.project-guidance.view-full-revision-change-reason")}</summary><dl class="guidance-history-full"><div><dt>${uiText("workbench.project-guidance.full-text")}</dt><dd>${escapeHtml(revision.content)}</dd></div><div><dt>${uiText("workbench.project-guidance.change-reason")}</dt><dd>${escapeHtml(revision.reason)}</dd></div><div><dt>${uiText("workbench.project-guidance.changed")}</dt><dd>${escapeHtml(revision.changed_by)}</dd></div><div><dt>${uiText("workbench.project-guidance.confirmation-record")}</dt><dd>${escapeHtml(revision.confirmation_summary)}</dd></div></dl></details></div><time datetime="${escapeHtml(revision.created_at)}">${formatDate(revision.created_at)}</time></article>`;
    }).join("");
    const guidanceData = JSON.stringify(guidance).replaceAll("<", "\\u003c");
    return `<section class="guidance-document" aria-labelledby="guidance-title">
      <header class="guidance-page-header"><div><div class="settings-heading-title"><h1 id="guidance-title">${uiText("workbench.project-guidance.project-guidance")}</h1>${renderHint({ id: "settings-hint-guidance", label: uiText.text("workbench.project-guidance.how-runtime-uses"), text: uiText.text("workbench.project-guidance.only-active-revisions-sent-placed-before-round-s") })}</div><p>${uiText("workbench.project-guidance.long-term-guidance-shared-all-work-project-assistant")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-guidance-new>${icon("plus")}${uiText("workbench.project-guidance.add-guidance")}</button></header>
      <div class="settings-body"><p class="project-rules-receipt" data-guidance-receipt role="status" aria-live="polite" hidden></p>
      <section class="guidance-editor" data-guidance-editor data-cover-layer hidden aria-labelledby="guidance-editor-title"><header><div><h2 id="guidance-editor-title" data-guidance-editor-title></h2><p data-guidance-editor-description></p></div></header><form data-guidance-form><input type="hidden" name="action"><input type="hidden" name="guidance_id"><div class="guidance-editor-body"><div class="guidance-editor-fields" data-guidance-editor-fields><label>${uiText("workbench.project-guidance.category")}<select name="kind"><option value="context">${uiText("workbench.project-guidance.project-context")}</option><option value="requirement">${uiText("workbench.project-guidance.shared-requirement")}</option><option value="constraint">${uiText("workbench.project-guidance.constraint")}</option><option value="convention">${uiText("workbench.project-guidance.convention")}</option><option value="workflow">${uiText("workbench.project-guidance.workflow")}</option><option value="quality_bar">${uiText("workbench.project-guidance.quality-bar")}</option></select></label><label>${uiText("workbench.project-guidance.guidance-text")}<textarea name="content" maxlength="4000" rows="5" placeholder="${uiText("workbench.project-guidance.write-complete-instruction-future-runtime-can-understand-follow")}"></textarea></label></div><p class="guidance-editor-preview" data-guidance-editor-preview hidden></p><label>${uiText("workbench.project-guidance.why-make-change")}<textarea name="reason" rows="3" required placeholder="${uiText("workbench.project-guidance.reason-kept-revision-history-so-decision-remains-understandable")}"></textarea></label></div><div class="guidance-editor-actions"><p class="guidance-editor-error" data-guidance-editor-error role="alert" hidden></p><footer><button class="mw-btn mw-btn--secondary" type="button" data-guidance-editor-close>${uiText("workbench.project-guidance.cancel")}</button><button class="mw-btn mw-btn--primary" type="submit">${uiText("workbench.project-guidance.save-guidance")}</button></footer></div></form></section>
      <div class="guidance-settings-list">${sections}</div>
      <div class="guidance-advanced-list">
      <details class="settings-advanced guidance-history"><summary><span class="setting-copy"><strong>${uiText("workbench.project-guidance.revision-history")}</strong><span>${uiText("workbench.project-guidance.count-count", { count: guidance.revisions.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-history-list">${historyRows || `<p>${uiText("workbench.project-guidance.there-no-revision-history-yet")}</p>`}</div></details>
      <details class="settings-advanced guidance-inactive"><summary><span class="setting-copy"><strong>${uiText("workbench.project-guidance.deactivated-guidance")}</strong><span>${uiText("workbench.project-guidance.count-count-2", { count: guidance.inactive_entries.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-inactive-body">${inactiveItems}</div></details>
      </div>
      </div>
      <script type="application/json" data-project-guidance-json>${guidanceData}</script>
    </section>`;
  }

  return renderProjectGuidanceDocument;
}
