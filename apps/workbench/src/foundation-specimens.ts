import { renderCollapsible, renderToggleGroup, resolveCatalogSay, type CatalogSay } from "@molis-ai/molis-work-design-system";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The design mechanisms of specs/visual-ui-experience §5, on the component board: each specimen is the shipped markup and
 * the shipped sensor, so what the board shows is what a strip in the workbench does.
 */
const VIEW_KEYS = [
  "workbench.catalog-board.wb.fn-view-all",
  "workbench.catalog-board.wb.fn-view-today",
  "workbench.catalog-board.wb.fn-view-week",
  "workbench.catalog-board.wb.fn-view-waiting",
  "workbench.catalog-board.wb.fn-view-done",
  "workbench.catalog-board.wb.fn-view-delegated",
  "workbench.catalog-board.wb.fn-view-later",
  "workbench.catalog-board.wb.fn-view-archived",
  "workbench.catalog-board.wb.fn-view-shared",
] as const;

function strip(label: string, items: readonly string[], attrs = ""): string {
  const group = renderToggleGroup({ label, items: items.map((text, index) => ({ value: String(index), label: text, current: index === 0 })) });
  return group.replace(/^<(\w+) /, `<$1 data-overflow-fade data-catalog-fade${attrs} `);
}

// A picture far larger than its box, with a grid and numbered cells, so the point under the pointer can be followed.
const MEDIA_SPECIMEN = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" font-family="system-ui" font-size="40" fill="#8a7f78">`
  + Array.from({ length: 40 }, (_, i) => `<rect x="${(i % 8) * 200 + 4}" y="${Math.floor(i / 8) * 200 + 4}" width="192" height="192" rx="12" fill="${i % 2 ? "#e9e3dd" : "#d8cfc7"}"/><text x="${(i % 8) * 200 + 24}" y="${Math.floor(i / 8) * 200 + 64}">${i + 1}</text>`).join("") + `</svg>`);

