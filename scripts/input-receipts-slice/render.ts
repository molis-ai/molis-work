/**
 * The two layouts around one conversation. Everything outside the conversation is decoration and says so; the
 * conversation itself (thread, tray, composer) is the same code in both, so the same input reads the same in the
 * Assistant panel and in Coding.
 */
import { button, esc, icon } from "./html.ts";
import { clock } from "./labels.ts";
import { endCard, hostNote, inputRow, recoveryBanner, tray, type PartContext } from "./render-parts.ts";
import type { Recording } from "./facts.ts";
import type { InputRow, ThreadRow } from "./scene-state.ts";
import { offers, restingCheckpoint, sceneOf, view as viewOf, type Ui, type SendMode } from "./ui-state.ts";

const MODES: readonly { readonly mode: SendMode; readonly label: string; readonly note: string; readonly recorded: boolean }[] = [
  { mode: "next-boundary", label: "补充", note: "下一个模型边界生效（默认）", recorded: true },
  { mode: "interrupt", label: "打断并改向", note: "当前回复作废，同一轮接着走", recorded: false },
  { mode: "after-run", label: "这一轮结束后再做", note: "排到下一轮开头（会话排队）", recorded: false },
  { mode: "side", label: "只问不改", note: "Coding 下一阶段", recorded: false },
];

function assistantName(ui: Ui): string { return ui.layout === "coding" ? "Coding" : "助理"; }

function threadRow(row: ThreadRow, ctx: PartContext, lastEnd: boolean): string {
  const { ui } = ctx;
  switch (row.kind) {
    case "task": return `<article class="rc-turn rc-turn--you"><div class="rc-bubble rc-bubble--task"><header><span>你</span>${row.atMs === undefined ? "" : `<time>${clock(row.atMs)}</time>`}</header><p>${esc(row.text)}</p></div></article>`;
    case "assistant": return `<article class="rc-turn"><div class="rc-bubble rc-bubble--ai"><header><span>${esc(assistantName(ui))}</span></header><p>${esc(row.text)}</p></div></article>`;
    case "ack-call": return `<p class="rc-call">${icon("sparkles")}<span>${esc(assistantName(ui))}说明了 ${String(row.count)} 条输入怎么处理<small>系统工具 acknowledge-inputs · 它自己的声明，不是执行记录</small></span></p>`;
    case "question": return `<section class="rc-question" aria-label="${esc(assistantName(ui))}在等你回答"><h4>${icon("question")}${esc(row.why)}</h4><p>${esc(row.prompt)}</p><div class="rc-options">${row.options.map(one => button({ label: one, variant: "secondary", action: "answer", disabled: row.answered || !ctx.offer.answer, title: row.answered || ctx.offer.answer ? undefined : "预览按录好的顺序走：先放那句补充，再回答" })).join("")}</div>${row.answered ? '<p class="rc-note">已回答。</p>' : '<p class="rc-note">回答之后，你刚补充的那句才会被 AI 读到。</p>'}</section>`;
    case "host": return hostNote(row);
    case "recovered": return `<p class="rc-call">${icon("history")}<span>${esc(row.note)}</span></p>`;
    case "divider": return `<p class="rc-divider"><span>${esc(row.label)}</span></p>`;
    case "end": return endCard(row, ctx, lastEnd);
    case "input": return inputRow(row, ctx);
  }
}

function thread(ctx: PartContext): string {
  const rows = ctx.view.rows;
  const lastEnd = rows.map(row => row.kind).lastIndexOf("end");
  const restart = ctx.view.scene.id === "restart";
  return `<div class="rc-thread" role="log" aria-label="对话" tabindex="0" data-thread>
    ${restart ? recoveryBanner(ctx.view) : ""}
    ${rows.map((row, index) => threadRow(row, ctx, index === lastEnd)).join("")}
  </div>`;
}

function chip(ui: Ui): string {
  return `<div class="rc-chip" role="group" aria-label="这句话发给谁">
    ${button({ label: "补充这一轮", variant: "secondary", action: "chip", data: { chip: "this-run" }, pressed: ui.chip === "this-run", icon: "send" })}
    ${button({ label: "写进问卷：补充要求", variant: "ghost", action: "chip", data: { chip: "questionnaire" }, disabled: true, title: "这份问卷没有自由文本题；这一半由交互线实现" })}
    <small>有问题等回答，这句话会排在回答之后，由 AI 读到</small></div>`;
}

