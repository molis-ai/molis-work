import type { ReuseCandidates } from "./contracts.js";

/** The same partial is used in the research dialog and the interactive design fixture. */
export function renderReuseChoices(data: ReuseCandidates, escape: (value: unknown) => string, readText: (key: string) => string): string {
  const t = (key: string) => escape(readText(key));
  return `<section class="alc-reuse"><h3>${t("alchemist.ui.pick-up-where-left-off")}</h3><p class="alc-muted">${t("alchemist.ui.choose-results-methods-reuse-time-earlier-conclusions-serve")}</p>
    ${!data.available ? `<p role="status">${t("alchemist.ui.results-entry-isn-t-connected-yet-can-reuse")}</p>` : ""}
    ${!data.artifacts.length && data.available ? `<p class="alc-muted">${t("alchemist.ui.no-earlier-results-read-yet-after-research-run")}</p>` : data.artifacts.map((item, index) => `<label class="alc-reuse-choice"><input class="mw-checkbox" type="checkbox" name="reuse-artifact" value="${index}"><span><strong>${escape(item.title)}</strong><small>${t("alchemist.ui.fixed-version")} ${item.reference.version} · ${escape(item.sourcePlugin)} · ${escape(item.createdAt.slice(0, 10))}</small><span>${escape(item.excerpt)}</span>${item.warnings.map(w => `<small class="alc-reuse-warning">${escape(w)}</small>`).join("")}</span></label>`).join("")}
    ${data.truncated ? `<p class="alc-muted">${t("alchemist.ui.only-40-most-recent-readable-results-shown-keep")}</p>` : ""}
    ${data.methods.length ? `<h3>${t("alchemist.ui.research-s-methods")}</h3>${data.methods.map(item => `<label class="alc-reuse-choice"><input class="mw-checkbox" type="checkbox" name="reuse-method" value="${escape(item.id)}" checked><span><strong>${escape(item.methodChange)}</strong><small>${t("alchemist.ui.method-version")} ${item.version}</small><span>${t("alchemist.ui.examples-where-applies")}：${escape(item.positiveExamples.join("；") || readText("alchemist.ui.not-filled-check-before-adopting"))}</span><span>${t("alchemist.ui.examples-where-doesn-t-apply")}：${escape(item.negativeExamples.join("；") || readText("alchemist.ui.not-filled-check-before-adopting"))}</span></span></label>`).join("")}` : `<p class="alc-muted">${t("alchemist.ui.no-confirmed-method-applies-time-can-annotate-research")}</p>`}
    <label class="alc-field">${t("alchemist.ui.why-results-reused-what-still-needs-rechecking")}<textarea class="mw-textarea" name="reuse-reason" rows="2" maxlength="2000" placeholder="${t("alchemist.ui.example-reuse-interview-questions-recheck-pricing-competitor-cha")}"></textarea></label>
    <button type="button" class="mw-btn mw-btn--ghost" data-alc-action="reuse-assess">${t("alchemist.ui.check-whether-selected-items-apply")}</button><div data-reuse-assessment role="status" aria-live="polite"></div></section>`;
}

export const WORK_REUSE_STYLES = `
.alc-reuse { margin:24px 0 8px; border-top:1px solid var(--line); padding-top:4px; }
.alc-reuse h3 { font-size:15px; font-weight:500; margin:24px 0 8px; }
.alc-reuse-choice { display:flex; align-items:flex-start; gap:12px; padding:16px 0; border-bottom:1px solid var(--line); cursor:pointer; }
.alc-reuse-choice > input { flex:none; margin-top:4px; }
.alc-reuse-choice > span { display:flex; flex-direction:column; gap:8px; min-width:0; line-height:1.6; overflow-wrap:anywhere; }
.alc-reuse-choice strong { font-weight:500; }
.alc-reuse-choice small { color:var(--muted); font-size:12px; }
.alc-reuse-choice .alc-reuse-warning { color:var(--tone-blocked); }
[data-reuse-assessment] { margin-top:12px; line-height:1.7; }
`;