export function renderFoundationSection(explicitSay?: CatalogSay): string {
  const say = resolveCatalogSay(explicitSay);
  const views = VIEW_KEYS.map(key => say(key));
  const specimen = (caption: string, body: string) => `<figure class="mw-catalog__specimen"><figcaption>${caption}</figcaption><div class="mw-catalog-fade-box">${body}</div></figure>`;
  const lines = Array.from({ length: 14 }, (_, index) => say("workbench.catalog-board.wb.fn-fit-line", { n: index + 1 })).join("&#10;");
  return `<section class="mw-catalog__section" id="foundation" data-primitive="foundation"><h2>${t("workbench.primitive-catalog.foundation")}</h2>
    <div class="mw-catalog__specimens">
      ${specimen(say("workbench.catalog-board.wb.fn-cap-overflow-end"), strip(say("workbench.catalog-board.wb.fn-lbl-start"), views))}
      ${specimen(say("workbench.catalog-board.wb.fn-cap-overflow-mid"), strip(say("workbench.catalog-board.wb.fn-lbl-mid"), views, ' data-catalog-scroll="middle"'))}
      ${specimen(say("workbench.catalog-board.wb.fn-cap-rtl"), strip(say("workbench.catalog-board.wb.fn-lbl-rtl"), views, ' dir="rtl"'))}
      ${specimen(say("workbench.catalog-board.wb.fn-cap-fits"), strip(say("workbench.catalog-board.wb.fn-lbl-fits"), views.slice(0, 3)))}
    </div>
    <div class="mw-catalog__specimens">
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-copy")}</figcaption><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary" data-catalog-copy="ok">${say("workbench.catalog-board.wb.fn-copy-ok")}</button><button type="button" class="mw-btn mw-btn--secondary" data-catalog-copy="fail">${say("workbench.catalog-board.wb.fn-copy-fail")}</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-disclosure")}</figcaption>${renderCollapsible({ summary: say("workbench.catalog-board.wb.fn-disclosure-sum"), body: "<p>specs/visual-ui-experience/spec.md</p><p>DESIGN.md</p><p>packages/design-system/src/styles/disclosure.ts</p>" })}</figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-num")}</figcaption><div class="mw-catalog-row"><span class="mw-num" data-num-ghost="${say("workbench.catalog-board.wb.fn-num-ghost")}" data-catalog-elapsed>${say("workbench.catalog-board.wb.fn-num-init")}</span><button type="button" class="mw-btn mw-btn--secondary">${say("workbench.catalog-board.wb.fn-stop")}</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-media")}</figcaption><div class="mw-catalog-media" data-catalog-media><img alt="${say("workbench.catalog-board.wb.fn-media-alt")}" src="${MEDIA_SPECIMEN}"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-catalog-media-zoom>${t("workbench.primitive-catalog.actual-size")}</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-stream-2")}</figcaption><div class="mw-catalog-stream" data-catalog-stream="2"></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-stream-6")}</figcaption><div class="mw-catalog-stream" data-catalog-stream="6"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-catalog-stream-replay>${say("workbench.catalog-board.wb.fn-replay")}</button><label class="mw-catalog-row"><input type="checkbox" data-catalog-stream-slow>${say("workbench.catalog-board.wb.fn-slow")}</label></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-follow")}</figcaption><div class="mw-catalog-follow" data-catalog-follow style="height:120px;overflow:auto;font-size:12px;line-height:20px"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary" data-catalog-latest hidden>${say("workbench.catalog-board.wb.fn-new-msg")}</button></div></figure>
    </div>
    <div class="mw-catalog__specimens">
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-fit")}</figcaption><textarea class="mw-textarea mw-catalog-fit" data-fit rows="2" aria-label="${say("workbench.catalog-board.wb.fn-fit-label")}" placeholder="${say("workbench.catalog-board.wb.fn-fit-placeholder")}"></textarea></figure>
      <figure class="mw-catalog__specimen"><figcaption>${say("workbench.catalog-board.wb.fn-cap-fit-max")}</figcaption><textarea class="mw-textarea mw-catalog-fit" data-fit style="--fit-max:160px" rows="2" aria-label="${say("workbench.catalog-board.wb.fn-fit-max-label")}">${lines}</textarea></figure>
    </div>
  </section>`;
}

/** The specimen boxes are narrower than the strips, so the strips overflow the way a narrow pane makes them. */
// The board's list-and-detail composition (catalog only): too narrow for a list beside its detail, the list goes above it
// instead of squeezing the detail to a sliver (VUX-30).
export const FOUNDATION_SPECIMEN_STYLES = `@media (max-width:600px){.mw-compose--split{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);height:440px}.mw-compose--split .mw-compose__list{max-height:160px;border-right:0;border-bottom:1px solid var(--line)}}`
  + `.mw-catalog-fit{width:min(100%,280px)}.mw-catalog-stream{width:min(100%,280px);min-height:120px;font-size:13px;line-height:20px}.mw-catalog-stream p{margin:0 0 8px}.mw-catalog-stream[data-slow]{--dur-reveal:360ms}`
  // The comparison's upper bound only; the product's one blurred keyframes is the design system's 2 px reveal.
  + `.mw-catalog-stream[data-catalog-stream="6"] .mw-fresh{animation-name:mw-catalog-fresh-6}@keyframes mw-catalog-fresh-6{from{opacity:0;filter:blur(6px)}}`
  + `.mw-catalog-media{width:min(100%,280px);height:180px;border-radius:8px;background:var(--wash)}.mw-catalog-fade-box{width:min(100%,280px)}.mw-catalog-fade-box [data-catalog-fade]{max-width:100%;overflow-x:auto;flex-wrap:nowrap}.mw-catalog-fade-box .mw-toggle{flex:none;white-space:nowrap}.mw-catalog-row{display:flex;align-items:center;gap:8px}`
  // The middle specimen opens scrolled to its fifth view, as a person scrolling would leave it; no script.
  + `[data-catalog-scroll=middle]>:nth-child(5){scroll-initial-target:nearest;scroll-snap-align:center}`;
