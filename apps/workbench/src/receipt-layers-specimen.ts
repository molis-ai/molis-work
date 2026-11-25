import { resolveCatalogSay, type CatalogSay } from "@molis-ai/molis-work-design-system";
import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * A proposal for review (定样) on the component board: the supplement receipt (packages/design-system/src/input-receipts-client.ts)
 * with each kind of content in its own container, so a reader tells at a glance what Molis recorded, what the AI says about
 * itself, and what waits on them — instead of reading the label of every row. Drawn next to the shipped receipt for the same
 * supplement (its markup copied here, styled by the shipped sheet the 补充的回执 section loads), so the two compare line for
 * line. Nothing in the receipt's program changes until this is approved. The turns are the 补充的回执 section's sample data.
 */

/** The shipped receipt for steer-3, as `createInputReceipts` draws it opened. */
function shipped(say: CatalogSay): string {
  const quote = say("workbench.catalog-board.wb.rl-quote");
  const rows = (pairs: readonly (readonly [string, string])[]) => pairs.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join("");
  return `<details class="mw-receipt" data-state="read" open><summary><span class="mw-receipt__fact">${say("workbench.catalog-board.wb.rl-ai-read")}</span><span class="mw-receipt__claim"><b>${say("workbench.catalog-board.wb.rl-ai-says")}</b>${say("workbench.catalog-board.wb.rl-later-summary")}</span></summary>`
    + `<div class="mw-receipt__body"><p class="mw-receipt__note">${say("workbench.catalog-board.wb.rl-shipped-note")}</p><p class="mw-receipt__who">${say("workbench.catalog-board.wb.rl-in-record")}</p>`
    + `<dl class="mw-receipt__facts">${rows([[say("workbench.catalog-board.wb.rl-run-record"), say("workbench.catalog-board.wb.rl-run-record-val")], [say("workbench.catalog-board.wb.rl-added-step"), say("workbench.catalog-board.wb.rl-added-step-val")]])}</dl>`
    + `<div class="mw-receipt__claimed"><p class="mw-receipt__who">${say("workbench.catalog-board.wb.rl-ai-unchecked")}</p><dl>${rows([[say("workbench.catalog-board.wb.rl-how"), say("workbench.catalog-board.wb.rl-how-val")], [say("workbench.catalog-board.wb.rl-target"), say("workbench.catalog-board.wb.rl-target-val")], [say("workbench.catalog-board.wb.rl-affects"), say("workbench.catalog-board.wb.rl-affects-val")], [say("workbench.catalog-board.wb.rl-ai-quote-lbl"), `“${quote}”`], [say("workbench.catalog-board.wb.rl-source"), say("workbench.catalog-board.wb.rl-source-val")]])}</dl></div>`
    + `<div class="mw-receipt__acts"><button type="button" class="mw-btn mw-btn--sm mw-btn--ghost">${say("workbench.catalog-board.wb.rl-correct")}</button></div></div></details>`;
}

/** One zone of the layered receipt: its own container and a label that says whose words these are. */
function zone(kind: "record" | "claim" | "ask", label: string, glyph: string, body: string, aside = ""): string {
  return `<section class="mw-rl__zone" data-zone="${kind}"><p class="mw-rl__label"><span class="mw-rl__tag">${glyph}${label}</span>${aside}</p>${body}</section>`;
}

const ai = `<span class="mw-rl__ai" aria-hidden="true">${icon("sparkles")}</span>`;

