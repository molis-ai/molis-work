import { t as uiText, escapeHtml, renderBadge, renderButton, renderStatusMark, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPermitRow, SESSION_SOURCE_STYLES, type MwPermitNote } from "@molis-ai/molis-work-design-system";

/**
 * The component board's 外部会话 section: the two parts the external-sessions designs added (docs/design/sessions-sources/README.md
 * 「组件板新增」, batch 22), drawn from the design system (`renderPermitRow`, `renderTranscript`) in their normal and failing states.
 * The projects, paths and the conversation are sample data, written through the board's words; nothing is read from a Home and
 * no tool is called.
 */

function figure(caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(caption)}</figcaption>${body}</figure>`;
}

interface Row { readonly id: string; readonly name: string; readonly line: string; readonly on: boolean; readonly note?: MwPermitNote; readonly badges?: string; readonly current?: boolean }

function permitRow(row: Row): string {
  const described = `catalog-permit-${row.id}`;
  const control = renderSwitch({ checked: row.on, attrs: { "aria-label": uiText.text("workbench.session-source-specimens.let-ai-read", { project: row.name }), "aria-describedby": described, "aria-busy": row.note?.kind === "saving" ? "true" : undefined } });
  return renderPermitRow({ project: { id: row.id, name: row.name }, badges: row.badges, description: row.line, descriptionId: described, control, note: row.note, current: row.current });
}

const onNote = (): MwPermitNote => ({ kind: "on", status: uiText.text("workbench.session-source-specimens.on"), text: uiText.text("workbench.session-source-specimens.on-note") });
const offNote = (): MwPermitNote => ({ kind: "off", status: uiText.text("workbench.session-source-specimens.off"), text: uiText.text("workbench.session-source-specimens.off-note") });

function statesSpecimen(): string {
  return `<div class="mw-settings">${[
    permitRow({ id: "project-demo", name: uiText.text("workbench.session-source-specimens.project-demo"), line: uiText.text("workbench.session-source-specimens.line-filed", { dir: "~/code/molis-work", n: 12 }), on: true, note: { kind: "saving", label: uiText.text("workbench.session-source-specimens.saving") }, badges: renderBadge({ label: uiText.text("workbench.session-source-specimens.current") }), current: true }),
    permitRow({ id: "project-growth", name: uiText.text("workbench.session-source-specimens.project-growth"), line: uiText.text("workbench.session-source-specimens.line-readable", { dir: "~/work/growth", n: 8 }), on: true, note: onNote() }),
    permitRow({ id: "project-research", name: "Research", line: uiText.text("workbench.session-source-specimens.line-filed", { dir: "~/research", n: 5 }), on: false, note: offNote() }),
    permitRow({ id: "project-brand", name: uiText.text("workbench.session-source-specimens.project-brand"), line: uiText.text("workbench.session-source-specimens.line-filed", { dir: "~/brand", n: 3 }), on: false, note: { kind: "failed", text: uiText.text("workbench.session-source-specimens.not-saved-still-off"), retry: uiText.text("workbench.session-source-specimens.retry") } }),
  ].join("")}</div>`;
}

function edgesSpecimen(): string {
  const team = renderPermitRow({
    project: { id: "project-team", name: uiText.text("workbench.session-source-specimens.project-team") }, badges: renderBadge({ label: uiText.text("workbench.session-source-specimens.team") }), description: uiText.text("workbench.session-source-specimens.line-team", { dir: "~/team/site", n: 6 }), action: true,
    control: renderStatusMark({ label: uiText.text("workbench.session-source-specimens.not-open-yet"), tone: "quiet", plain: true }) + renderButton({ label: uiText.text("workbench.session-source-specimens.view-sessions"), variant: "secondary", size: "sm" }),
  });
  const long = permitRow({ id: "project-long", name: uiText.text("workbench.session-source-specimens.project-long"), line: uiText.text("workbench.session-source-specimens.line-filed", { dir: "~/Documents/Clients/2026/Q4/very-long-folder-name-for-the-annual-review-and-planning", n: 214 }), on: false });
  const empty = permitRow({ id: "project-empty", name: "Onboarding", line: uiText.text("workbench.session-source-specimens.line-none", { dir: "~/onboarding" }), on: false });
  return `<div class="mw-settings">${team}${long}${empty}</div>`;
}

export function renderSessionSourceSection(): string {
  return `<section class="mw-catalog__section" id="session-sources" data-primitive="session-sources"><h2>${escapeHtml(uiText.text("workbench.session-source-specimens.title"))}</h2>
    <div class="mw-catalog__specimens">
      ${figure(uiText.text("workbench.session-source-specimens.permit-states"), statesSpecimen())}
      ${figure(uiText.text("workbench.session-source-specimens.permit-edges"), edgesSpecimen())}
    </div>
  </section>`;
}

/** The parts' look is the design system's; the board only lays the specimens out. */
export const SESSION_SOURCE_SECTION_STYLES = SESSION_SOURCE_STYLES
  + "#session-sources .mw-catalog__specimens{grid-template-columns:minmax(0,1fr)}#session-sources .mw-settings{width:min(640px,100%)}";
