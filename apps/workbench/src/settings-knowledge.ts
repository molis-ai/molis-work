import { readFileSync } from "node:fs";
import { renderAlertDialog } from "@molis-ai/molis-work-design-system";
import { renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * 项目资料 in a project's settings (specs/project-knowledge §8.3): every piece the project's agents can find, how far its card
 * is organized, today's organizing allowance, and who read what. Everything it shows and changes goes through
 * `/projects/<id>/api/knowledge/*`, which invokes the shared directory's `knowledge.*` actions as the person.
 */
export function renderKnowledgeSettings({ L, projectId }: { L(text: string): string; projectId: string }): string {
  const state = (value: string, label: string) => `<option value="${value}">${label}</option>`;
  return `<section class="settings-document knowledge-settings" aria-labelledby="knowledge-title" data-knowledge-settings data-project="${projectId}">
    <header class="settings-page-heading"><h1 id="knowledge-title">${L("项目资料")}</h1>
      <p>${L("项目里的 Agent 能找到、能读的全部资料。每份资料由项目的文字模型整理出一张卡片（标题、简介、关键词，长文还有分节摘要），Agent 先看卡片再读原文。卡片只用来找资料，不是资料的内容。")}</p>
      <p class="knowledge-summary" data-knowledge-summary aria-live="polite">${L("正在读取…")}</p></header>
    <p class="settings-form-error" data-knowledge-error role="alert" hidden></p>
    <p class="knowledge-model-note" data-knowledge-model hidden>${L("还没有可用的文字模型，资料先按标题和开头的文字就能找到；配好模型后会自动整理。")} <a href="/settings/models">${L("去设置模型")}</a></p>
    <section class="settings-section knowledge-quota" aria-labelledby="knowledge-quota-title">
      <h2 id="knowledge-quota-title">${L("今天的整理额度")}</h2>
      <div class="knowledge-quota-row">
        <div class="knowledge-quota-copy"><span data-knowledge-quota-text>${L("正在读取…")}</span>
          <div class="mw-progress knowledge-quota-bar" data-slot="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${L("今天已用的整理额度")}"><span data-knowledge-quota-bar style="width:0%"></span></div></div>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-confirm hidden>${L("再整理一天的量")}</button>
      </div>
      <p class="settings-muted" data-knowledge-quota-note hidden>${L("今天的额度用完了，整理已经停下，不会再调用模型。确认后再给一天的量，排队的资料接着整理。")}</p>
    </section>
    <section class="settings-section knowledge-items" aria-labelledby="knowledge-items-title">
      <div class="knowledge-items-head"><h2 id="knowledge-items-title">${L("全部资料")}</h2>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-organize-all hidden>${L("重试没整理完的")}</button></div>
      <div class="knowledge-toolbar" role="group" aria-label="${L("筛选资料")}">
        <select class="mw-select" data-knowledge-filter="state" aria-label="${L("整理状态")}">
          ${state("", L("全部状态"))}${state("pending", L("等待整理"))}${state("ready", L("已整理"))}${state("listed", L("只列标题"))}${state("failed", L("整理失败"))}${state("over_quota", L("等额度"))}${state("missing", L("暂时不在"))}${state("changed", L("有新建议"))}${state("excluded", L("不给 Agent 用"))}
        </select>
        <input class="mw-input knowledge-search" type="search" data-knowledge-filter="query" placeholder="${L("按标题、来源或关键词筛选")}" aria-label="${L("按标题、来源或关键词筛选")}">
      </div>
      <div class="knowledge-batch" data-knowledge-batch hidden role="group" aria-label="${L("批量操作")}">
        <span data-knowledge-batch-count></span>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-batch-action="organize">${L("重新整理")}</button>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-batch-action="exclude">${L("不给 Agent 用")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-knowledge-batch-action="include">${L("恢复给 Agent 用")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-knowledge-batch-action="clear">${L("取消选择")}</button>
      </div>
      <label class="knowledge-select-all"><input type="checkbox" data-knowledge-select-all>${L("全选当前列出的资料")}</label>
      <ul class="knowledge-list" data-knowledge-list><li class="settings-muted">${L("正在读取…")}</li></ul>
      <button class="mw-btn mw-btn--ghost mw-btn--sm knowledge-more" type="button" data-knowledge-more hidden>${L("显示更多")}</button>
    </section>
    <section class="settings-section knowledge-receipts" aria-labelledby="knowledge-receipts-title">
      <h2 id="knowledge-receipts-title">${L("最近被谁用过")}</h2>
      <p class="settings-muted">${L("Agent 读到资料原文的每一次：哪个 Agent、哪一轮、读了哪个版本多少字。保留 30 天。")}</p>
      <ul class="knowledge-receipt-list" data-knowledge-receipts><li class="settings-muted">${L("正在读取…")}</li></ul>
    </section>
    ${renderAlertDialog({ labelledBy: "knowledge-bind-title", title: L("关联当前来源"), className: "mw-dialog--form",
      description: L("旧卡片内容完整保留。确认关联后，搜索和 Agent 才能使用当前来源；不会自动调用模型整理。"),
      attrs: { "data-knowledge-bind-dialog": true }, closeLabel: L("关闭"),
      body: `<div data-knowledge-bind-original></div><fieldset class="mw-fieldset" data-knowledge-bind-candidates></fieldset><p class="mw-field__error" data-knowledge-bind-error role="alert" hidden></p>`,
      footer: renderButton({ label: L("取消"), variant: "secondary", attrs: { "data-knowledge-bind-cancel": true } })
        + renderButton({ label: L("重新查看来源"), variant: "secondary", attrs: { "data-knowledge-bind-review": true, hidden: true } })
        + renderButton({ label: L("确认关联"), variant: "primary", type: "submit", attrs: { "data-knowledge-bind-confirm": true } }) })}
  </section>`;
}

/**
 * The browser program of project knowledge: TypeScript in `src/browser/knowledge/` (tsconfig.browser.json), bundled by esbuild
 * into `dist/knowledge-client.js` when the package builds, and served once as `KNOWLEDGE_CLIENT_ASSET` (cached; the user chose
 * one asset over copies inside each page's script, 2026-10-19). It binds every 项目资料 page, also one the settings cover places
 * later, the side panel's import, and the one picker of project knowledge. It needs the page's `L` and `molisWorkRequest`
 * first, so its tag comes after the page's own scripts.
 */
const KNOWLEDGE_CLIENT_ASSET = "/assets/molis-work-knowledge.js";
export const knowledgeClientTag = (): string => `<script src="${KNOWLEDGE_CLIENT_ASSET}"></script>`;
let client: string | null = null;
export function renderMolisWorkKnowledgeClientScript(): string {
  return client ??= readFileSync(new URL("./knowledge-client.js", import.meta.url), "utf8").trim();
}
