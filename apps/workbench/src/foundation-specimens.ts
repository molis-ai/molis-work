import { renderCollapsible, renderToggleGroup } from "@molis-ai/molis-work-design-system";

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
    <p class="mw-catalog__hint">复制：剪贴板真的收下才显示「已复制」，约 2.5 秒后淡回；失败说复制失败；三种文字占同一宽度，连按以最后一次为准。折叠：按自然高度展开，途中反向从当前高度接着走，收起后里面不能获得焦点。会变的数字：等宽数字，宽度按取值范围里最宽的值预留，9 → 10、59 秒 → 1 分 0 秒都不推旁边的按钮。一直在长的记录：在底部就跟着，往上滚、按键或选字就停，新的行在「新消息」后面等着，点它一次平滑回到最新。</p>
    <div class="mw-catalog__specimens">
      <figure class="mw-catalog__specimen"><figcaption>复制 · 成功与失败</figcaption><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary" data-catalog-copy="ok">复制</button><button type="button" class="mw-btn mw-btn--secondary" data-catalog-copy="fail">复制（会失败）</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>折叠 · 自然高度</figcaption>${renderCollapsible({ summary: "这一轮读过的文件（3）", body: "<p>specs/visual-ui-experience/spec.md</p><p>DESIGN.md</p><p>packages/design-system/src/styles/disclosure.ts</p>" })}</figure>
      <figure class="mw-catalog__specimen"><figcaption>会变的数字 · 宽度不跳</figcaption><div class="mw-catalog-row"><span class="mw-num" data-num-ghost="59 分 59 秒" data-catalog-elapsed>0 秒</span><button type="button" class="mw-btn mw-btn--secondary">停止</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>跟随到底 · 往上滚就停</figcaption><div class="mw-catalog-follow" data-catalog-follow style="height:120px;overflow:auto;font-size:12px;line-height:20px"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary" data-catalog-latest hidden>↓ 新消息</button></div></figure>
    </div>
  </section>`;
}

/** The specimen boxes are narrower than the strips, so the strips overflow the way a narrow pane makes them. */
export const FOUNDATION_SPECIMEN_STYLES = `.mw-catalog-fade-box{width:min(100%,280px)}.mw-catalog-fade-box [data-catalog-fade]{max-width:100%;overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap}.mw-catalog-fade-box .mw-toggle{flex:none;white-space:nowrap}.mw-catalog-row{display:flex;align-items:center;gap:8px}`
  // The middle specimen opens scrolled to its fifth view, as a person scrolling would leave it; no script.
  + `[data-catalog-scroll=middle]>:nth-child(5){scroll-initial-target:nearest;scroll-snap-align:center}`;