/** The same supplement, layered: the summary is two chips (fact, claim); the body is the record, the claim, then the ids. */
function layered(say: CatalogSay): string {
  const quote = say("workbench.catalog-board.wb.rl-quote");
  const record = zone("record", say("workbench.catalog-board.wb.rl-molis-record"), icon("check"), `<ul class="mw-rl__facts">`
    + `<li><span class="mw-rl__key">${say("workbench.catalog-board.wb.rl-state")}</span><span>${say("workbench.catalog-board.wb.rl-state-val")}</span></li>`
    + `<li><span class="mw-rl__key">${say("workbench.catalog-board.wb.rl-step-key")}</span><span class="mw-rl__step">${icon("list-ordered")}${say("workbench.catalog-board.wb.rl-step-name")}<em>${say("workbench.catalog-board.wb.rl-step-wait")}</em></span></li></ul>`);
  const claim = zone("claim", say("workbench.catalog-board.wb.rl-ai-own"), ai, `<p class="mw-rl__say"><b>${say("workbench.catalog-board.wb.rl-later-step")}</b><span class="mw-rl__pill">${say("workbench.catalog-board.wb.rl-new-req")}</span></p>`
    + `<blockquote class="mw-rl__quote">${quote}</blockquote>`
    + `<ul class="mw-rl__facts"><li><span class="mw-rl__key">${say("workbench.catalog-board.wb.rl-target")}</span><span class="mw-rl__pill">${icon("target")}${say("workbench.catalog-board.wb.rl-target-val")}</span></li>`
    + `<li><span class="mw-rl__key">${say("workbench.catalog-board.wb.rl-will-change")}</span><span class="mw-rl__pills"><span class="mw-rl__pill">${say("workbench.catalog-board.wb.rl-scope")}</span><span class="mw-rl__pill">${say("workbench.catalog-board.wb.rl-criteria")}</span></span></li></ul>`,
  `<span class="mw-rl__unchecked">${say("workbench.catalog-board.wb.rl-unchecked")}</span>`);
  return `<details class="mw-rl" open><summary class="mw-rl__summary"><span class="mw-rl__chip" data-chip="fact"><i></i>${say("workbench.catalog-board.wb.rl-ai-read")}</span>`
    + `<span class="mw-rl__chip" data-chip="claim">${ai}${say("workbench.catalog-board.wb.rl-later-step")}</span><span class="mw-rl__more" aria-hidden="true">${icon("chevron-down")}</span></summary>`
    + `<div class="mw-rl__body">${record}${claim}`
    + `<p class="mw-rl__help">${icon("info")}${say("workbench.catalog-board.wb.rl-help")}</p>`
    + `<div class="mw-rl__foot"><span class="mw-rl__ids">${say("workbench.catalog-board.wb.rl-ids")}</span>${renderButton({ label: say("workbench.catalog-board.wb.rl-correct"), variant: "secondary", size: "sm" })}</div></div></details>`;
}

/** A supplement that asked the person something: the question is theirs to act on, so it is its own zone, folded or not. */
function asking(say: CatalogSay): string {
  return `<details class="mw-rl"><summary class="mw-rl__summary"><span class="mw-rl__chip" data-chip="fact"><i></i>${say("workbench.catalog-board.wb.rl-ai-read")}</span>`
    + `<span class="mw-rl__chip" data-chip="ask">${icon("question")}${say("workbench.catalog-board.wb.rl-wait-q")}</span><span class="mw-rl__more" aria-hidden="true">${icon("chevron-down")}</span></summary>`
    + `<div class="mw-rl__body">${zone("ask", say("workbench.catalog-board.wb.rl-your-turn"), icon("question"), `<p class="mw-rl__say"><b>${say("workbench.catalog-board.wb.rl-timeout-q")}</b></p><p class="mw-rl__hint">${say("workbench.catalog-board.wb.rl-wait-hint")}</p>`
      + `<div class="mw-rl__acts">${renderButton({ label: say("workbench.catalog-board.wb.rl-answer-btn"), variant: "primary", size: "sm" })}</div>`)}</div></details>`;
}

const bubble = (text: string) => `<p class="mw-rl-bubble">${text}</p>`;

export function renderReceiptLayersSpecimen(explicitSay?: CatalogSay): string {
  const say = resolveCatalogSay(explicitSay);
  return `<figure class="mw-catalog__specimen mw-rl-compare"><figcaption>${say("workbench.catalog-board.wb.rl-caption")}</figcaption>`
    + `<div class="mw-rl-cols"><div class="mw-rl-col"><p class="mw-rl-col__name">${say("workbench.catalog-board.wb.rl-col-current")}</p>${bubble(say("workbench.catalog-board.wb.rl-bubble-1"))}${shipped(say)}</div>`
    + `<div class="mw-rl-col"><p class="mw-rl-col__name">${say("workbench.catalog-board.wb.rl-col-layered")}</p>${bubble(say("workbench.catalog-board.wb.rl-bubble-1"))}${layered(say)}${bubble(say("workbench.catalog-board.wb.rl-timeout-q"))}${asking(say)}</div></div>`
    + `<ul class="mw-rl-legend"><li><span data-zone="record"></span>${say("workbench.catalog-board.wb.rl-legend-record")}</li><li><span data-zone="claim"></span>${say("workbench.catalog-board.wb.rl-legend-claim")}</li><li><span data-zone="ask"></span>${say("workbench.catalog-board.wb.rl-legend-ask")}</li><li>${say("workbench.catalog-board.wb.rl-legend-foot")}</li></ul></figure>`;
}

