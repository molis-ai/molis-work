/** The preview's own chrome: the title bar (what this page is, the layout and theme switches) and the demo controls. */
import { button, esc, icon } from "./html.ts";
import type { Recording } from "./facts.ts";
import { sceneOf, restingCheckpoint, atEnd, type Ui } from "./ui-state.ts";

const SCENE_NOTE: Readonly<Record<string, string>> = {
  main: "中途补充、AI 的说明、读到没说明、没采纳，以及你坚持之后的下一轮",
  "stopped-carry": "一轮被停下，没读到的留在会话里；带到下一轮",
  "stopped-withdraw": "同上，但全部撤回",
  question: "有问题等回答时补充一句（目标芯片）",
  restart: "宿主被强杀，重启后核对并收口",
};

export function renderTitlebar(rec: Recording, ui: Ui): string {
  const { source } = rec;
  const sha = source.prologue.slice(0, 8);
  const layoutButton = (layout: "assistant" | "coding", label: string): string =>
    button({ label, variant: "ghost", action: "layout", data: { layout }, pressed: ui.layout === layout });
  return `<header class="pv-titlebar">
    <p class="pv-brand">${icon("brand")}<strong>Molis Work</strong>
      <span class="pv-caption"><span class="pv-dot" aria-hidden="true"></span>回执预览 R0<span class="pv-caption-more"> · 事件是 Prologue <code>${esc(sha)}</code>${source.dirty ? "（有未提交改动）" : ""} 的真实 SDK 用脚本模型录下的，不是真实运行；Molis 层为模拟，不连接 Home</span></span></p>
    <div class="pv-tools">
      <div class="pv-switch" role="group" aria-label="布局">${layoutButton("assistant", "助理")}${layoutButton("coding", "Coding")}</div>
      <div class="pv-demo">${button({ label: "演示", variant: "ghost", icon: "tune", action: "demo", expanded: ui.menu === "demo", haspopup: "dialog" })}${ui.menu === "demo" ? demoPanel(rec, ui) : ""}</div>
      ${button({ label: ui.theme === "dark" ? "浅色" : "深色", variant: "ghost", icon: ui.theme === "dark" ? "sun" : "moon", action: "theme" })}
    </div></header>`;
}

function demoPanel(rec: Recording, ui: Ui): string {
  const scene = sceneOf(rec, ui.sceneId);
  const here = restingCheckpoint(scene, ui.cursor);
  const done = atEnd(rec, ui);
  return `<div class="pv-popover" role="dialog" aria-label="演示控制">
    <h4>场景</h4>
    <ul class="pv-scenes">${rec.scenes.filter(one => one.id !== "stopped-withdraw").map(one =>
      `<li>${button({ label: one.label, variant: ui.sceneId === one.id || (one.id === "stopped-carry" && ui.sceneId === "stopped-withdraw") ? "secondary" : "ghost", action: "scene", data: { scene: one.id } })}<small>${esc(SCENE_NOTE[one.id] ?? "")}</small></li>`).join("")}</ul>
    <h4>停在</h4>
    <div class="pv-checkpoints">${scene.checkpoints.map(cp => button({ label: cp.label, variant: here?.id === cp.id ? "secondary" : "ghost", action: "checkpoint", data: { checkpoint: cp.id } })).join("")}</div>
    <h4>回放账上的事件</h4>
    <div class="pv-playback">${button({ label: "从头", icon: "undo", action: "restart" })}${button({ label: ui.playing ? "暂停" : "播放", icon: ui.playing ? "pause" : "play", action: "play", disabled: done })}${button({ label: "下一步", icon: "arrow", action: "step", disabled: done })}</div>
    <p class="pv-meta">录制于 ${esc(rec.source.recordedAt.slice(0, 16).replace("T", " "))} UTC · 脚本 <code>${esc(rec.source.script)}</code>。回放按账上的顺序一条一条放，每一步的状态都是 SDK 当时的投影。</p>
  </div>`;
}
