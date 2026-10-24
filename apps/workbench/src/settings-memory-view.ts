import { renderMemoryClassSettings } from "./settings-memory-classes.js";

/**
 * The memory settings page (specs/archive/memory-system §10): 个人 → 记忆 in the global settings, and 项目记忆 in a project's
 * settings. Both are the same page in a different scope; everything it shows and changes goes through `/api/memory/*`,
 * which invokes the shared directory's `memory.*` actions as the person.
 */
export function renderMemorySettings({ L, scope, projectId }: { L(text: string): string; scope: "personal" | "project"; projectId: string | null }): string {
  const personal = scope === "personal";
  const title = personal ? L("记忆") : L("项目记忆");
  const filter = (key: string, label: string, choices: readonly (readonly [string, string])[]) =>
    `<select class="mw-select" data-memory-filter="${key}" aria-label="${L(label)}">${choices.map(([value, text]) => `<option value="${value}">${L(text)}</option>`).join("")}</select>`;
  const lead = personal
    ? L("你的偏好和习惯：助理、Agent 工作、插件和界面推荐都会用到，在所有项目里生效。每一条都能看到从哪来、最近用在哪，可以修改、停用或删除。")
    : L("这个项目的约定、背景和经验：只在这个项目里使用。和“项目说明”不同，它按相关性参考，不是必须遵守的规矩。");
  return `<section class="settings-document memory-settings" aria-labelledby="memory-title" data-memory-settings data-memory-scope="${scope}" data-project="${projectId ?? ""}">
    <header class="settings-page-heading memory-heading"><h1 id="memory-title">${title}</h1><p>${lead}</p>
      <p class="memory-summary" data-memory-summary aria-live="polite">${L("正在读取…")}</p></header>
    <p class="settings-form-error" data-memory-error role="alert" hidden></p>
    <section class="settings-section" data-memory-retries hidden aria-labelledby="memory-retries-title">
      <h2 id="memory-retries-title">${L("等待重试的操作")}</h2>
      <p class="settings-muted">${L("重试会使用当时的内容和版本。筛选或重新读取不会丢失这些操作；刷新浏览器或离开本页后不再保留。")}</p>
      <ul class="memory-list" data-memory-retry-list></ul>
    </section>
    <section class="settings-section memory-changes" aria-labelledby="memory-changes-title" data-memory-changes-section hidden>
      <h2 id="memory-changes-title">${L("最近变动")}</h2>
      <ul class="memory-change-list" data-memory-changes></ul>
    </section>
    <section class="settings-section memory-pairs" aria-labelledby="memory-pairs-title" data-memory-pairs-section>
      <h2 id="memory-pairs-title">${L("可能重复或冲突")}</h2>
      <p class="settings-muted">${L("整理时发现的两两一对。选一条保留，另一条会停用（可以随时恢复）；都保留则不再提这一对。")}</p>
      <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-pairs-read disabled>${L("查看可能重复或冲突")}</button>
      <ul class="memory-list" data-memory-pairs></ul>
    </section>
    <section class="settings-section memory-candidates" aria-labelledby="memory-candidates-title" data-memory-candidates-section hidden>
      <h2 id="memory-candidates-title">${L("等你认可")}</h2>
      <p class="settings-muted">${L("从工作、界面操作里提出，或写入门没有直接记住的内容。认可之前不会被使用。")}</p>
      <ul class="memory-list" data-memory-candidates></ul>
    </section>
    <section class="settings-section memory-items" aria-labelledby="memory-items-title">
      <div class="memory-items-head"><h2 id="memory-items-title">${personal ? L("我的记忆") : L("这个项目的记忆")}</h2>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-add>${L("添加")}</button></div>
      <div class="memory-toolbar" role="group" aria-label="${L("筛选记忆")}">
        ${filter("scene", "场景", [["", "全部场景"], ["coding", "Coding"], ["assistant", "助理"], ["common", "通用"], ["unclassified", "未归类"]])}
        ${filter("kind", "类别", [["", "全部类别"], ["preference", "偏好"], ["convention", "约定"], ["fact", "背景事实"], ["experience", "经验"], ["habit", "习惯"], ["project-decision", "项目决策"]])}
        ${filter("lifecycle", "保留时间", [["", "全部保留类型"], ["long-term", "长期"], ["short-term", "短期"], ["session", "会话内"]])}
        ${filter("source", "来源", [["", "全部来源"], ["said", "你说的"], ["accepted", "你认可的"], ["auto", "自动记住"], ["manual", "手动添加"], ["imported", "导入"], ["plugin", "插件记下"]])}
        ${filter("state", "状态", [["", "全部状态"], ["active", "生效"], ["disabled", "停用"], ["paused", "已暂停"]])}
        ${filter("expired", "到期情况", [["", "全部期限"], ["true", "已到期"], ["false", "未到期"]])}
        <input class="mw-input memory-search" type="search" maxlength="400" data-memory-filter="query" placeholder="${L("搜索记忆")}" aria-label="${L("搜索记忆")}">
      </div>
      <div class="memory-toolbar" role="group" aria-label="${L("管理所选记忆")}">
        <span data-memory-selected aria-live="polite">${L("已选")} 0 / 100</span>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-batch-disable disabled>${L("预览批量停用")}</button>
        <button class="mw-btn mw-btn--danger-outline mw-btn--sm" type="button" data-memory-batch-remove disabled>${L("预览批量遗忘")}</button>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-batch-retry hidden>${L("重试原预览")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-selection-reset>${L("取消勾选")}</button>
      </div>
      <p class="settings-muted" data-memory-batch-status aria-live="polite" hidden></p>
      <ul class="memory-list" data-memory-batch-results hidden></ul>
      <div class="memory-editor-slot" data-memory-new hidden></div>
      <ul class="memory-list" data-memory-list><li class="settings-muted">${L("正在读取…")}</li></ul>
      <nav class="memory-toolbar" aria-label="${L("记忆分页")}">
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-previous disabled>${L("上一页")}</button>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-next disabled>${L("下一页")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-reload>${L("重新读取")}</button>
        <span class="settings-muted" data-memory-page-status aria-live="polite"></span>
      </nav>
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-form-title">
      <h2 id="memory-form-title">${L("怎么形成")}</h2>
      ${prefRow(L, "form", L("允许记住"), personal ? L("总开关。关掉后不再形成新的记忆，也不提建议；已有的照常使用。") : L("关掉后不再为这个项目形成新的记忆，也不提建议。"))}
      <div class="settings-setting-row memory-pref-static"><span class="setting-copy"><strong>${L("明确要求时记住")}</strong><span>${L("你说“以后……”“记住……”时直接记住，并告诉你在哪里生效。")}</span></span><span class="setting-value settings-muted">${L("总是")}</span></div>
      ${prefRow(L, "auto", L("自动记住低风险的偏好与经验"), L("你在两次不同的工作里都这样要求时自动记住，出现在“最近变动”里，可以撤销。关掉则都先问你。"))}
      ${prefRow(L, "learn_from_work", L("从工作里提出建议"), L("工作结束时提出值得记住的内容，等你认可。"))}
      ${prefRow(L, "learn_from_ui", L("从界面操作里学习"), L("只数你采纳、忽略、改写、撤销界面建议的次数，不保存内容；反复出现才提出建议。"))}
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-use-title">
      <h2 id="memory-use-title">${L("谁可以用")}</h2>
      ${prefRow(L, "consumers.assistant", L("助理"), L("你在底栏交给助理的工作。"))}
      ${prefRow(L, "consumers.agent", L("Agent 工作"), L("Coding、插件里的 Agent 和工作流。"))}
      ${prefRow(L, "consumers.ui", L("界面推荐"), L("根据你正在看的内容给出的建议。"))}
      ${prefRow(L, "consumers.plugin", L("插件"), L("插件只能读到偏好和约定，不会读到背景事实。"))}
      ${prefRow(L, "consumers.mcp", L("外部 AI 客户端"), personal ? L("通过 MCP 连接的客户端。个人记忆默认不开放。") : L("通过 MCP 连接的客户端，只读。"))}
    </section>
    ${renderMemoryClassSettings(L)}
    <section class="settings-section memory-data" aria-labelledby="memory-data-title">
      <h2 id="memory-data-title">${L("整理与数据")}</h2>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${L("整理")}</strong><span data-memory-upkeep>${L("每天整理一次：到期和长期没用到的停用，重复的自动记忆合并，依据不在的暂停。")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-upkeep-run>${L("现在整理")}</button></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${L("导出")}</strong><span>${L("下载一个记忆包，里面的密钥和本机路径已经去掉。")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-export>${L("导出")}</button></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${L("导入")}</strong><span>${L("选择一个记忆包；已有的相同内容会跳过，包损坏时一条也不写入。")}</span></span>
        <span class="setting-value"><label class="mw-btn mw-btn--secondary mw-btn--sm memory-import">${L("导入")}<input type="file" accept="application/json,.json" data-memory-import hidden></label></span></div>
      <div class="memory-editor-slot" data-memory-import-editor hidden></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${personal ? L("清空个人记忆") : L("清空这个项目的记忆")}</strong><span>${L("先告诉你会删掉几条，确认后删除；删除后任何地方都不会再用到。")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--danger-outline mw-btn--sm" type="button" data-memory-clear>${L("清空…")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-clear-reset hidden>${L("重新预览…")}</button></span></div>
      <p class="settings-muted" data-memory-clear-status aria-live="polite" hidden></p>
    </section>
    ${personal ? `<p class="settings-muted memory-rules-note">${L("交互规则（例如“写方案时别打断”）由助理按规则执行，在“助理”设置里管理。")} <a href="/settings/assistant">${L("去助理设置")}</a></p>` : ""}
  </section>`;
}

function prefRow(_L: (text: string) => string, key: string, title: string, description: string): string {
  return `<label class="settings-setting-row memory-pref"><span class="setting-copy"><strong>${title}</strong><span>${description}</span></span>
    <span class="setting-value"><span class="mw-switch"><input type="checkbox" role="switch" data-memory-pref="${key}" aria-label="${title}" disabled><span class="mw-switch__track" aria-hidden="true"></span></span></span></label>`;
}