export const RECEIPT_LAYERS_STYLES = `.mw-rl-compare{grid-column:1/-1}.mw-rl-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;align-items:start}`
  + `.mw-rl-col{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:14px;background:var(--paper);box-shadow:0 0 0 1px var(--line)}.mw-rl-col__name{margin:0 0 4px;font-size:11px;color:var(--faint);letter-spacing:.04em}`
  + `.mw-rl-col .mw-receipt{align-self:flex-end;max-width:92%}.mw-rl-bubble{align-self:flex-end;max-width:85%;margin:8px 0 0;padding:8px 12px;border-radius:14px 14px 4px 14px;background:var(--wash);color:var(--ink);font-size:13px}.mw-rl-bubble:first-of-type{margin-top:0}`
  + `.mw-rl{align-self:flex-end;width:min(100%,340px);font-size:12px;color:var(--ink-soft)}#collab .mw-rl svg{width:12px;height:12px;flex:none}`
  + `.mw-rl__summary{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px;list-style:none;cursor:pointer;border-radius:8px}.mw-rl__summary::-webkit-details-marker{display:none}.mw-rl__summary:focus-visible{outline:var(--focus-stroke);outline-offset:2px}`
  + `.mw-rl__chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;line-height:1}`
  + `.mw-rl__chip[data-chip=fact]{background:var(--green-soft);color:var(--green)}.mw-rl__chip[data-chip=fact] i{width:6px;height:6px;border-radius:50%;background:var(--green)}`
  + `.mw-rl__chip[data-chip=claim]{padding-left:3px;border:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft);color:var(--accent)}.mw-rl__chip[data-chip=ask]{background:var(--amber-soft);color:var(--amber)}`
  + `.mw-rl__more{display:inline-grid;place-items:center;color:var(--faint);transition:transform var(--dur-hover,130ms) var(--ease-quint)}.mw-rl[open] .mw-rl__more{transform:rotate(180deg)}`
  + `.mw-rl__ai{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;background:var(--accent-soft);color:var(--accent)}#collab .mw-rl__ai svg{width:10px;height:10px}`
  + `.mw-rl__body{display:grid;gap:8px;margin-top:8px}`
  + `.mw-rl__zone{display:grid;gap:8px;padding:10px 12px;border-radius:12px}.mw-rl__zone[data-zone=record]{--zone:var(--green);background:var(--green-soft)}`
  + `.mw-rl__zone[data-zone=claim]{--zone:var(--accent);border:1px dashed color-mix(in srgb,var(--accent) 40%,transparent);background:var(--accent-soft)}.mw-rl__zone[data-zone=ask]{--zone:var(--amber);background:var(--amber-soft)}`
  + `.mw-rl__label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0}.mw-rl__tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:var(--muted)}`
  + `.mw-rl__zone .mw-rl__tag{color:var(--zone)}.mw-rl__unchecked{padding:0 6px;border-radius:6px;background:var(--paper);font-size:11px;color:var(--muted)}`
  + `.mw-rl__facts{display:grid;gap:6px;margin:0;padding:0;list-style:none}.mw-rl__facts li{display:grid;grid-template-columns:52px minmax(0,1fr);align-items:baseline;gap:8px}`
  + `.mw-rl__key{font-size:11px;color:var(--faint)}.mw-rl__facts li>span:last-child{justify-self:start;color:var(--ink)}`
  + `.mw-rl__step{display:inline-flex;flex-wrap:wrap;align-items:center;gap:5px}.mw-rl__step em{padding:0 6px;border-radius:6px;background:var(--paper);box-shadow:0 1px 2px color-mix(in srgb,var(--shadow-color,#000) 8%,transparent);color:var(--muted);font-size:11px;font-style:normal}`
  + `.mw-rl__say{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;font-size:13px}.mw-rl__say b{color:var(--ink);font-weight:500}`
  + `.mw-rl__quote{margin:0;padding:2px 0 2px 10px;border-left:2px solid color-mix(in srgb,var(--accent) 50%,transparent);color:var(--ink-soft);font-size:12px;line-height:1.6}.mw-rl__quote::before{content:"“"}.mw-rl__quote::after{content:"”"}`
  + `.mw-rl__pills{display:flex;flex-wrap:wrap;gap:4px}.mw-rl__pill{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:6px;background:var(--paper);color:var(--zone,var(--ink-soft));font-size:11px;box-shadow:0 1px 2px color-mix(in srgb,var(--shadow-color,#000) 8%,transparent)}`
  + `.mw-rl__hint{margin:0;color:var(--muted)}.mw-rl__acts{display:flex;gap:6px}`
  + `.mw-rl__help{display:flex;align-items:center;gap:5px;margin:0;padding:0 2px;font-size:11px;color:var(--faint)}`
  + `.mw-rl__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px}.mw-rl__ids{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums}`
  + `.mw-rl-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:12px 0 0;padding:0;list-style:none;font-size:12px;color:var(--muted)}.mw-rl-legend li{display:inline-flex;align-items:center;gap:6px}`
  + `.mw-rl-legend span{width:14px;height:10px;border-radius:4px}.mw-rl-legend [data-zone=record]{background:var(--green-soft);box-shadow:0 0 0 1px color-mix(in srgb,var(--green) 35%,transparent)}.mw-rl-legend [data-zone=claim]{border:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft)}.mw-rl-legend [data-zone=ask]{background:var(--amber-soft)}`
  + `@media (prefers-reduced-motion:reduce){.mw-rl__more{transition:none}}`;
