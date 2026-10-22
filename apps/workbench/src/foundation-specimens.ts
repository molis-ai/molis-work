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

// A picture far larger than its box, with a grid and numbered cells, so the point under the pointer can be followed.
const MEDIA_SPECIMEN = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" font-family="system-ui" font-size="40" fill="#8a7f78">`
  + Array.from({ length: 40 }, (_, i) => `<rect x="${(i % 8) * 200 + 4}" y="${Math.floor(i / 8) * 200 + 4}" width="192" height="192" rx="12" fill="${i % 2 ? "#e9e3dd" : "#d8cfc7"}"/><text x="${(i % 8) * 200 + 24}" y="${Math.floor(i / 8) * 200 + 64}">${i + 1}</text>`).join("") + `</svg>`);

export function renderFoundationSection(): string {
  const specimen = (caption: string, body: string) => `<figure class="mw-catalog__specimen"><figcaption>${caption}</figcaption><div class="mw-catalog-fade-box">${body}</div></figure>`;
  return `<section class="mw-catalog__section" id="foundation" data-primitive="foundation"><h2>视觉机制</h2>
    <p class="mw-catalog__hint">哪里都不画滚动条，照样能用滚轮、触控、键盘和焦点滚动，哪边还有更多由边缘渐隐告诉人。边缘渐隐：放不下的横向条只在真有更多的一侧淡出，28px 羽化、八个透明度采样；滚到头那一侧变清晰，放得下两侧都清晰；用键盘走到的项停在羽化之外；强制颜色下去掉渐隐、换回系统滚动条。</p>
    <div class="mw-catalog__specimens">
      ${specimen("放不下 · 右侧有更多", strip("视图（起点）"))}
      ${specimen("滚到中间 · 两侧都有", strip("视图（中间）", ' data-catalog-scroll="middle"'))}
      ${specimen("从右到左", strip("视图（从右到左）", ' dir="rtl"'))}
      ${specimen("放得下 · 不淡出", strip("视图（放得下）", "", VIEWS.slice(0, 3)))}
    </div>
    <p class="mw-catalog__hint">复制：剪贴板真的收下才显示「已复制」，约 2.5 秒后淡回；失败说复制失败；三种文字占同一宽度，连按以最后一次为准。折叠：按自然高度展开，途中反向从当前高度接着走，收起后里面不能获得焦点。会变的数字：等宽数字，宽度按取值范围里最宽的值预留，9 → 10、59 秒 → 1 分 0 秒都不推旁边的按钮。一直在长的记录：在底部就跟着，往上滚、按键或选字就停，新的行在「新消息」后面等着，点它一次平滑回到最新。媒体缩放：触控板捏合或滚轮加 ⌘/Ctrl、两指、双击都以所指的点为锚放大，图被约束在框内、小于框的方向居中；放大后普通滚轮与拖动平移，0 回到适应、+/− 缩放；只有这张图接管手势，页面自己的缩放不受影响。</p>
    <div class="mw-catalog__specimens">
      <figure class="mw-catalog__specimen"><figcaption>复制 · 成功与失败</figcaption><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary" data-catalog-copy="ok">复制</button><button type="button" class="mw-btn mw-btn--secondary" data-catalog-copy="fail">复制（会失败）</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>折叠 · 自然高度</figcaption>${renderCollapsible({ summary: "这一轮读过的文件（3）", body: "<p>specs/visual-ui-experience/spec.md</p><p>DESIGN.md</p><p>packages/design-system/src/styles/disclosure.ts</p>" })}</figure>
      <figure class="mw-catalog__specimen"><figcaption>会变的数字 · 宽度不跳</figcaption><div class="mw-catalog-row"><span class="mw-num" data-num-ghost="59 分 59 秒" data-catalog-elapsed>0 秒</span><button type="button" class="mw-btn mw-btn--secondary">停止</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>媒体缩放 · 以观察点为锚</figcaption><div class="mw-catalog-media" data-catalog-media><img alt="1600 × 1000 的网格图" src="${MEDIA_SPECIMEN}"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-catalog-media-zoom>原始尺寸</button></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>新写出的文字 · 2px（选用）</figcaption><div class="mw-catalog-stream" data-catalog-stream="2"></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>新写出的文字 · 6px（对照上限）</figcaption><div class="mw-catalog-stream" data-catalog-stream="6"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-catalog-stream-replay>重播</button><label class="mw-catalog-row"><input type="checkbox" data-catalog-stream-slow>慢放 4 倍</label></div></figure>
      <figure class="mw-catalog__specimen"><figcaption>跟随到底 · 往上滚就停</figcaption><div class="mw-catalog-follow" data-catalog-follow style="height:120px;overflow:auto;font-size:12px;line-height:20px"></div><div class="mw-catalog-row"><button type="button" class="mw-btn mw-btn--secondary" data-catalog-latest hidden>↓ 新消息</button></div></figure>
    </div>
    <p class="mw-catalog__hint">输入框自然高度：从两行加内边距起，随内容一行行长高，删掉就回落；上限取框自己的上限（默认 240px）与所在窗格高度的 40% 中较小的一个，到了上限在框内滚动，光标在末尾时整行可见；外面的页面不跳。引擎没有 field-sizing 时由同一份程序测量。</p>
    <div class="mw-catalog__specimens">
      <figure class="mw-catalog__specimen"><figcaption>输入框 · 随内容长高</figcaption><textarea class="mw-textarea mw-catalog-fit" data-fit rows="2" aria-label="试着写几行" placeholder="试着写几行，再删掉"></textarea></figure>
      <figure class="mw-catalog__specimen"><figcaption>输入框 · 达到上限（160px）</figcaption><textarea class="mw-textarea mw-catalog-fit" data-fit style="--fit-max:160px" rows="2" aria-label="达到上限的输入框">第 1 行：写到上限之后在框内滚动&#10;第 2 行：写到上限之后在框内滚动&#10;第 3 行：写到上限之后在框内滚动&#10;第 4 行：写到上限之后在框内滚动&#10;第 5 行：写到上限之后在框内滚动&#10;第 6 行：写到上限之后在框内滚动&#10;第 7 行：写到上限之后在框内滚动&#10;第 8 行：写到上限之后在框内滚动&#10;第 9 行：写到上限之后在框内滚动&#10;第 10 行：写到上限之后在框内滚动&#10;第 11 行：写到上限之后在框内滚动&#10;第 12 行：写到上限之后在框内滚动&#10;第 13 行：写到上限之后在框内滚动&#10;第 14 行：写到上限之后在框内滚动</textarea></figure>
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
