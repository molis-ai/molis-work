import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";

/** The Goal's Frame surface: its summary, the canvas of what it gathers, the picker for adding content, and the zoom tools. Hidden until the Frame opens. */
export function renderGoalFrameStage({ L, icon }: { L(text: string): string; icon(name: MolisWorkIcon): string }): string {
  return `<section class="goal-frame-surface" data-goal-frame-surface aria-label="Frame" hidden>
    <header class="frame-goal-summary"><div class="frame-goal-heading"><h1 data-frame-goal-title></h1><span data-frame-goal-status></span></div><p data-frame-goal-outcome></p>    <div class="frame-goal-actions mw-toolbar"><button class="mw-btn mw-btn--secondary" type="button" data-frame-add-content>${icon("plus")}${L("添加已有内容")}</button><button class="mw-btn mw-btn--secondary" type="button" data-frame-goal-work>${icon("terminal")}${L("打开工作区")}</button><button class="mw-btn mw-btn--ghost" type="button" data-frame-goal-locate>${icon("target")}${L("在关系画布中定位")}</button></div></header>
    <div class="goal-frame-canvas" data-frame-canvas><div class="frame-empty mw-empty" data-frame-empty><strong>${L("把这项目标需要的内容放在这里")}</strong><p>${L("从目录拖入消息、会话或资料，在同一个画布上组织工作。")}</p><button type="button" class="mw-btn mw-btn--primary" data-frame-add-content>${icon("plus")}${L("添加已有内容")}</button></div>
      <div class="goal-frame-world" data-frame-world></div>
    </div>
    <dialog class="frame-picker mw-dialog" data-frame-picker aria-labelledby="frame-picker-title">
      <header><h2 id="frame-picker-title">${L("添加已有内容")}</h2><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-frame-picker-close aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="frame-picker-tools mw-input-group"><input class="mw-input" type="search" data-frame-picker-search placeholder="${L("搜索标题或来源")}" aria-label="${L("搜索标题或来源")}" autofocus><select class="mw-select" data-frame-picker-kind aria-label="${L("内容来源")}"><option value="all">${L("全部来源")}</option><option value="feed">Feed</option><option value="inbox">Inbox</option><option value="session">${L("会话")}</option><option value="artifact">${L("成果")}</option></select></div>
      <div class="frame-picker-list mw-scroll" data-frame-picker-list></div>
      <footer><span>${L("添加引用，原内容保持在所属来源。")}</span><button type="button" class="mw-btn mw-btn--secondary" data-frame-picker-close>${L("取消")}</button></footer>
    </dialog>
    <footer class="goal-canvas-tools goal-frame-tools"><div role="group" aria-label="${L("画布缩放")}"><button type="button" data-frame-zoom="out" aria-label="${L("缩小")}">−</button><output data-frame-zoom-value>100%</output><button type="button" data-frame-zoom="in" aria-label="${L("放大")}">+</button></div></footer>
  </section>`;
}
