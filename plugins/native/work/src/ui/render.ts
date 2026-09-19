import { renderStatusMark, renderToggleGroup } from "@molis-ai/molis-work-design-system";
import type { ProjectOperationsData, ProjectOperationsProject, ProjectSessionRecord, ProjectWorkspaceRecord, WorkUiIconName, WorkUiModel, WorkUiSurface } from "./types.js";

/** Render only the requested product surface; shell and slot placement stay with Workbench. */
export function renderWorkSessionSurface(surface: WorkUiSurface, model: WorkUiModel): string {
  const { icon } = model;
  const L = model.text ?? ((value: string, vars?: Record<string, string | number>) => {
    let text = value;
    if (vars) for (const [key, next] of Object.entries(vars)) text = text.replaceAll(`{${key}}`, String(next));
    return text;
  });
  function escapeHtml(value: string | null | undefined): string {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sessionStateLabel(state: ProjectSessionRecord["state"]): string {
    return { idle: L("可查看"), archived: L("已归档") }[state];
  }

  function workspaceStateLabel(state: ProjectWorkspaceRecord["state"]): string {
    return { healthy: L("路径正常"), missing: L("路径缺失"), conflict: L("关联冲突") }[state];
  }

  function contentModeLabel(mode: ProjectSessionRecord["contentMode"]): string {
    return { native: L("原生内容"), fallback: L("Molis Work 记录"), unavailable: L("不可读取") }[mode];
  }

  function renderSessionRow(item: ProjectSessionRecord, selected: boolean): string {
    const search = [
      item.title,
      item.id,
      item.runtime,
      item.currentGoal,
      ...item.goalHistory,
      item.workspace,
      sessionStateLabel(item.state),
      contentModeLabel(item.contentMode),
      item.updated,
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    const updatedAt = Number.isFinite(Date.parse(item.updatedAt || "")) ? Date.parse(item.updatedAt!) : 0;
    const goalLabel = item.currentGoal || L("未关联");
    const status = renderStatusMark({
      label: sessionStateLabel(item.state),
      tone: item.state === "archived" ? "quiet" : "idle",
      icon: item.state === "archived" ? "archive" : "ready",
      plain: true,
      className: "mw-dir-row__status",
    });
    return `<button type="button" title="${escapeHtml(item.title)}" class="mw-dir-row mw-dir-row--compact directory-list-row session-stage-row${selected ? " is-selected" : ""}" data-slot="directory-row" aria-selected="${selected ? "true" : "false"}" tabindex="${selected ? 0 : -1}" draggable="true" data-frame-asset="session" data-frame-asset-id="${escapeHtml(item.id)}" data-frame-asset-title="${escapeHtml(item.title)}" data-frame-asset-caption="${escapeHtml(item.runtime)}" data-operation-row="session" data-operation-select="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}" data-record-title="${escapeHtml(item.title)}" data-record-runtime="${escapeHtml(item.runtimeId || item.runtime)}" data-record-runtime-label="${escapeHtml(item.runtime)}" data-record-status="${escapeHtml(item.state)}" data-record-content="${escapeHtml(item.contentMode)}" data-record-updated="${updatedAt}" data-record-search="${escapeHtml(search)}" data-record-goal="${escapeHtml(item.currentGoalId || "")}">
      <span class="session-stage-row__copy">
        <span class="session-stage-row__title"><strong>${escapeHtml(item.title)}</strong></span>
        <span class="session-stage-row__goal${item.currentGoal ? "" : " is-empty"}">${escapeHtml(goalLabel)}</span>
        ${status}
      </span>
    </button>`;
  }

  function groupSessionRecords(records: readonly ProjectSessionRecord[]): readonly {
    id: string;
    label: string;
    items: readonly ProjectSessionRecord[];
  }[] {
    const groups: { id: string; label: string; items: ProjectSessionRecord[] }[] = [];
    const index = new Map<string, { id: string; label: string; items: ProjectSessionRecord[] }>();
    for (const item of records) {
      const id = item.runtimeId || item.runtime || "generic";
      let group = index.get(id);
      if (!group) {
        group = { id, label: item.runtime || id, items: [] };
        index.set(id, group);
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }

  function renderRuntimeFold(
    group: { id: string; label: string; items: readonly ProjectSessionRecord[] },
    selectedId: string,
  ): string {
    const rows = group.items.map((item) => renderSessionRow(item, item.id === selectedId)).join("");
    return `<details class="goal-collection-fold" data-session-runtime-fold="${escapeHtml(group.id)}" open>
      <summary data-session-runtime-select="${escapeHtml(group.id)}">
        <span class="goal-collection-caret" aria-hidden="true">${icon("chevron-down")}</span>
        <span class="goal-collection-mark" aria-hidden="true">${icon("terminal")}</span>
        <strong>${escapeHtml(group.label)}</strong>
        <small>${group.items.length}</small>
      </summary>
      ${rows}
    </details>`;
  }

  function renderFilterMenu(): string {
    return `<details class="project-record-filter-menu"><summary aria-label="${L("筛选与排序")}" title="${L("筛选与排序")}">${icon("filter")}</summary><div><label>Runtime<select data-session-runtime-filter><option value="all">${L("全部 Runtime")}</option></select></label><label>${L("状态")}<select data-session-status-filter><option value="all">${L("全部状态")}</option><option value="idle">${L("可查看")}</option><option value="archived">${L("已归档")}</option></select></label><label>${L("内容")}<select data-operation-filter="sessions"><option value="all">${L("全部内容")}</option><option value="native">${L("原生内容")}</option><option value="fallback">${L("Molis Work 记录")}</option><option value="unavailable">${L("不可读取")}</option></select></label><label>${L("排序")}<select data-session-sort><option value="updated-desc">${L("最近更新")}</option><option value="updated-asc">${L("最早更新")}</option><option value="title-asc">${L("标题 A–Z")}</option></select></label></div></details>`;
  }

  function renderStageChrome(): string {
    return `<div class="session-stage-chrome" data-session-stage-chrome>
      <header class="tree-chrome" data-directory-list-actions>
        <div class="tree-tools">
          <button class="mw-btn mw-btn--ghost tree-create" type="button" data-open-session-add>${icon("plus")}<span>${L("新建 Session")}</span></button>
          <div class="tree-filter-control">${renderFilterMenu()}</div>
        </div>
      </header>
    </div>`;
  }

  function renderSessionList(records: readonly ProjectSessionRecord[], hasData: boolean): string {
    const body = hasData
      ? groupSessionRecords(records).map((group) => renderRuntimeFold(group, "")).join("")
      : "";
    return `<div class="session-stage-list" data-session-stage-list tabindex="0" aria-label="${L("Sessions 列表")}">
      <div data-operation-list="sessions">${body}</div>
      <div class="project-record-empty mw-empty" data-operation-empty="sessions"${hasData ? " hidden" : ""}><strong>${hasData ? L("没有匹配结果") : L("这个项目还没有 Session")}</strong><button class="mw-btn mw-btn--link" type="button" data-operation-clear="sessions"${hasData ? "" : " hidden"}>${L("清除筛选")}</button></div>
    </div>`;
  }

  function renderSessionContent(item: ProjectSessionRecord): string {
    if (item.contentMode === "native" || item.contentMode === "fallback") {
      const native = item.contentMode === "native";
      return `<div class="session-content-state" data-session-content-list>${icon("activity")}<div><h3>${native ? L("按需读取最近执行") : L("读取 Molis Work 执行记录")}</h3><p>${native ? L("Molis Work 会分页读取原 Runtime 的最近摘要，并合并本地 TUI 记录；超大历史不会整条载入。") : L("只读取 Molis Work 已持久化并能证明的 TUI 与执行事实。")}</p><button class="mw-btn mw-btn--secondary" type="button" data-session-content-load>${L("读取内容")}</button></div></div>`;
    }
    const title = item.currentGoalId
      ? L("这个 Runtime 不能读取 Session 内容")
      : L("先选择当前 Goal");
    const copy = item.currentGoalId
      ? L("Molis Work 只显示已确认的 Session ID、项目、Goal 和工作目录，不猜测执行过程。")
      : L("没有当前 Goal 时不能创建 Handoff，也不能把这条记录当作可续跑的执行。");
    return `<div class="session-content-state" data-session-content-list>${icon("lock")}<div><h3>${title}</h3><p>${copy}</p></div></div>`;
  }

  function renderGoalHistory(item: ProjectSessionRecord): string {
    const history = item.currentGoal ? [item.currentGoal, ...item.goalHistory] : item.goalHistory;
    return history.length
      ? `<ol class="operation-history" data-goal-history>${history.map((goal, index) => `<li${index === 0 && item.currentGoal ? ' class="is-current"' : ""}>${icon(index === 0 && item.currentGoal ? "target" : "history")}<span><strong>${escapeHtml(goal)}</strong><small>${index === 0 && item.currentGoal ? L("当前 Goal") : L("历史关联")}</small></span></li>`).join("")}</ol>`
      : `<div class="operation-aside-empty" data-goal-history>${icon("info")}<strong>${L("还没有 Goal 关系")}</strong><small>${L("可以在关系管理中选择当前 Goal。")}</small></div>`;
  }

  function renderSessionAction(
    kind: "load" | "handoff" | "goal",
    variant: "primary" | "secondary" | "ghost",
    item: ProjectSessionRecord,
    canLoad: boolean,
    canHandoff: boolean,
  ): string {
    if (kind === "load") {
      return `<button class="mw-btn mw-btn--${variant}" type="button" data-session-load="${escapeHtml(item.resumeMode)}"${canLoad ? "" : ` disabled title="${L("这个 Runtime 不能原生加载这条 Session，可使用 Handoff 创建新 Session")}"`}>${icon("external")}<span>${L("加载原 Session")}</span></button>`;
    }
    if (kind === "handoff") {
      return `<button class="mw-btn mw-btn--${variant}" type="button" data-open-session-handoff${canHandoff ? "" : ` disabled title="${L("请先为 Session 选择当前 Goal")}"`}>${icon("switch")}<span>${L("创建 Handoff")}</span></button>`;
    }
    return `<button class="mw-btn mw-btn--${variant}" type="button" data-open-session-relations>${icon("target")}<span>${L("选择当前 Goal")}</span></button>`;
  }

  function renderSessionMenuItem(label: string, attrs: string, iconName?: WorkUiIconName): string {
    return `<button type="button" class="mw-menu__item" role="menuitem" ${attrs}>${iconName ? icon(iconName) : ""}<span>${label}</span></button>`;
  }

  function renderSessionDetail(item: ProjectSessionRecord, selected: boolean, projectName: string): string {
    const canLoad = item.resumeMode === "native";
    const canHandoff = Boolean(item.currentGoalId);
    const readable = item.contentMode === "native" || item.contentMode === "fallback";
    const heading = item.currentGoal && item.currentGoal !== item.currentGoalId ? item.currentGoal : item.title;
    const primary = canLoad ? "load" : canHandoff ? "handoff" : "goal";
    const showHandoffSecondary = primary === "load" && canHandoff;
    const moreLoad = primary !== "load"
      ? renderSessionMenuItem(L("加载原 Session"), `data-session-load="${escapeHtml(item.resumeMode)}"${canLoad ? "" : " disabled"}`, "external")
      : "";
    const moreHandoff = primary !== "handoff" && !showHandoffSecondary
      ? renderSessionMenuItem(L("创建 Handoff"), `data-open-session-handoff${canHandoff ? "" : " disabled"}`, "switch")
      : "";
    const toolbar = readable ? `<div class="session-execution-toolbar" hidden>
          <label class="operation-content-search">${icon("search")}<input type="search" data-session-content-search placeholder="${L("搜索本次执行")}" aria-label="${L("搜索当前 Session 内容")}"></label>
          ${renderToggleGroup({
            label: L("筛选执行事件"),
            className: "session-event-filter",
            items: [
              { value: "all", label: L("全部"), current: true, attrs: { "data-session-content-filter": "all" } },
              { value: "conversation", label: L("对话"), attrs: { "data-session-content-filter": "conversation" } },
              { value: "tool", label: L("工具"), attrs: { "data-session-content-filter": "tool" } },
              { value: "status", label: L("状态"), attrs: { "data-session-content-filter": "status" } },
              { value: "artifact", label: L("产物"), attrs: { "data-session-content-filter": "artifact" } },
              { value: "terminal", label: L("终端"), attrs: { "data-session-content-filter": "terminal" } },
            ],
          })}
        </div>` : "";
    return `<article class="session-stage project-session-document" data-operation-detail="session" data-session-stage="${readable ? "readable" : "unavailable"}" data-detail-id="${escapeHtml(item.id)}" data-session-runtime-id="${escapeHtml(item.runtimeId)}" data-session-resume-mode="${escapeHtml(item.resumeMode)}" data-session-current-goal-id="${escapeHtml(item.currentGoalId || "")}" data-session-workspace-path="${escapeHtml(item.workspacePath || "")}" data-session-archived="${item.state === "archived"}"${selected ? "" : " hidden"}>
    <header class="session-stage-bar">
      <button class="session-stage-back" type="button" data-session-collapse aria-label="${L("返回 Session 列表")}" title="${L("返回 Session 列表")}">${icon("chevron-right")}</button>
      <div class="session-stage-identity">
        <p class="session-stage-facts"><span class="session-stage-state session-stage-state--${escapeHtml(item.state)}">${escapeHtml(sessionStateLabel(item.state))}</span><span>${escapeHtml(item.runtime)}</span><span>${L("最近更新 {time}", { time: item.updated })}</span></p>
        <h1 id="session-title-${escapeHtml(item.id)}">${escapeHtml(heading)}</h1>
      </div>
      <div class="session-stage-actions">
        <button class="mw-btn mw-btn--ghost session-rail-toggle" type="button" data-session-rail-open>${icon("panel")}<span>${L("关系")}</span></button>
        ${renderSessionAction(primary, "primary", item, canLoad, canHandoff)}
        ${showHandoffSecondary ? renderSessionAction("handoff", "secondary", item, canLoad, canHandoff) : ""}
        <details class="session-more">
          <summary class="mw-btn mw-btn--ghost mw-btn--icon-only" aria-label="${L("更多")}">${icon("more")}</summary>
          <div class="mw-menu" role="menu">
            ${moreLoad}${moreHandoff}
            ${renderSessionMenuItem(L("管理关系"), "data-open-session-relations", "link")}
            ${renderSessionMenuItem(item.state === "archived" ? L("恢复记录") : L("归档记录"), `data-session-archive="${item.state !== "archived"}"`, item.state === "archived" ? "refresh" : "archive")}
          </div>
        </details>
      </div>
      <p class="operation-action-status" data-session-load-status role="status" hidden></p>
    </header>
    <div class="session-stage-body">
      <section class="session-stage-main session-execution" aria-labelledby="session-content-${escapeHtml(item.id)}">
        <h2 class="mw-sr-only" id="session-content-${escapeHtml(item.id)}">${readable ? L("执行内容") : L("Session 续跑")}</h2>
        ${toolbar}
        <div class="session-content-body">${renderSessionContent(item)}<p class="operation-search-empty" data-session-content-empty hidden>${L("当前内容中没有匹配结果。")}</p></div>
      </section>
      <button class="session-rail-dismiss" type="button" data-session-rail-dismiss tabindex="-1" aria-label="${L("关闭关系")}"></button>
      <aside class="session-rail" aria-label="${L("Session 关系")}">
        <section class="session-rail-facts">
          <header><h2>${L("当前关系")}</h2><button class="mw-btn mw-btn--link" type="button" data-open-session-relations>${L("管理关系")}</button></header>
          <dl>
            <div><dt>${L("项目")}</dt><dd>${escapeHtml(projectName)}</dd></div>
            <div><dt>${L("当前 Goal")}</dt><dd><span data-current-goal-value>${escapeHtml(item.currentGoal || L("未选择"))}</span><button class="mw-btn mw-btn--link" type="button" data-work-surface-open="goal">${L("去 Goals")}</button></dd></div>
            <div><dt>${L("工作目录")}</dt><dd><code>${escapeHtml(item.workspace)}</code></dd></div>
            <div><dt>${L("内容来源")}</dt><dd>${escapeHtml(contentModeLabel(item.contentMode))}</dd></div>
          </dl>
        </section>
        <section class="session-rail-history">
          <header><h2>${L("关联历史")}</h2><span data-goal-history-count>${L("{count} 次", { count: item.goalHistory.length + (item.currentGoal ? 1 : 0) })}</span></header>
          ${renderGoalHistory(item)}
        </section>
        <details class="session-rail-identity">
          <summary>${icon("info")}${L("身份与能力边界")}</summary>
          <dl>
            <div><dt>Session ID</dt><dd>${escapeHtml(item.id)}</dd></div>
            <div><dt>Runtime</dt><dd>${escapeHtml(item.runtime)}</dd></div>
            <div><dt>${L("原生内容")}</dt><dd>${escapeHtml(contentModeLabel(item.contentMode))}</dd></div>
            <div><dt>Panel ID</dt><dd>${L("只负责 PTY 所有权")}</dd></div>
            <div><dt>Work Context ID</dt><dd>${L("只用于弱能力兼容")}</dd></div>
          </dl>
        </details>
      </aside>
    </div>
  </article>`;
  }

  function renderSessionSurface(records: readonly ProjectSessionRecord[], hasData: boolean, projectName: string): string {
    const details = hasData
      ? records.map((item) => renderSessionDetail(item, false, projectName)).join("")
      : "";
    return `<section class="desktop-work-surface project-operation-surface session-stage-shell" data-work-surface="sessions" data-work-surface-label="Sessions" data-session-stage-shell data-operation-directory="sessions" hidden>
    ${renderStageChrome()}
    ${renderSessionList(records, hasData)}
    <div class="session-stage-workspace" data-session-stage-workspace hidden>${details}</div>
  </section>`;
  }

  function renderOverlays(data: ProjectOperationsData | undefined, project: ProjectOperationsProject | null): string {
    const runtimes = data?.runtimes ?? [
      { runtime_id: "codex", display_name: "Codex", capabilities: null },
      { runtime_id: "claude-code", display_name: "Claude Code", capabilities: null },
      { runtime_id: "opencode", display_name: "OpenCode", capabilities: null },
      { runtime_id: "pi-agent", display_name: "Pi Agent", capabilities: null },
      { runtime_id: "grok-build", display_name: "Grok Build", capabilities: null },
    ];
    const noneGoal = L("暂不关联 Goal");
    const defaultRuntime = runtimes[0];
    const runtimeOptions = runtimes.map((runtime) => `<option value="${escapeHtml(runtime.runtime_id)}" data-create-mode="${escapeHtml(runtime.capabilities?.create || "registry")}" data-discover-mode="${escapeHtml(runtime.capabilities?.discover || "unsupported")}" data-handoff-mode="${escapeHtml(runtime.capabilities?.handoff || "unsupported")}">${escapeHtml(runtime.display_name)}</option>`).join("");
    const goalOptions = (data?.goals ?? []).map((goal) => `<option value="${escapeHtml(goal.goal_id)}">${escapeHtml(goal.title)}</option>`).join("");
    const choiceOption = (value: string, text: string, selected: boolean) =>
      `<button type="button" role="option" class="session-choice-option${selected ? " is-current" : ""}" data-session-choice-option data-value="${escapeHtml(value)}" aria-selected="${selected ? "true" : "false"}">${escapeHtml(text)}</button>`;
    const renderChoiceField = (options: { label: string; selectAttrs: string; selectHtml: string; triggerLabel: string; choices: string }) =>
      `<div class="mw-field"><span class="mw-field__label">${options.label}</span><select class="mw-select" ${options.selectAttrs} hidden tabindex="-1" aria-hidden="true">${options.selectHtml}</select><details class="session-choice-picker" data-session-choice-menu><summary aria-haspopup="listbox" aria-expanded="false"><span data-session-choice-label>${escapeHtml(options.triggerLabel)}</span>${icon("chevron-down")}</summary><div class="session-choice-options" role="listbox" aria-label="${escapeHtml(options.label)}">${options.choices}</div></details></div>`;
    const runtimeField = renderChoiceField({
      label: "Runtime",
      selectAttrs: "data-session-add-runtime",
      selectHtml: runtimeOptions,
      triggerLabel: defaultRuntime?.display_name || "",
      choices: runtimes.map((runtime, index) => choiceOption(runtime.runtime_id, runtime.display_name, index === 0)).join(""),
    });
    const goalField = renderChoiceField({
      label: L("当前 Goal"),
      selectAttrs: "data-session-add-goal",
      selectHtml: `<option value="">${escapeHtml(noneGoal)}</option>${goalOptions}`,
      triggerLabel: noneGoal,
      choices: [choiceOption("", noneGoal, true), ...(data?.goals ?? []).map((goal) => choiceOption(goal.goal_id, goal.title, false))].join(""),
    });
    const projects = data?.projects ?? (project ? [project] : []);
    const projectOptions = projects.map((item) => `<option value="${escapeHtml(item.project_id)}"${item.project_id === project?.project_id ? " selected" : ""}>${escapeHtml(item.display_name)}</option>`).join("");
    const workspaces = data?.workspaces ?? [];
    const defaultWorkspace = workspaces.find((workspace) => workspace.state === "healthy") ?? null;
    const workspaceChoices = workspaces.length
      ? workspaces.map((workspace) => `<button type="button" data-session-workspace-option data-workspace-id="${escapeHtml(workspace.id)}" data-workspace-path="${escapeHtml(workspace.path)}" data-workspace-name="${escapeHtml(workspace.name)}"${workspace.state === "healthy" ? "" : " disabled"}><span>${icon("folder")}<span><strong>${escapeHtml(workspace.name)}</strong><small>${escapeHtml(workspace.path)}</small></span></span><em class="workspace-choice-state workspace-choice-state--${escapeHtml(workspace.state)}">${escapeHtml(workspaceStateLabel(workspace.state))}</em></button>`).join("")
      : `<p class="session-workspace-empty">${L("这个项目还没有已知运行位置。")}</p>`;
    const workspacePathOptions = workspaces.map((workspace) => `<option value="${escapeHtml(workspace.path)}">${escapeHtml(workspace.name)}</option>`).join("");
    const workspacePicker = `<div class="session-workspace-field">
    <span class="operation-field-label">${L("工作目录")} <small>${L("Session 的运行位置")}</small></span>
    <input type="hidden" data-session-add-workspace-id value="${escapeHtml(defaultWorkspace?.id || "")}">
    <input type="hidden" data-session-add-workspace value="${escapeHtml(defaultWorkspace?.path || "")}">
    <details class="session-workspace-picker" data-session-workspace-menu>
      <summary><span>${icon("folder")}<span><strong data-session-workspace-name>${escapeHtml(defaultWorkspace?.name || L("不关联工作目录"))}</strong><small data-session-workspace-path>${escapeHtml(defaultWorkspace?.path || L("运行时不绑定本地路径"))}</small></span></span>${icon("chevron-down")}</summary>
      <div class="session-workspace-options" role="listbox" aria-label="${L("选择工作目录")}">${workspaceChoices}<button type="button" data-session-workspace-none><span>${icon("minus")}<span><strong>${L("不关联工作目录")}</strong><small>${L("仍可创建 Session，之后再补充关系")}</small></span></span></button><button type="button" data-session-workspace-custom><span>${icon("plus")}<span><strong>${L("选择其他目录")}</strong><small>${L("输入这台电脑上的绝对路径")}</small></span></span></button></div>
    </details>
    <label class="session-workspace-custom" data-session-workspace-custom-panel hidden>${L("其他目录")}<input data-session-workspace-custom-input autocomplete="off" placeholder="/Users/name/code/project"></label>
  </div>`;
    return `<datalist id="project-workspace-path-options">${workspacePathOptions}</datalist><dialog class="project-operation-dialog session-add-dialog mw-dialog mw-dialog--form" data-session-add-dialog><form method="dialog" class="mw-form mw-dialog__shell" data-session-add-form><header class="mw-form__header"><div class="session-add-heading"><div class="session-add-heading-row"><h2 data-session-add-dialog-title>${L("新建 Session")}</h2><button class="mw-btn mw-btn--ghost" type="button" data-session-add-toggle>${L("关联已有 Session")}</button></div><p data-session-add-dialog-copy>${L("从当前项目启动一条新的 Runtime Session。")}</p><strong data-session-add-mode hidden>${L("创建新的 Runtime Session")}</strong></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-dialog-close aria-label="${L("关闭")}">${icon("x")}</button></header><section class="mw-form__body">
    <input type="hidden" data-session-add-action value="create">
    <div class="session-add-field-grid">${runtimeField}${goalField}</div>
    <label class="mw-field">${L("Session 标题")}<input class="mw-input" data-session-add-title maxlength="160" placeholder="${L("可选；留空使用 Goal 或 Runtime 标题")}"></label>
    <div class="session-add-native" data-session-add-native hidden><label>${L("Runtime 原生 Session ID")}<input data-session-native-id list="session-discovery-options" autocomplete="off" placeholder="${L("输入 ID，或先同步可发现记录")}"></label><datalist id="session-discovery-options" data-session-discovery-options></datalist><button class="mw-btn mw-btn--secondary" type="button" data-session-discover>${icon("refresh")}<span>${L("同步可发现记录")}</span></button></div>
    ${workspacePicker}
    <p class="operation-capability-note" data-session-add-capability></p>
    <label class="operation-confirm-check session-add-confirm"><input type="checkbox" data-session-add-confirm><span data-session-add-confirm-copy>${L("确认使用以上 Goal、Runtime 和工作目录启动新 Session。")}</span></label>
    <p class="operation-dialog-status" data-session-add-status role="status" hidden></p>
  </section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-dialog-close>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit" data-session-add-submit disabled>${L("启动 Session")}</button></footer></form></dialog>
  <dialog class="project-operation-dialog mw-sheet" data-session-relations-dialog data-current-project-id="${escapeHtml(project?.project_id || "")}"><form method="dialog" class="mw-form mw-sheet__shell" data-session-relations-form><header class="mw-form__header"><div><h2>${L("管理 Session 关系")}</h2><p>${L("每条 Session 同时只有一个 Project 和一个当前 Goal。")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-dialog-close aria-label="${L("关闭")}">${icon("x")}</button></header><section class="mw-form__body">
    <dl class="operation-confirm-facts"><div><dt>Session</dt><dd data-session-relations-name></dd></div><div><dt>${L("当前 Project")}</dt><dd>${escapeHtml(project?.display_name || L("当前项目"))}</dd></div></dl>
    <label class="mw-field">${L("目标 Project")}<select class="mw-select" data-session-relations-project>${projectOptions}<option value="">${L("移出当前 Project")}</option></select></label>
    <label class="mw-field">${L("当前 Goal")}<select class="mw-select" data-session-relations-goal><option value="">${L("不设置当前 Goal")}</option>${goalOptions}</select></label>
    <label class="mw-field">${L("工作目录")}<input class="mw-input" data-session-relations-workspace list="project-workspace-path-options" placeholder="${L("留空表示解除工作目录关系")}"></label>
    <p class="operation-capability-note" data-session-relations-note>${L("切换 Goal 会保留旧 Goal 历史；转移或移出 Project 会清空当前 Goal。")}</p>
    <label class="operation-confirm-check"><input type="checkbox" data-session-relations-confirm><span>${L("确认只更新这条 Session 的关系。")}</span></label>
    <p class="operation-dialog-status" data-session-relations-status role="status" hidden></p>
  </section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-dialog-close>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit" data-session-relations-submit disabled>${L("保存关系")}</button></footer></form></dialog>
  <dialog class="project-operation-dialog session-handoff-dialog mw-sheet" data-session-handoff-dialog data-current-project-id="${escapeHtml(project?.project_id || "")}"><form method="dialog" class="mw-form mw-sheet__shell" data-session-handoff-form><header class="mw-form__header"><div><h2>${L("创建 Goal Handoff")}</h2><p>${L("先审阅交接内容，再创建一条全新的目标 Session。")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-dialog-close aria-label="${L("关闭")}">${icon("x")}</button></header><section class="session-handoff-review mw-form__body">
    <aside class="session-handoff-controls" aria-label="${L("Handoff 目标")}">
      <dl class="operation-confirm-facts"><div><dt>${L("来源 Session")}</dt><dd data-handoff-source-session></dd></div><div><dt>Project</dt><dd>${escapeHtml(project?.display_name || L("当前项目"))}</dd></div><div><dt>${L("当前 Goal")}</dt><dd data-handoff-goal></dd></div></dl>
      <label>${L("目标 Runtime")}<select data-handoff-runtime>${runtimeOptions}</select></label>
      <label>${L("目标工作目录")}<input data-handoff-workspace list="project-workspace-path-options" autocomplete="off" placeholder="${L("可选；请输入绝对路径")}"></label>
      <p class="operation-capability-note" data-handoff-capability></p>
      <label class="operation-confirm-check"><input type="checkbox" data-handoff-confirm><span>${L("确认使用上面的 Runtime、Project、Goal 和工作目录创建新 Session，并发送右侧内容。")}</span></label>
      <p class="operation-dialog-status" data-handoff-status role="status" hidden></p>
      <button class="mw-btn mw-btn--danger-outline session-handoff-cancel" type="button" data-handoff-cancel disabled>${L("取消这次 Handoff")}</button>
    </aside>
    <div class="session-handoff-editor"><header><div><h3>${L("交接内容")}</h3><p>${L("内容由当前 Goal Contract 与最小 Session 上下文生成，可以直接修改。")}</p></div><span data-handoff-state>${L("草稿")}</span></header><textarea data-handoff-content aria-label="${L("可编辑的 Handoff package")}" spellcheck="false" placeholder="${L("正在生成 Handoff package...")}"></textarea></div>
  </section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-dialog-close>${L("稍后继续")}</button><button class="mw-btn mw-btn--secondary" type="button" data-handoff-save disabled>${L("保存草稿")}</button><button class="mw-btn mw-btn--primary" type="submit" data-handoff-send disabled>${L("创建并发送")}</button></footer></form></dialog>
  <dialog class="project-operation-dialog project-operation-confirm-dialog mw-dialog mw-dialog--alert" data-session-archive-dialog><form method="dialog" class="mw-form" data-session-archive-form><header class="mw-form__header"><div><h2 data-session-archive-title>${L("归档 Session 记录")}</h2><p>${L("只整理 Molis Work 记录，不删除或关闭 Runtime 原生内容。")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-dialog-close aria-label="${L("关闭")}">${icon("x")}</button></header><section class="mw-form__body"><dl class="operation-confirm-facts"><div><dt>Session</dt><dd data-session-archive-name></dd></div><div><dt>${L("影响")}</dt><dd data-session-archive-impact></dd></div></dl><label class="operation-confirm-check"><input type="checkbox" data-session-archive-confirm><span data-session-archive-confirm-copy></span></label><p class="operation-dialog-status" data-session-archive-status role="status" hidden></p></section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-dialog-close>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit" data-session-archive-submit disabled>${L("确认")}</button></footer></form></dialog>`;
  }


  const { project, data } = model;
  const records = data?.sessions ?? [];
  const projectName = project?.display_name || L("当前项目");
  switch (surface) {
    case "root": return `<button class="desktop-module-item" type="button" data-work-surface-open="sessions">${icon("terminal")}<span><strong>Sessions</strong><small>${L("执行内容、运行位置与续跑")}</small></span>${icon("chevron-right")}</button>`;
    case "directory": return "";
    case "main": return renderSessionSurface(records, records.length > 0, projectName);
    case "overlay": return renderOverlays(data, project);
  }
}
