import { renderToggleGroup } from "@molis-ai/molis-work-design-system";

/**
 * The design mechanisms of specs/visual-ui-experience §5, on the component board: each specimen is the shipped markup and
 * the shipped sensor, so what the board shows is what a strip in the workbench does.
 */
const VIEWS = ["全部", "今天", "本周", "等待中", "已完成", "已委派", "稍后", "归档", "共享给我"];

function strip(label: string, attrs = "", items = VIEWS): string {
  const group = renderToggleGroup({ label, items: items.map((text, index) => ({ value: String(index), label: text, current: index === 0 })) });
  return group.replace(/^<(\w+) /, `<$1 data-overflow-fade data-catalog-fade${attrs} `);
}

export function renderFoundationSection(): string {
  const specimen = (caption: string, body: string) => `<figure class="mw-catalog__specimen"><figcaption>${caption}</figcaption><div class="mw-catalog-fade-box">${body}</div></figure>`;
  return `<section class="mw-catalog__section" id="foundation" data-primitive="foundation"><h2>视觉机制</h2>
    <p class="mw-catalog__hint">边缘渐隐：放不下的横向条只在真有更多的一侧淡出，28px 羽化、八个透明度采样；滚到头那一侧变清晰，放得下两侧都清晰；用键盘走到的项停在羽化之外；强制颜色下改为显示滚动条。</p>
    <div class="mw-catalog__specimens">
      ${specimen("放不下 · 右侧有更多", strip("视图（起点）"))}
      ${specimen("滚到中间 · 两侧都有", strip("视图（中间）", ' data-catalog-scroll="middle"'))}
      ${specimen("从右到左", strip("视图（从右到左）", ' dir="rtl"'))}
      ${specimen("放得下 · 不淡出", strip("视图（放得下）", "", VIEWS.slice(0, 3)))}
    </div>
  </section>`;
}

/** The specimen boxes are narrower than the strips, so the strips overflow the way a narrow pane makes them. */
export const FOUNDATION_SPECIMEN_STYLES = `.mw-catalog-fade-box{width:min(100%,280px)}.mw-catalog-fade-box [data-catalog-fade]{max-width:100%;overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap}.mw-catalog-fade-box .mw-toggle{flex:none;white-space:nowrap}`
  // The middle specimen opens scrolled to its fifth view, as a person scrolling would leave it; no script.
  + `[data-catalog-scroll=middle]>:nth-child(5){scroll-initial-target:nearest;scroll-snap-align:center}`;
