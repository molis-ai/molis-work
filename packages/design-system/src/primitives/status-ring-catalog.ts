import { renderStateRing, STATE_RING_FAMILIES, STATE_RING_LABELS } from "@molis-ai/molis-work-plugin-sdk/ui";

export function renderStateRingCatalog(): string {
  const choices = STATE_RING_FAMILIES.map(family => `<div class="mw-ring-catalog__family">${renderStateRing({ state: family.key, size: 28 })}<div><strong>${family.label}</strong><div class="mw-ring-catalog__aliases">${family.states.map(state => `<button type="button" class="mw-btn mw-btn--ghost" data-ring-choice="${state}" aria-pressed="${state === "done"}">${STATE_RING_LABELS[state]}</button>`).join("")}</div></div></div>`).join("");
  return `<section class="mw-catalog__section" id="status-ring" data-primitive="status-ring"><h2>状态 · 轻量环刻</h2>
    <p class="mw-catalog__hint">43 个状态复用 21 套样式。外观可以共用，含义由旁边的文字说明。进行中安静停驻，有真实执行才持续流动；完成、已保存与本轮结束共用对勾，各自保留原意。</p>
    <div class="mw-ring-catalog__preview">
      <div class="mw-ring-catalog__hero">${renderStateRing({ state: "done", size: 64, label: "已完成" })}<strong data-ring-chosen>已完成</strong></div>
      <div class="mw-ring-catalog__row">${renderStateRing({ state: "done" })}<span>整理本周项目进展</span><small data-ring-chosen>已完成</small></div>
      <div class="mw-ring-catalog__sizes">${[12, 16, 20, 32].map(size => `<span>${renderStateRing({ state: "done", size })}<small>${size}px</small></span>`).join("")}</div>
    </div>
    <p class="mw-catalog__hint">点下面的状态，观察同一组件在行内和大尺寸中的变化。部分完成的绿/黄和中断的灰/暖棕默认只表达两类结果；有真实数量时才传入完成比例。同步保持环面翻转，重试向后蓄力再展开。系统启用减少动态效果后全部静止。</p>
    <div class="mw-ring-catalog__grid">${choices}</div>
    <style>
      #status-ring svg.mw-state-ring { width: var(--ring-size); height: var(--ring-size); }
      .mw-ring-catalog__preview { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; padding: 24px 0; }
      .mw-ring-catalog__hero { display: grid; justify-items: center; gap: 8px; min-width: 120px; }
      .mw-ring-catalog__row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; padding: 16px 0; }
      .mw-ring-catalog__row small { color: var(--muted); }
      .mw-ring-catalog__sizes { display: flex; align-items: center; gap: 20px; }
      .mw-ring-catalog__sizes > span { display: grid; justify-items: center; gap: 8px; }
      .mw-ring-catalog__sizes small { color: var(--muted); }
      .mw-ring-catalog__grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,280px),1fr)); gap: 0 24px; }
      .mw-ring-catalog__family { display: flex; align-items: flex-start; gap: 10px; padding: 16px 0; border-top: 1px solid var(--line); }
      .mw-ring-catalog__family > svg { margin-top: 2px; }
      .mw-ring-catalog__aliases { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0 -6px; }
      .mw-ring-catalog__aliases .mw-btn { font-size: 12px; padding: 0 6px; }
      .mw-ring-catalog__aliases [aria-pressed=true] { background: var(--nav-active); }
    </style>
    <script>
      document.getElementById('status-ring').addEventListener('click', event => {
        const choice = event.target.closest('[data-ring-choice]'); if (!choice) return;
        const root = choice.closest('#status-ring'), label = choice.textContent;
        root.querySelectorAll('[data-ring-choice]').forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
        root.querySelectorAll('.mw-ring-catalog__preview [data-mw-state]').forEach(ring => {
          ring.dataset.mwState = choice.dataset.ringChoice;
          if (ring.hasAttribute('aria-label')) ring.setAttribute('aria-label', label);
        });
        root.querySelectorAll('[data-ring-chosen]').forEach(node => { node.textContent = label; });
      });
    </script>
  </section>`;
}
