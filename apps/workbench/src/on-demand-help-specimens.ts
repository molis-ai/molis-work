import { escapeHtml, icon, renderButton, renderHelpButton, renderHelpContent, renderHelpDataScript, renderHelpFirstVisitTip, renderPreActionFacts, type MwHelpTopicData } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * Interactive `/__ui/catalog#on-demand-help` specimen for the 4 Batch 03 approved board additions (VUX-55, VUX-56):
 * 1) `mw-btn` expanded/pressed state (`aria-expanded="true"` / `aria-pressed="true"` with `--nav-active`)
 * 2) `.mw-facts` / `.mw-fact-row` pre-action facts block (neutral, ok, warn + action, out/external send)
 * 3) `.mw-help-content` structured help body (highlighted section, collapsible advanced, error + retry)
 * 4) `.mw-help-card` Scheme A anchored floating card + skippable first-visit tip + right-side continuation
 *
 * Demo interactivity lives in compiled TypeScript inside `@molis-ai/molis-work-design-system` (`src/browser/catalog.ts`).
 */
export const ON_DEMAND_HELP_SPECIMEN_STYLES = `
  .mw-help-spec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px;align-items:start}
  .mw-help-spec-card{padding:16px;border-radius:var(--r-card,12px);border:1px solid var(--line);background:var(--paper);display:flex;flex-direction:column;gap:12px}
  .mw-help-spec-card h3{margin:0;font-size:13px;font-weight:600;color:var(--muted)}
  .mw-help-spec-head{display:flex;align-items:center;gap:8px;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--line)}
  .mw-help-spec-head strong{font-size:15px;font-weight:600}
  .mw-help-spec-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .mw-help-spec-side{border:1px solid var(--line);border-radius:var(--r-card,12px);overflow:hidden;min-height:220px}
`.replace(/\n\s*/g, "");

export function renderOnDemandHelpSection(say: (key: string) => string): string {
  const topics: MwHelpTopicData[] = [{
    id: "specimen-page",
    title: say("workbench.on-demand-help-specimens.topic-title"),
    context: say("workbench.on-demand-help-specimens.topic-context"),
    sections: [
      { id: "what", heading: say("workbench.on-demand-help-specimens.section-what"), body: say("workbench.on-demand-help-specimens.what-body") },
      { id: "examples", heading: say("workbench.on-demand-help-specimens.section-examples"), items: [say("workbench.on-demand-help-specimens.example-1"), say("workbench.on-demand-help-specimens.example-2")] },
      { id: "who", heading: say("workbench.on-demand-help-specimens.section-who"), body: say("workbench.on-demand-help-specimens.who-body") },
      { id: "advanced", heading: say("workbench.on-demand-help-specimens.section-advanced"), collapsible: true, summary: say("workbench.on-demand-help-specimens.adv-summary"), items: [say("workbench.on-demand-help-specimens.adv-item-tz"), say("workbench.on-demand-help-specimens.adv-item-missed")] },
    ],
  }];
  const facts = renderPreActionFacts({
    heading: say("workbench.on-demand-help-specimens.fact-heading"),
    rows: [
      { icon: "file", text: say("workbench.on-demand-help-specimens.fact-read-text"), detail: say("workbench.on-demand-help-specimens.fact-read-detail") },
      { tone: "ok", icon: "sparkles", text: say("workbench.on-demand-help-specimens.fact-model-text"), detail: say("workbench.on-demand-help-specimens.fact-model-detail") },
      { tone: "warn", icon: "alert", text: say("workbench.on-demand-help-specimens.fact-missing-text"), detail: say("workbench.on-demand-help-specimens.fact-missing-detail"), action: { label: say("workbench.on-demand-help-specimens.fact-missing-action") } },
      { tone: "out", icon: "mail", text: say("workbench.on-demand-help-specimens.fact-email-text"), detail: say("workbench.on-demand-help-specimens.fact-email-detail") },
    ],
  });
  const staticBody = renderHelpContent({
    sections: topics[0]!.sections,
    focusId: "who",
  });
  const errorBody = renderHelpContent({
    sections: [],
    error: {
      title: say("common.help.load-failed-title"),
      body: say("workbench.on-demand-help-specimens.error-body"),
      retryLabel: say("common.help.retry"),
    },
  });
  return `<section class="mw-catalog__section" id="on-demand-help" data-primitive="on-demand-help" data-help-specimen>
    <h2>${escapeHtml(say("workbench.on-demand-help-specimens.title"))}</h2>
    <p class="mw-catalog__note">${escapeHtml(say("workbench.on-demand-help-specimens.note"))}</p>
    ${renderHelpDataScript(topics)}
    <div class="mw-help-spec-grid">
      <div class="mw-help-spec-card mw-help-anchor-col">
        <h3>${escapeHtml(say("workbench.on-demand-help-specimens.card-1"))}</h3>
        <div class="mw-help-spec-head">
          <strong>${escapeHtml(say("workbench.on-demand-help-specimens.new-schedule"))}</strong>
          ${renderHelpButton({ topic: "specimen-page", label: say("common.help.title"), id: "specimen-help-entry" })}
        </div>
        ${renderHelpFirstVisitTip({
          storageKey: "catalog-help-demo",
          text: say("workbench.on-demand-help-specimens.tip-text"),
          actionLabel: say("workbench.on-demand-help-specimens.open-help"),
          skipLabel: say("workbench.on-demand-help-specimens.skip"),
          topic: "specimen-page",
        })}
        <div class="mw-help-spec-row">
          ${renderHelpButton({ topic: "specimen-page", focus: "who", label: say("workbench.on-demand-help-specimens.about-this"), variant: "link", id: "specimen-who-entry" })}
          ${renderButton({ variant: "ghost", size: "sm", icon: "question", label: say("workbench.on-demand-help-specimens.expanded-ghost"), attrs: { "aria-expanded": "true" } })}
          ${renderButton({ variant: "secondary", size: "sm", label: say("workbench.on-demand-help-specimens.pressed-secondary"), attrs: { "aria-pressed": "true" } })}
        </div>
        <div class="mw-help-spec-row">
          ${renderButton({ variant: "secondary", size: "sm", label: say("workbench.on-demand-help-specimens.simulate-error"), attrs: { "data-help-specimen-fail": true, "aria-pressed": "false" } })}
          ${renderButton({ variant: "ghost", size: "sm", label: say("workbench.on-demand-help-specimens.reset-tip"), attrs: { "data-help-specimen-reset-tip": true } })}
        </div>
        <h3>${escapeHtml(say("workbench.on-demand-help-specimens.card-2"))}</h3>
        ${facts}
      </div>
      <div class="mw-help-spec-card">
        <h3>${escapeHtml(say("workbench.on-demand-help-specimens.card-3"))}</h3>
        ${staticBody}
      </div>
      <div class="mw-help-spec-card">
        <h3>${escapeHtml(say("workbench.on-demand-help-specimens.card-4"))}</h3>
        ${errorBody}
        <div class="mw-help-spec-side mw-help-side" data-help-specimen-side hidden>
          <div class="mw-help-side__head">${icon("question")}<strong class="mw-help-side__title">${escapeHtml(say("workbench.on-demand-help-specimens.side-title"))}</strong></div>
          <div class="mw-help-side__ctx" data-help-specimen-side-ctx></div>
          <div class="mw-help-side__body" data-help-specimen-side-body></div>
        </div>
      </div>
    </div>
  </section>`;
}