function composer(ctx: PartContext): string {
  const { ui, offer, view } = ctx;
  const mode = MODES.find(one => one.mode === ui.sendMode) ?? MODES[0];
  const sendable = offer.send !== undefined;
  return `<form class="rc-composer" data-composer aria-label="发给${esc(assistantName(ui))}">
    ${view.phase.awaiting ? chip(ui) : ""}
    <div class="rc-pill">
      <div class="rc-mode">
        ${button({ label: mode?.label ?? "补充", variant: "ghost", action: "send-menu", expanded: ui.menu === "send", haspopup: "menu", icon: "chevron-up" })}
        ${ui.menu === "send" ? `<div class="rc-menu" role="menu" aria-label="发送方式">${MODES.map(one => `<button type="button" role="menuitemradio" aria-checked="${String(one.mode === ui.sendMode)}" class="rc-menu-item" data-action="send-mode" data-mode="${one.mode}"${one.recorded ? "" : " disabled"}><b>${one.label}</b><small>${one.recorded ? one.note : `${one.note} · 预览没录这种方式`}</small></button>`).join("")}</div>` : ""}
      </div>
      <input class="rc-input-field" type="text" autocomplete="off" data-composer-input value="${esc(ui.note)}" placeholder="${esc(sendable ? "回车播放录好的下一条输入" : "这里没有录好的下一条输入")}" aria-label="发给${esc(assistantName(ui))}">
      ${button({ label: "发送", icon: "send", iconOnly: true, variant: "primary", type: "submit", disabled: !sendable })}
    </div>
    <p class="rc-hint">${sendable ? `录好的下一条：「${esc(offer.send?.text ?? "")}」· 发送会把它播放出来；预览不发送新内容` : "预览不发送新内容：只播放录好的输入。点「演示」里的场景或「下一步」往下走"}</p>
  </form>`;
}

function panelHead(ctx: PartContext): string {
  const { view } = ctx;
  const task = view.rows.find(row => row.kind === "task");
  const state = view.phase.awaiting ? "等你回答" : view.phase.ended ? "已结束" : "运行中";
  return `<header class="rc-panel-head"><span class="rc-dot" data-state="${view.phase.awaiting ? "wait" : view.phase.ended ? "done" : "run"}" aria-hidden="true"></span><strong>${esc(task?.kind === "task" ? task.text : "")}</strong><span class="rc-state">${state}</span></header>`;
}

function conversation(ctx: PartContext): string {
  return `${panelHead(ctx)}${thread(ctx)}<div class="rc-foot">${tray(ctx.view.tray, ctx.ui.trayOpen)}${composer(ctx)}</div>`;
}

function assistantScene(inner: string): string {
  return `<section class="scene scene--assistant" data-scene="assistant">
    <div class="pv-sheet pv-goal" inert>
      <p class="pv-location">${icon("target")}Goals<span>›</span>季度回顾</p>
      <h1>和 A 客户的季度回顾</h1><p class="pv-lede">把本季度的数据、议程和提醒准备好。</p>
      <ul class="pv-rows"><li>${icon("file")}上季度数据摘要<span>今天</span></li><li>${icon("file")}议程草稿<span>今天</span></li><li>${icon("check")}会前提醒<span>昨天</span></li></ul>
      <p class="pv-decor-note">工作区内容为示意，不可操作。</p>
    </div>
    <section class="rc-panel rc-panel--assistant" aria-label="助理">${inner}</section>
  </section>`;
}

function codingScene(inner: string): string {
  return `<section class="scene scene--coding" data-scene="coding"><div class="pv-sheet cd-layout">
    <nav class="cd-directory" aria-label="编码会话（示意）"><p class="cd-head">会话</p><ul><li aria-current="true">${icon("code")}登录接口的失败路径测试</li><li>${icon("code")}重构错误处理</li><li>${icon("code")}修一个样式问题</li></ul></nav>
    <section class="rc-panel rc-panel--coding" aria-label="Coding">${inner}</section>
    <aside class="cd-review" aria-label="任务与变更（示意）"><p class="cd-head">任务与变更</p>
      <p class="cd-empty">任务板步骤、来源徽标和变更集归因要等后面的切片有了真实数据才画。这里不画假的。</p></aside>
  </div></section>`;
}

export function renderStage(rec: Recording, ui: Ui): string {
  const scene = sceneOf(rec, ui.sceneId);
  const view = viewOf(rec, ui);
  const ctx: PartContext = {
    ui, view, offer: offers(rec, ui),
    canInsist: (row: InputRow) => row.headline.key === "explained:not-adopted" && scene.checkpoints.some(one => one.id === "corrected") && restingCheckpoint(scene, ui.cursor)?.id === "settled",
  };
  const inner = conversation(ctx);
  return ui.layout === "assistant" ? assistantScene(inner) : codingScene(inner);
}
