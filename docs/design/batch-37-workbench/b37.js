(() => {
  const { renderButton, renderBadge, renderAlert, renderStateRing, icon, escapeHtml: esc } = window.mwKit;

  const TEXT = {
    zh: {
      title: "第 37 批定样",
      views: { v371: "37-1 生成页面（36A 第一页挂载）", v372: "37-2 事项切换与工作台" },
      planLbl: "方案",
      stateLbl: "状态",
      plans371: {
        dl_on: "已定方案 B + 采纳 5 条设计语言建议（推荐）",
        dl_off: "已定方案 B（仅基础规则，不加额外校验）",
      },
      states371: {
        active: "在用第 2 版（36A 第一页：Brief 在上 + 生成页在下）",
        draft: "看草稿（方案 B 左右并排 + 对照采用条）",
        conflict: "人工修改冲突（字段级改动对照）",
        fallback: "新版本打不开（自动退回默认第一页）",
      },
      plans372: {
        a: "方案 A（推荐）：面板内联新建 + 阅读节奏轻量事项页",
        b: "方案 B：弹窗新建 + 四格看板轻量事项页",
      },
      states372: {
        goal_item: "已切到「发布 v2」（由 Goal 变成，右栏这件事的东西）",
        light_item: "已切到「Q4 复盘准备」（轻量事项第一页）",
        empty: "事项为空态（可操作新建 + 一键清除示例）",
        home: "未选事项（项目主页）",
        organize: "整理主线覆盖层",
      },
      notesOff: "不标新增",
      notesOn: "标出组件板新增",
      reset: "重置",
      personalSpace: "个人空间",
      pinnedTag: "置顶",
      projectsSec: "项目",
      projectHome: "项目主页",
      recentSec: "最近切过",
      searchPh: "搜索事项…",
      newItem: "新建事项",
      organize: "整理主线",
      allProjects: "全部项目",
      newProject: "新建项目",
      putInItem: "放进事项",
      thisItemsStuff: "这件事的东西",
      discussionIm: "讨论 / IM",
      imNote: "决定 66（R21）：右栏讨论 / IM 保留，可把讨论关联到当前事项。",
      inItemPrefix: "在：",
      wholeProject: "对整个项目说",
      scopeItem: "这件事项",
      scopeAll: "整个项目",
      otherWaiting: (n) => `别的事项还有 ${n} 件等你`,
      emptyGuide: "还没有事项。直接起个名字就开始，或先用下面这条示例熟悉一下。",
      exampleBadge: "示例",
      exampleTitle: "整理本周发布清单",
      exampleSub: "点即可体验切换，不需要可一键清掉",
      clearExample: "一键清除示例",
      createLight: "只起名字（轻量事项）",
      createGoal: "建成 Goal",
      createTodo: "建成待办",
      createPh: "输入事项名，回车新建…",
      createBtn: "创建",
      cancel: "取消",
      workBriefHead: "项目主页 · 第一页",
      adopt: "采用第 3 版…",
      discardDraft: "放弃草稿",
      restorePrev: "恢复第 2 版",
      backDefault: "退回默认第一页",
      checksOk: "检查通过（4/4 · 语义色与对比度 ≥4.5）",
      checksBasic: "检查通过（4/4）",
      conflictTitle: "你手动改过的地方与第 3 版冲突",
      keepMine: "保留我的",
      useNew: "用新的",
      mergeEdit: "合并后再改",
      fallbackTitle: "第 3 版页面在隔离环境中无法打开",
      fallbackBody: "已安全退回默认的「项目的第一页」。你的第 3 版草稿与手动修改仍保留，原待办与 Coding 数据未受影响。",
      retryOpen: "再试一次",
      done: "办完",
      doing: "在办",
      next: "接下来",
      yours: "该你了",
      removeFromItem: "从事项移出",
      undo: "撤销",
      gone: "已不在",
      noAccess: "无权查看",
      convertTo: "变成 Goal",
      markDone: "标完成",
      addGroup: "新建分组",
      delGroup: "删组并入相邻组",
      close: "关闭",
    },
    en: {
      title: "Batch 37 Prototypes",
      views: { v371: "37-1 Generated Page (36A First Page)", v372: "37-2 Work Items & Workbench" },
      planLbl: "Option",
      stateLbl: "State",
      plans371: {
        dl_on: "Plan B + 5 Design-Language Checks (Recommended)",
        dl_off: "Plan B (Baseline Checks Only)",
      },
      states371: {
        active: "v2 Active (36A First Page: Brief Lede + Generated Body)",
        draft: "Review Draft (Plan B Side-by-Side + Adoption Bar)",
        conflict: "Manual Edit Conflict (Field-Level Diff)",
        fallback: "Load Failure (Safe Fallback to Default First Page)",
      },
      plans372: {
        a: "Option A (Recommended): Inline Create + Reading-Flow Light Page",
        b: "Option B: Dialog Create + 2×2 Grid Light Page",
      },
      states372: {
        goal_item: "Switched to Release v2 (Goal-backed + This Item's Things)",
        light_item: "Switched to Q4 Prep (Light Work Item First Page)",
        empty: "Empty Mainline (Actionable Create + Dismissible Example)",
        home: "No Item Selected (Project Home)",
        organize: "Organize Mainline Cover",
      },
      notesOff: "Hide Board Marks",
      notesOn: "Highlight New Catalog Parts",
      reset: "Reset",
      personalSpace: "Personal Space",
      pinnedTag: "Pinned",
      projectsSec: "Projects",
      projectHome: "Project Home",
      recentSec: "Recently switched",
      searchPh: "Search items…",
      newItem: "New item",
      organize: "Organize mainline",
      allProjects: "All projects",
      newProject: "New project",
      putInItem: "Put in item",
      thisItemsStuff: "In this item",
      discussionIm: "Discussion / IM",
      imNote: "Decision 66 (R21): Right-panel IM stays available and can link threads to this item.",
      inItemPrefix: "In: ",
      wholeProject: "Whole project",
      scopeItem: "This item",
      scopeAll: "Whole project",
      otherWaiting: (n) => `${n} more waiting in other items`,
      emptyGuide: "No work items yet. Name one to start, or try the dismissible example below.",
      exampleBadge: "Example",
      exampleTitle: "Prepare weekly release checklist",
      exampleSub: "Click to try switching, or dismiss in one click",
      clearExample: "Dismiss example",
      createLight: "Name only (light item)",
      createGoal: "Create as Goal",
      createTodo: "Create as Todo",
      createPh: "Item name, Enter to create…",
      createBtn: "Create",
      cancel: "Cancel",
      workBriefHead: "Project Home · First Page",
      adopt: "Adopt v3…",
      discardDraft: "Discard draft",
      restorePrev: "Restore v2",
      backDefault: "Return to default first page",
      checksOk: "Checks passed (4/4 · Semantic tokens & ≥4.5 contrast)",
      checksBasic: "Checks passed (4/4)",
      conflictTitle: "Your manual edit conflicts with v3",
      keepMine: "Keep mine",
      useNew: "Use new",
      mergeEdit: "Merge & edit",
      fallbackTitle: "Version 3 could not open inside the isolated frame",
      fallbackBody: "Safely fell back to the default Project First Page. Your v3 draft and manual edits stay intact.",
      retryOpen: "Try again",
      done: "Done",
      doing: "In progress",
      next: "Next",
      yours: "Your turn",
      removeFromItem: "Remove from item",
      undo: "Undo",
      gone: "No longer here",
      noAccess: "No access",
      convertTo: "Turn into Goal",
      markDone: "Mark done",
      addGroup: "Add group",
      delGroup: "Delete group & merge",
      close: "Close",
    },
  };

  function initialState() {
    return {
      view: "v372",
      plan371: "dl_on",
      state371: "draft",
      plan372: "a",
      state372: "goal_item",
      width: "1440",
      lang: "zh",
      theme: "light",
      notes: "off",
      // 37-1 interactive state
      checksOpen: false,
      adoptedV3: false,
      conflictChoice: null,
      // 37-2 interactive state
      swOpen: true,
      swProject: "p1",
      swSearch: "",
      expandedGroups: { now: true, next: false, waiting: false },
      currentItem: "i1", // null = project home
      activeTab: null, // null = item first page
      sideOpen: true,
      sideTab: "stuff", // stuff | im
      inlineCreating: false,
      modalCreating: false,
      createKind: "light",
      createName: "",
      showExample: true,
      placePopOpen: false,
      listPop: null, // null | done | doing | next
      listScope: "item", // item | all
      inItemPillActive: true,
      organizeOpen: false,
      draftsByItem: { i1: "帮我检查 PR #412 合并前清单", i2: "", home: "" },
      groups: [
        { id: "now", nameZh: "现在", nameEn: "Now", items: ["i1", "i2"] },
        { id: "next", nameZh: "接下来", nameEn: "Next", items: ["i3"] },
        { id: "waiting", nameZh: "等别人", nameEn: "Waiting", items: ["i4"] },
      ],
      items: {
        i1: { id: "i1", titleZh: "发布 v2", titleEn: "Release v2", kind: "goal", state: "doing", waiting: 2, doing: 1, done: 3, next: 2, pinned: true, tabs: [{ id: "t1", titleZh: "发布检查文档", titleEn: "Release Doc" }, { id: "t2", titleZh: "Coding · PR #412", titleEn: "Coding · PR #412" }] },
        i2: { id: "i2", titleZh: "Q4 复盘准备", titleEn: "Q4 Review Prep", kind: "light", state: "waiting", waiting: 1, doing: 1, done: 1, next: 2, pinned: false, tabs: [] },
        i3: { id: "i3", titleZh: "定价页文案改版", titleEn: "Pricing Copy Refresh", kind: "light", state: "idle", waiting: 0, doing: 0, done: 2, next: 1, pinned: false, tabs: [] },
        i4: { id: "i4", titleZh: "法务条款确认", titleEn: "Legal Terms Sign-off", kind: "todo", state: "waiting", waiting: 1, doing: 0, done: 0, next: 1, pinned: false, tabs: [] },
      },
      held: {
        i1: [
          { id: "h1", kind: "Pages", titleZh: "发布 2.3 说明文档", titleEn: "Release 2.3 Notes", relZh: "你放进来的", relEn: "Added by you", status: "ok" },
          { id: "h2", kind: "Coding", titleZh: "fix/release-gate PR #412", titleEn: "fix/release-gate PR #412", relZh: "挂在 Goal 上（来源关联）", relEn: "Linked via Goal source", status: "ok" },
          { id: "h3", kind: "Pages", titleZh: "", titleEn: "", relZh: "原对象已删除", relEn: "Deleted at owner", status: "gone" },
          { id: "h4", kind: "Docs", titleZh: "", titleEn: "", relZh: "当前账号无权查看", relEn: "Unauthorized", status: "denied" },
        ],
        i2: [
          { id: "h5", kind: "Dataset", titleZh: "Q4 指标汇总表", titleEn: "Q4 Metrics Table", relZh: "你放进来的", relEn: "Added by you", status: "ok" },
        ],
      },
      removedHeldBackup: null,
    };
  }

  let S = initialState();
  const t = () => TEXT[S.lang];
  const l = (zh, en) => (S.lang === "zh" ? zh : en);

  function toast(msg, undoFn) {
    const box = document.getElementById("toasts");
    box.innerHTML = `<div class="mw-toast" role="status"><span>${esc(msg)}</span>${undoFn ? `<button type="button" class="mw-toast__action" id="toast-undo">${esc(t().undo)}</button>` : ""}</div>`;
    if (undoFn) {
      document.getElementById("toast-undo")?.addEventListener("click", () => {
        undoFn();
        box.innerHTML = "";
        render();
      });
    }
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => { box.innerHTML = ""; }, 4000);
  }

  function renderControls() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.dataset.resolvedTheme = S.theme;
    document.getElementById("p-title").textContent = t().title;
    document.getElementById("lbl-plan").textContent = t().planLbl;
    document.getElementById("lbl-state").textContent = t().stateLbl;
    document.getElementById("ctrl-reset").querySelector("[data-slot=button-label]").textContent = t().reset;

    const tg = (id, items, cur, onPick) => {
      const el = document.getElementById(id);
      el.innerHTML = items.map(([v, label]) => `<button type="button" class="mw-toggle${cur === v ? " is-current" : ""}" aria-pressed="${cur === v}" data-v="${v}">${esc(label)}</button>`).join("");
      el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { onPick(b.dataset.v); render(); }));
    };

    tg("ctrl-view", [["v371", t().views.v371], ["v372", t().views.v372]], S.view, (v) => { S.view = v; });
    tg("ctrl-width", [["1440", "1440"], ["1024", "1024"], ["390", "390"]], S.width, (v) => { S.width = v; });
    tg("ctrl-lang", [["zh", "中文"], ["en", "EN"]], S.lang, (v) => { S.lang = v; });
    tg("ctrl-theme", [["light", l("浅色", "Light")], ["dark", l("深色", "Dark")]], S.theme, (v) => { S.theme = v; });
    tg("ctrl-notes", [["off", t().notesOff], ["on", t().notesOn]], S.notes, (v) => { S.notes = v; });

    const sel = (id, entries, cur, onPick) => {
      const el = document.getElementById(id);
      el.innerHTML = Object.entries(entries).map(([k, lbl]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(lbl)}</option>`).join("");
      el.onchange = () => { onPick(el.value); render(); };
    };

    if (S.view === "v371") {
      sel("ctrl-plan", t().plans371, S.plan371, (v) => { S.plan371 = v; });
      sel("ctrl-state", t().states371, S.state371, (v) => {
        S.state371 = v;
        S.adoptedV3 = false;
      });
    } else {
      sel("ctrl-plan", t().plans372, S.plan372, (v) => { S.plan372 = v; });
      sel("ctrl-state", t().states372, S.state372, (v) => {
        S.state372 = v;
        S.organizeOpen = v === "organize";
        if (v === "goal_item") { S.currentItem = "i1"; S.swOpen = false; S.activeTab = null; S.sideOpen = true; }
        else if (v === "light_item") { S.currentItem = "i2"; S.swOpen = false; S.activeTab = null; S.sideOpen = true; }
        else if (v === "empty") { S.currentItem = null; S.swOpen = true; S.showExample = true; }
        else if (v === "home") { S.currentItem = null; S.swOpen = false; }
      });
    }
  }

  function renderGeneratedTable(isDraft, ver) {
    const rows = [
      { name: l("升级链金样回放", "Upgrade golden replay"), owner: l("林森", "Lin"), pr: "#412 ✓", status: "done" },
      { name: l("页面隔离 CSP 验收", "Page sandbox CSP check"), owner: l("一骏", "Yijun"), pr: l("#418 · 审中", "#418 · Review"), status: "waiting" },
      { name: l("中英翻译巡检", "i18n copy audit"), owner: l("陈岚", "Chen"), pr: l("#419 · 跑中", "#419 · Running"), status: "doing" },
    ];
    const ownerHead = ver === 2 ? l("谁在做（已手改）", "Owner (edited)") : (S.conflictChoice === "mine" ? l("谁在做", "Owner") : l("负责人", "Assignee"));
    return `<table class="b37-table">
      <thead><tr><th>${esc(l("事项", "Task"))}</th><th>${esc(ownerHead)}</th>${ver === 3 ? `<th>${esc(l("PR 状态（新增）", "PR Status (new)"))}</th>` : ""}<th>${esc(l("操作", "Action"))}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${renderStateRing({ state: r.status, size: "sm" })} ${esc(r.name)}</td>
        <td>${esc(r.owner)}</td>
        ${ver === 3 ? `<td>${renderBadge({ label: r.pr })}</td>` : ""}
        <td>${isDraft ? `<span class="gp-muted" style="font-size:11px;color:var(--muted);margin-right:4px">${esc(l("预览中不执行", "Preview only"))}</span>` : ""}<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" ${isDraft ? "data-preview-blocked" : "data-real-done"}><span data-slot="button-label">${esc(l("标完成", "Done"))}</span></button></td>
      </tr>`).join("")}</tbody>
    </table>`;
  }

  function render371Body() {
    const isDl = S.plan371 === "dl_on";
    const st = S.state371;
    const verLabel = S.adoptedV3 ? l("第 3 版（刚采用）", "v3 (adopted)") : l("第 2 版 · 发布检查台", "v2 · Release Console");
    const lede = `<div class="b37-lede">
      <span>${esc(l("发布 2.3 还差 1 项安全核对即可冻结分支；", "Release 2.3 has 1 security check left before branch freeze; "))}</span><span class="is-yours">${esc(l("CSP 隔离规则等你确认", "CSP isolation rule waits for your sign-off"))}</span><sup>1</sup>
      <span>${esc(l("，Coding PR #419 正在跑回归测试。", ", Coding PR #419 is running regression."))}</span><sup>2</sup>
      <div class="b37-lede-foot">
        <span>${esc(l("Work Brief 开头保留在第一页顶部 · 3 分钟前更新", "Work Brief lede stays on top of First Page · updated 3m ago"))}</span>
        <span>·</span>
        <span>${esc(l("已删细栏「看基础首页」，改由版本菜单一键退回默认第一页", "Removed old slim-bar switch; fallback lives in Version menu"))}</span>
      </div>
    </div>`;

    let mount = "";
    if (st === "fallback") {
      mount = `${renderAlert({ tone: "danger", title: t().fallbackTitle, body: t().fallbackBody })}
        <div class="b37-gp-mount">
          <div class="b37-pane-head"><strong>${esc(l("默认「项目的第一页」正文（安全回退）", "Default Project First Page Body (Safe Fallback)"))}</strong>
          <div>${renderButton({ label: t().retryOpen, variant: "secondary", size: "sm", attrs: { "data-act": "retry-371" } })}</div></div>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("自你上次来 · 3 项更新", "Since your last visit · 3 updates"))}</strong><small>${esc(l("原待办、Coding 与第 3 版草稿均完好无损", "All Todo, Coding, and v3 draft data stay intact"))}</small></div></div>
        </div>`;
    } else if (st === "active" || S.adoptedV3) {
      const ver = S.adoptedV3 ? 3 : 2;
      mount = `<div class="b37-gp-mount${S.adoptedV3 && isDl ? " is-landed" : ""}">
        <div class="b37-pane-head">
          <strong>${esc(l(`发布检查台（生成页面 · 第 ${ver} 版正文挂载）`, `Release Console (Generated Body · v${ver})`))}</strong>
          <div style="display:flex;gap:6px;align-items:center">
            ${renderBadge({ label: l("隔离运行 · 仅已批准动作", "Isolated · Approved actions only") })}
            ${renderButton({ label: t().backDefault, variant: "secondary", size: "sm", attrs: { "data-act": "to-fallback" } })}
          </div>
        </div>
        ${renderGeneratedTable(false, ver)}
      </div>`;
    } else {
      const conflictHtml = st === "conflict" ? `<div class="b37-conflict" data-board-new="${esc(l("组件板新增：改动对照", "New Catalog: Edit Diff"))}">
        <strong>${esc(t().conflictTitle)}</strong>
        <div class="b37-conflict-grid">
          <div class="b37-conflict-box"><strong>${esc(l("你手动改过的（第 2 版）", "Your manual edit (v2)"))}</strong>${esc(l("列名：「负责人」→「谁在做」；默认隐藏已完成行", "Column: Assignee → Owner; Completed rows hidden"))}</div>
          <div class="b37-conflict-box"><strong>${esc(l("助理新草稿（第 3 版）", "Assistant draft (v3)"))}</strong>${esc(l("列名恢复为「负责人」，新增「PR 状态」列", "Column renamed back to Assignee, added PR Status"))}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="b37-chip" aria-pressed="${S.conflictChoice === "mine"}" data-conflict="mine">${esc(t().keepMine)}</button>
          <button type="button" class="b37-chip" aria-pressed="${S.conflictChoice === "new"}" data-conflict="new">${esc(t().useNew)}</button>
          <button type="button" class="b37-chip" aria-pressed="${S.conflictChoice === "merge"}" data-conflict="merge">${esc(t().mergeEdit)}</button>
        </div>
      </div>` : "";

      const checksDetail = S.checksOpen ? `<div class="b37-check-list">
        <div class="b37-check-item">${renderStateRing({ state: "done", size: "sm" })}<span>${esc(l("仅声明公开动作（待办读/写、Coding PR 读），无私有库与网络访问", "Public declared actions only, connect-src none"))}</span></div>
        <div class="b37-check-item">${renderStateRing({ state: "done", size: "sm" })}<span>${esc(l("SHA-256 双重校验与 CSP 哈希白名单通过", "Double SHA-256 & hash-only CSP verified"))}</span></div>
        ${isDl ? `<div class="b37-check-item">${renderStateRing({ state: "done", size: "sm" })}<span>${esc(l("语义变量校验通过（零裸色值，暖色仅用于等你/冲突）", "Semantic CSS tokens only (zero literal colors)"))}</span></div>
        <div class="b37-check-item">${renderStateRing({ state: "done", size: "sm" })}<span>${esc(l("对比度实测 ≥ 4.5（浅色与深色模式均过线）", "Contrast ≥ 4.5 verified in light & dark"))}</span></div>` : ""}
      </div>` : "";

      const canAdopt = st !== "conflict" || Boolean(S.conflictChoice);

      mount = `${conflictHtml}
        <div class="b37-split-b">
          <div class="b37-pane-card">
            <div class="b37-pane-head"><strong>${esc(l("现在在用 · 第 2 版", "Currently active · v2"))}</strong>${renderBadge({ label: l("你改过 2 处", "2 manual edits") })}</div>
            ${renderGeneratedTable(false, 2)}
          </div>
          <div class="b37-pane-card b37-pane-card--draft">
            <div class="b37-pane-head"><strong>${esc(l("第 3 版草稿（预览）", "Draft v3 (Preview)"))}</strong>${renderBadge({ label: l("新增 PR 状态栏", "Added PR column") })}</div>
            ${renderGeneratedTable(true, 3)}
          </div>
        </div>
        ${checksDetail}
        <div class="b37-adopt-bar" data-board-new="${esc(l("组件板新增：对照采用条", "New Catalog: Adoption Bar"))}">
          <button type="button" class="b37-check-btn" data-act="toggle-checks" data-board-new="${esc(l("组件板新增：检查摘要", "New Catalog: Check Summary"))}">${renderStateRing({ state: "done", size: "sm" })}<span>${esc(isDl ? t().checksOk : t().checksBasic)}</span></button>
          <span class="grow"></span>
          ${renderButton({ label: t().discardDraft, variant: "secondary", size: "sm", attrs: { "data-act": "discard-draft" } })}
          ${renderButton({ label: t().adopt, variant: "primary", size: "sm", disabled: !canAdopt, attrs: { "data-act": "adopt-v3" } })}
        </div>`;
    }

    return `<div class="b37-fp-wrap">
      <div class="b37-fp-meta">
        <span>${esc(t().workBriefHead)}</span>
        <span class="grow"></span>
        ${renderBadge({ label: verLabel })}
        ${renderButton({ label: t().restorePrev, variant: "ghost", size: "sm", attrs: { "data-act": "restore-v2" } })}
        ${renderButton({ label: t().backDefault, variant: "ghost", size: "sm", attrs: { "data-act": "to-fallback" } })}
      </div>
      <h1 class="b37-fp-title">${esc(l("发布 2.3", "Release 2.3"))}</h1>
      ${lede}
      ${mount}
    </div>`;
  }

  function renderSwitcherPopover() {
    const isEmpty = S.state372 === "empty" && Object.keys(S.items).length <= 4 && S.currentItem === null;
    const q = S.swSearch.trim().toLowerCase();
    const recentIds = ["i1", "i2", "i3"].filter((id) => S.items[id]);

    const itemRow = (item) => {
      const title = l(item.titleZh, item.titleEn);
      const active = S.currentItem === item.id;
      const srcTag = item.kind === "goal" ? "Goal" : item.kind === "todo" ? l("待办", "Todo") : l("轻量", "Light");
      return `<div class="b37-swp-item-wrap">
        <button type="button" class="b37-swp-row" ${active ? 'aria-current="page"' : ""} data-pick-item="${item.id}">
          ${renderStateRing({ state: item.state, size: "sm" })}
          <span class="b37-swp-row__main">
            <span class="b37-swp-row__title">${item.pinned ? "📌 " : ""}${esc(title)}</span>
            <span class="b37-swp-row__sub">${esc(srcTag)} · ${esc(l(`在办 ${item.doing}`, `${item.doing} active`))}</span>
          </span>
          ${item.waiting > 0 ? `<span class="b37-amber-pill">${item.waiting}</span>` : ""}
        </button>
        <span class="b37-swp-row__ops">
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-pin-item="${item.id}" title="${esc(l("固定", "Pin"))}">📌</button>
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-done-item="${item.id}" title="${esc(t().markDone)}">✓</button>
        </span>
      </div>`;
    };

    let rightBody = "";
    if (isEmpty) {
      rightBody = `<div class="b37-swp-empty">
        <p>${esc(t().emptyGuide)}</p>
        <div>${renderButton({ label: t().newItem, variant: "primary", size: "sm", icon: "plus", attrs: { "data-act": "start-create" } })}</div>
        ${S.showExample ? `<div class="b37-swp-example">
          ${renderStateRing({ state: "idle", size: "sm" })}
          <div class="b37-swp-example__text">
            <strong>${esc(t().exampleTitle)}</strong> ${renderBadge({ label: t().exampleBadge })}
            <small>${esc(t().exampleSub)}</small>
          </div>
          ${renderButton({ label: t().clearExample, variant: "ghost", size: "sm", attrs: { "data-act": "clear-example" } })}
        </div>` : ""}
      </div>`;
    } else {
      const recentHtml = !q ? `<div class="b37-swp-sec-lbl"><span>${esc(t().recentSec)}</span></div>${recentIds.map((id) => itemRow(S.items[id])).join("")}` : "";
      const groupsHtml = S.groups.map((g) => {
        const gItems = g.items.map((id) => S.items[id]).filter(Boolean).filter((it) => !q || l(it.titleZh, it.titleEn).toLowerCase().includes(q));
        if (q && !gItems.length) return "";
        const expanded = q ? true : Boolean(S.expandedGroups[g.id]);
        const waitSum = gItems.reduce((a, b) => a + b.waiting, 0);
        return `<div>
          <button type="button" class="b37-grp-head" aria-expanded="${expanded}" data-toggle-grp="${g.id}">
            ${icon("chevron-down")}<span>${esc(l(g.nameZh, g.nameEn))}</span>
            <span class="b37-grp-head__count">${gItems.length}</span>
            <span class="b37-grp-head__grow"></span>
            ${waitSum > 0 ? `<span class="b37-amber-pill">${waitSum}</span>` : ""}
          </button>
          ${expanded ? gItems.map(itemRow).join("") : ""}
        </div>`;
      }).join("");
      rightBody = recentHtml + groupsHtml;
    }

    const inlineForm = S.inlineCreating && S.plan372 === "a" ? `<div class="b37-inline-create">
      <div class="b37-inline-create__row">
        <input type="text" class="mw-input" id="inline-item-name" value="${esc(S.createName)}" placeholder="${esc(t().createPh)}" autocomplete="off">
        ${renderButton({ label: t().createBtn, variant: "primary", size: "sm", attrs: { "data-act": "confirm-create" } })}
      </div>
      <div class="b37-inline-create__chips">
        <button type="button" class="b37-chip" aria-pressed="${S.createKind === "light"}" data-ckind="light">${esc(t().createLight)}</button>
        <button type="button" class="b37-chip" aria-pressed="${S.createKind === "goal"}" data-ckind="goal">${esc(t().createGoal)}</button>
        <button type="button" class="b37-chip" aria-pressed="${S.createKind === "todo"}" data-ckind="todo">${esc(t().createTodo)}</button>
      </div>
    </div>` : "";

    return `<div class="b37-swp" role="dialog" aria-label="${esc(l("切换项目与事项", "Switch workspace and item"))}">
      <div class="b37-swp-left">
        <div class="b37-swp-sec-lbl"><span>${esc(t().personalSpace)}</span>${renderBadge({ label: t().pinnedTag })}</div>
        <button type="button" class="b37-swp-proj b37-swp-proj--personal" aria-pressed="${S.swProject === "personal"}" data-sw-proj="personal">
          ${icon("home")}<span class="b37-swp-proj__name">${esc(t().personalSpace)}</span>
        </button>
        <div class="b37-swp-sep"></div>
        <div class="b37-swp-sec-lbl"><span>${esc(t().projectsSec)}</span></div>
        <button type="button" class="b37-swp-proj" aria-pressed="${S.swProject === "p1"}" data-sw-proj="p1">
          ${icon("folder-open")}<span class="b37-swp-proj__name">${esc(l("发布 2.3", "Release 2.3"))}</span><span class="b37-amber-pill">4</span>
        </button>
        <button type="button" class="b37-swp-proj" aria-pressed="${S.swProject === "p2"}" data-sw-proj="p2">
          ${icon("folder")}<span class="b37-swp-proj__name">${esc(l("官网改版", "Website Redesign"))}</span>
        </button>
        <div class="b37-swp-foot">
          <button type="button" class="b37-swp-proj">${icon("grid")}<span class="b37-swp-proj__name">${esc(t().allProjects)}</span></button>
          <button type="button" class="b37-swp-proj">${icon("plus")}<span class="b37-swp-proj__name">${esc(t().newProject)}</span></button>
        </div>
      </div>
      <div class="b37-swp-right">
        <div class="b37-swp-search">
          <label class="mw-input-group">${icon("search")}<input class="mw-input" id="sw-search" type="search" value="${esc(S.swSearch)}" placeholder="${esc(t().searchPh)}" autocomplete="off"></label>
        </div>
        <button type="button" class="b37-swp-row" ${S.currentItem === null ? 'aria-current="page"' : ""} data-pick-home>
          ${icon("home")}<span class="b37-swp-row__main"><span class="b37-swp-row__title">${esc(t().projectHome)}</span><span class="b37-swp-row__sub">${esc(l("不选事项，看整个项目的第一页", "No item selected · Project first page"))}</span></span>
        </button>
        ${rightBody}
        ${inlineForm}
        <div class="b37-swp-bottom">
          ${renderButton({ label: t().newItem, variant: "secondary", size: "sm", icon: "plus", attrs: { "data-act": "start-create" } })}
          ${renderButton({ label: t().organize, variant: "ghost", size: "sm", attrs: { "data-act": "open-org" } })}
        </div>
      </div>
    </div>`;
  }

  function render372Main() {
    if (!S.currentItem) {
      return `<div class="b37-fp-wrap">
        <div class="b37-fp-meta"><span>${esc(t().workBriefHead)}</span><span class="grow"></span>${renderBadge({ label: l("未选事项 · 项目主页", "No item · Project Home") })}</div>
        <h1 class="b37-fp-title">${esc(l("发布 2.3", "Release 2.3"))}</h1>
        <div class="b37-lede"><span>${esc(l("当前未选中具体事项：显示整个项目的第一页，底栏和卡叠汇总全部事项。", "No work item selected: showing Project First Page with aggregated lists and stack."))}</span></div>
        <div class="b37-sec-card">
          <h3>${esc(l("自你上次来", "Since your last visit"))}</h3>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("发布 v2 · PR #418 等你确认隔离规则", "Release v2 · PR #418 awaits isolation sign-off"))}</strong><small>${esc(l("点左上角「项目 › 事项」切入专项工作台", "Use top-left switcher to enter item workspace"))}</small></div></div>
        </div>
      </div>`;
    }
    const item = S.items[S.currentItem];
    if (!item) return "";
    const title = l(item.titleZh, item.titleEn);

    if (S.activeTab) {
      return `<div class="b37-item-page">
        <div class="b37-item-head">
          <h1>${esc(S.activeTab)}</h1>
          <span class="grow"></span>
          ${renderButton({ label: t().putInItem, variant: "secondary", size: "sm", attrs: { "data-act": "toggle-place" } })}
        </div>
        <p style="color:var(--muted);font-size:13px">${esc(l("该页签只属于当前事项「" + title + "」的工作台状态；切到别的事项时整排页签会跟着换，切回时草稿和滚动位置原样恢复。", "This tab belongs to \"" + title + "\". Switching items swaps the tab strip and restores drafts & scroll on return."))}</p>
      </div>`;
    }

    if (item.kind === "goal") {
      return `<div class="b37-item-page">
        <div class="b37-item-head">
          ${renderStateRing({ state: item.state })}
          <h1>${esc(title)}</h1>
          ${renderBadge({ label: l("由 Goal 对象变成 · 打开主人对象页", "Goal-backed · Owner Object Page") })}
          <span class="grow"></span>
          ${renderButton({ label: t().putInItem, variant: "secondary", size: "sm", attrs: { "data-act": "toggle-place" } })}
          ${renderButton({ label: t().markDone, variant: "ghost", size: "sm", attrs: { "data-done-item": item.id } })}
        </div>
        <div class="b37-sec-card">
          <h3>${esc(l("Goal 主人对象页（Goals 插件自身渲染）", "Goal Owner Page (Rendered by Goals plugin)"))}</h3>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("下一步建议：确认 PR #418 隔离策略", "Next step: Confirm PR #418 isolation policy"))}</strong><small>${esc(l("来自 Goals 的 next 声明，同步进入事项线（WLN-19）", "From Goals next declaration on work line (WLN-19)"))}</small></div>${renderButton({ label: l("开始", "Start"), variant: "primary", size: "sm" })}</div>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("关联 Coding 会话：fix/release-gate", "Linked Coding session: fix/release-gate"))}</strong><small>${esc(l("来自 Coding 事项来源声明，正在后台运行，切走事项不改归属", "From Coding source; runs in background across switches"))}</small></div></div>
        </div>
      </div>`;
    }

    // Lightweight item first page (Option A reading rhythm vs Option B 2x2 grid)
    const groupsClass = S.plan372 === "b" ? "b37-item-groups b37-item-groups--grid" : "b37-item-groups";
    return `<div class="b37-item-page">
      <div class="b37-item-head">
        ${renderStateRing({ state: item.state })}
        <h1>${esc(title)}</h1>
        ${renderBadge({ label: l("轻量事项 · 平台第一页", "Light Item · Platform First Page") })}
        <span class="grow"></span>
        ${renderButton({ label: t().convertTo, variant: "secondary", size: "sm", attrs: { "data-act": "convert-goal" } })}
        ${renderButton({ label: t().markDone, variant: "ghost", size: "sm", attrs: { "data-done-item": item.id } })}
      </div>
      <div class="${groupsClass}">
        <div class="b37-sec-card">
          <h3><span class="b37-amber-pill">1</span> ${esc(t().yours)}</h3>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("确认复盘数据口径", "Confirm review metric scope"))}</strong><small>${esc(l("助理提问 · 仅在此事项内等待", "Assistant question · scoped to this item"))}</small></div>${renderButton({ label: l("回答", "Reply"), variant: "primary", size: "sm" })}</div>
        </div>
        <div class="b37-sec-card">
          <h3>${renderStateRing({ state: "doing", size: "sm" })} ${esc(t().doing)}</h3>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("汇总 Q4 关键交付清单", "Summarizing Q4 key deliveries"))}</strong><small>${esc(l("所属事项：Q4 复盘准备 · 后台运行中", "Item: Q4 Review Prep · Running"))}</small></div></div>
        </div>
        <div class="b37-sec-card">
          <h3>${esc(t().next)}</h3>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("向助理交代下一步或把资料放进这件事", "Ask assistant for next step or add materials"))}</strong><small>${esc(l("轻量事项不带复杂状态流，需要时可一键「变成 Goal / 待办」", "Light items stay minimal; convert to Goal/Todo anytime"))}</small></div></div>
        </div>
        <div class="b37-sec-card">
          <h3>${renderStateRing({ state: "done", size: "sm" })} ${esc(t().done)}</h3>
          <div class="b37-ev-row"><div class="b37-ev-row__body"><strong>${esc(l("已放进「Q4 指标汇总表」", "Added Q4 Metrics Table"))}</strong><small>${esc(l("10 分钟前", "10m ago"))}</small></div></div>
        </div>
      </div>
    </div>`;
  }

  function renderSidePanel() {
    if (!S.sideOpen) return "";
    const curHeld = S.currentItem ? (S.held[S.currentItem] || []) : [];
    const stuffHtml = !S.currentItem
      ? `<p style="font-size:12px;color:var(--muted);margin:0">${esc(l("选择一件事项后，这里显示「这件事的东西」（装进来的对象 + 原有 placement 与来源插件关联）。", "Pick a work item to see everything held in and linked to it."))}</p>`
      : curHeld.map((h) => {
          const broken = h.status !== "ok";
          const label = h.status === "gone" ? t().gone : h.status === "denied" ? t().noAccess : l(h.titleZh, h.titleEn);
          return `<div class="b37-held-row${broken ? " is-broken" : ""}">
            <div class="b37-held-row__info">
              <strong>${esc(broken ? `${h.kind} · ${label}` : label)}</strong>
              <small>${esc(h.kind)} · ${esc(l(h.relZh, h.relEn))}</small>
            </div>
            <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-rm-held="${h.id}" title="${esc(t().removeFromItem)}">×</button>
          </div>`;
        }).join("");

    const imHtml = `<div class="b37-im-msg"><strong>${esc(l("系统说明 · 决定 66（R21）", "Note · Decision 66 (R21)"))}</strong>${esc(t().imNote)}</div>
      <div class="b37-im-msg"><strong>${esc(l("林森 · 刚才", "Lin · Just now"))}</strong>${esc(l("PR #418 的沙箱测试我补好了，可以挂进「发布 v2」。", "Added sandbox tests for PR #418, ready to link into Release v2."))}</div>`;

    return `<aside class="b37-side" aria-label="${esc(l("右侧边栏", "Right side panel"))}">
      <div class="b37-side-tabs" role="tablist">
        <button type="button" class="b37-side-tab" role="tab" aria-selected="${S.sideTab === "stuff"}" data-side-tab="stuff">${icon("folder")}<span>${esc(t().thisItemsStuff)}</span></button>
        <button type="button" class="b37-side-tab" role="tab" aria-selected="${S.sideTab === "im"}" data-side-tab="im">${icon("message")}<span>${esc(t().discussionIm)}</span></button>
      </div>
      <div class="b37-side-body">${S.sideTab === "stuff" ? stuffHtml : imHtml}</div>
    </aside>`;
  }

  function renderOrganizeCover() {
    if (!S.organizeOpen) return "";
    return `<div class="b37-org-cover" role="dialog" aria-label="${esc(t().organize)}">
      <div class="b37-item-head" style="border-bottom:1px solid var(--line)">
        <h1>${esc(t().organize)}</h1>
        <span class="grow"></span>
        ${renderButton({ label: t().addGroup, variant: "secondary", size: "sm", icon: "plus", attrs: { "data-act": "org-add-grp" } })}
        ${renderButton({ label: t().close, variant: "primary", size: "sm", attrs: { "data-act": "close-org" } })}
      </div>
      <div class="b37-org-cols">
        ${S.groups.map((g, gi) => `<div class="b37-org-col">
          <div class="b37-org-col__head">
            <span>${esc(l(g.nameZh, g.nameEn))}</span>
            <span class="b37-grp-head__count">${g.items.length}</span>
            <span class="grow"></span>
            ${S.groups.length > 1 ? `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-del-grp="${g.id}" title="${esc(t().delGroup)}">×</button>` : ""}
          </div>
          ${g.items.map((id, idx) => {
            const it = S.items[id];
            if (!it) return "";
            return `<div class="b37-ev-row">
              ${renderStateRing({ state: it.state, size: "sm" })}
              <div class="b37-ev-row__body"><strong>${esc(l(it.titleZh, it.titleEn))}</strong><small>${esc(l(`等你 ${it.waiting} · 在办 ${it.doing}`, `Waiting ${it.waiting} · Active ${it.doing}`))}</small></div>
              <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-move-up="${g.id}:${idx}" title="${esc(l("上移", "Move up"))}">↑</button>
              <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-move-grp="${g.id}:${idx}:${(gi + 1) % S.groups.length}" title="${esc(l("移到下一组", "Move to next group"))}">→</button>
            </div>`;
          }).join("")}
        </div>`).join("")}
      </div>
    </div>`;
  }

  function renderHelm() {
    const cur = S.currentItem ? S.items[S.currentItem] : null;
    const totalWaiting = Object.values(S.items).reduce((a, b) => a + b.waiting, 0);
    const curWaiting = cur ? cur.waiting : totalWaiting;
    const otherWaiting = Math.max(0, totalWaiting - curWaiting);
    const doneN = cur ? cur.done : 6;
    const doingN = cur ? cur.doing : 2;
    const nextN = cur ? cur.next : 6;
    const draftKey = S.currentItem || "home";
    const draftVal = S.draftsByItem[draftKey] || "";
    const curName = cur ? l(cur.titleZh, cur.titleEn) : t().projectHome;

    const listPop = S.listPop ? `<div class="b37-list-pop" role="dialog">
      <div class="b37-list-pop__head">
        <strong>${esc(S.listPop === "done" ? t().done : S.listPop === "doing" ? t().doing : t().next)}</strong>
        <div class="mw-toggle-group" role="group">
          <button type="button" class="mw-toggle${S.listScope === "item" ? " is-current" : ""}" aria-pressed="${S.listScope === "item"}" data-lscope="item">${esc(t().scopeItem)}</button>
          <button type="button" class="mw-toggle${S.listScope === "all" ? " is-current" : ""}" aria-pressed="${S.listScope === "all"}" data-lscope="all">${esc(t().scopeAll)}</button>
        </div>
      </div>
      <div class="b37-ev-row">${renderStateRing({ state: "doing", size: "sm" })}<div class="b37-ev-row__body"><strong>${esc(l("PR #412 回归测试", "PR #412 regression run"))}</strong><small>${esc(l("所属事项：发布 v2（切走事项归属不变）", "Item: Release v2 (owner unchanged across switches)"))}</small></div></div>
      ${S.listScope === "all" ? `<div class="b37-ev-row">${renderStateRing({ state: "doing", size: "sm" })}<div class="b37-ev-row__body"><strong>${esc(l("汇总 Q4 关键交付清单", "Summarizing Q4 deliveries"))}</strong><small>${esc(l("所属事项：Q4 复盘准备", "Item: Q4 Review Prep"))}</small></div></div>` : ""}
    </div>` : "";

    return `${listPop}<footer class="b37-helm">
      <div class="b37-island b37-acct">
        <span class="b37-avatar">Y</span>
        <div class="b37-acct__meta"><strong>Yijun</strong><small>${esc(l("本机已同步", "Synced"))}</small></div>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" aria-label="${esc(l("插件", "Plugins"))}">${icon("grid")}</button>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" aria-label="${esc(l("设置", "Settings"))}">${icon("tune")}</button>
      </div>
      <div class="b37-island b37-composer">
        <div class="b37-comp-top">
          <input class="b37-comp-input" id="comp-input" value="${esc(draftVal)}" placeholder="${esc(l(`对「${curName}」主对话说点什么…`, `Message main thread of "${curName}"…`))}">
          <div class="b37-comp-counts">
            <button type="button" class="b37-count-btn" aria-pressed="${S.listPop === "done"}" data-lpop="done">✓ ${doneN}</button>
            <button type="button" class="b37-count-btn" aria-pressed="${S.listPop === "doing"}" data-lpop="doing">◌ ${doingN}</button>
            <button type="button" class="b37-count-btn" aria-pressed="${S.listPop === "next"}" data-lpop="next">→ ${nextN}</button>
          </div>
        </div>
        <div class="b37-comp-foot">
          ${cur && S.inItemPillActive ? `<span class="b37-in-pill"><span>${esc(t().inItemPrefix + curName)}</span><button type="button" data-act="clear-in-pill" aria-label="${esc(t().wholeProject)}">×</button></span>` : `<span>${esc(t().wholeProject)}</span>`}
          <span style="margin-left:auto">${esc(l("✦ 助理 · 每事项独立主对话", "✦ Assistant · Per-item main thread"))}</span>
        </div>
      </div>
      <div class="b37-island b37-stack">
        <div class="b37-stack__head"><span class="b37-amber-pill">${curWaiting}</span><span>${esc(curWaiting ? l("确认 CSP 隔离策略", "Confirm CSP policy") : l("本事项没有等你的", "Nothing waiting here"))}</span></div>
        <div class="b37-stack__foot">
          ${otherWaiting > 0 ? `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-act="open-sw-from-stack">${esc(t().otherWaiting(otherWaiting))}</button>` : `<span>${esc(l("全部已处理", "All clear"))}</span>`}
        </div>
      </div>
    </footer>`;
  }

  function render() {
    renderControls();
    const app = document.getElementById("app");
    app.dataset.width = S.width;
    app.dataset.notes = S.notes;

    const cur = S.view === "v372" && S.currentItem ? S.items[S.currentItem] : null;
    const cornerLabel = cur ? l(cur.titleZh, cur.titleEn) : t().projectHome;
    const cornerWait = cur ? cur.waiting : Object.values(S.items).reduce((a, b) => a + b.waiting, 0);
    const tabs = cur ? cur.tabs : [];

    const placePop = S.placePopOpen ? `<div class="b37-place-pop" role="dialog" aria-label="${esc(t().putInItem)}">
      <div class="b37-swp-sec-lbl"><span>${esc(t().putInItem)}</span></div>
      ${Object.values(S.items).map((it) => `<button type="button" class="b37-swp-row" data-place-into="${it.id}">${renderStateRing({ state: it.state, size: "sm" })}<span>${esc(l(it.titleZh, it.titleEn))}</span></button>`).join("")}
    </div>` : "";

    const modalCreate = S.modalCreating && S.plan372 === "b" ? `<div class="b37-modal-shade"><div class="b37-modal" role="dialog">
      <h3>${esc(t().newItem)}</h3>
      <input type="text" class="mw-input" id="modal-item-name" value="${esc(S.createName)}" placeholder="${esc(t().createPh)}">
      <div class="b37-inline-create__chips">
        <button type="button" class="b37-chip" aria-pressed="${S.createKind === "light"}" data-ckind="light">${esc(t().createLight)}</button>
        <button type="button" class="b37-chip" aria-pressed="${S.createKind === "goal"}" data-ckind="goal">${esc(t().createGoal)}</button>
        <button type="button" class="b37-chip" aria-pressed="${S.createKind === "todo"}" data-ckind="todo">${esc(t().createTodo)}</button>
      </div>
      <div class="b37-modal-foot">
        ${renderButton({ label: t().cancel, variant: "secondary", size: "sm", attrs: { "data-act": "cancel-create" } })}
        ${renderButton({ label: t().createBtn, variant: "primary", size: "sm", attrs: { "data-act": "confirm-create" } })}
      </div>
    </div></div>` : "";

    app.innerHTML = `
      <header class="b37-top">
        <div class="b37-hist">
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" aria-label="Back">${icon("back")}</button>
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" aria-label="Forward">${icon("arrow")}</button>
        </div>
        <div class="b37-corner">
          <button type="button" class="b37-corner-btn" data-act="toggle-sw" aria-expanded="${S.view === "v372" && S.swOpen}" ${!S.activeTab ? 'aria-current="page"' : ""}>
            ${cur ? renderStateRing({ state: cur.state, size: "sm" }) : icon("home")}
            <span class="b37-corner-proj">${esc(l("发布 2.3", "Release 2.3"))}</span>
            <span class="b37-corner-sep">›</span>
            <span class="b37-corner-item">${esc(cornerLabel)}</span>
            ${cornerWait > 0 ? `<span class="b37-amber-pill">${cornerWait}</span>` : ""}
            ${icon("chevron-down")}
          </button>
          ${S.view === "v372" && S.swOpen ? renderSwitcherPopover() : ""}
        </div>
        <nav class="b37-tabs" aria-label="${esc(l("当前事项页签", "Current item tabs"))}">
          ${tabs.map((tb) => {
            const lbl = l(tb.titleZh, tb.titleEn);
            return `<button type="button" class="b37-tab" ${S.activeTab === lbl ? 'aria-current="page"' : ""} data-open-tab="${esc(lbl)}"><span class="b37-tab__label">${esc(lbl)}</span><span class="b37-tab__x" data-close-tab="${tb.id}">×</span></button>`;
          }).join("")}
        </nav>
        <div class="b37-top-end">
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" data-act="toggle-side" aria-pressed="${S.sideOpen}" aria-label="${esc(l("侧边栏", "Side panel"))}">${icon("panel")}</button>
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" aria-label="${esc(l("分屏", "Split"))}">${icon("columns")}</button>
        </div>
      </header>
      <div class="b37-main-grid" data-side="${S.view === "v372" && S.sideOpen ? "open" : "closed"}">
        <main class="b37-sheet">${S.view === "v371" ? render371Body() : render372Main()}${placePop}</main>
        ${S.view === "v372" ? renderSidePanel() : ""}
      </div>
      ${renderHelm()}
      ${renderOrganizeCover()}
      ${modalCreate}
    `;

    bindEvents();
  }

  function bindEvents() {
    const app = document.getElementById("app");
    app.querySelectorAll("[data-act]").forEach((el) => {
      el.addEventListener("click", () => {
        const a = el.dataset.act;
        if (a === "toggle-checks") S.checksOpen = !S.checksOpen;
        else if (a === "adopt-v3") { S.adoptedV3 = true; toast(l("已采用第 3 版，并挂为「项目的第一页」正文", "Adopted v3 as Project First Page body"), () => { S.adoptedV3 = false; }); }
        else if (a === "discard-draft") { S.state371 = "active"; toast(l("已放弃第 3 版草稿，继续使用第 2 版", "Discarded v3 draft")); }
        else if (a === "restore-v2") { S.adoptedV3 = false; S.state371 = "active"; toast(l("已恢复第 2 版（不会重做已完成的待办操作）", "Restored v2 without replaying completed actions")); }
        else if (a === "to-fallback") { S.state371 = "fallback"; }
        else if (a === "retry-371") { S.state371 = "active"; toast(l("已重新加载第 2 版", "Reloaded v2")); }
        else if (a === "toggle-sw") { if (S.view === "v372") S.swOpen = !S.swOpen; }
        else if (a === "open-sw-from-stack") { S.swOpen = true; }
        else if (a === "toggle-side") { S.sideOpen = !S.sideOpen; }
        else if (a === "start-create") {
          if (S.plan372 === "a") S.inlineCreating = true;
          else S.modalCreating = true;
        }
        else if (a === "cancel-create") { S.inlineCreating = false; S.modalCreating = false; S.createName = ""; }
        else if (a === "confirm-create") {
          const inp = document.getElementById("inline-item-name") || document.getElementById("modal-item-name");
          const nm = (inp?.value || S.createName || "").trim() || l("新事项", "New item");
          const id = "i" + (Object.keys(S.items).length + 1);
          S.items[id] = { id, titleZh: nm, titleEn: nm, kind: S.createKind, state: "idle", waiting: 0, doing: 0, done: 0, next: 0, pinned: false, tabs: [] };
          S.groups[0].items.push(id);
          S.held[id] = [];
          S.currentItem = id;
          S.state372 = S.createKind === "light" ? "light_item" : "goal_item";
          S.inlineCreating = false; S.modalCreating = false; S.createName = ""; S.swOpen = false;
          toast(l(`已新建并切到「${nm}」`, `Created and switched to "${nm}"`));
        }
        else if (a === "clear-example") { S.showExample = false; toast(l("已清除示例事项", "Dismissed example")); }
        else if (a === "open-org") { S.organizeOpen = true; S.swOpen = false; }
        else if (a === "close-org") { S.organizeOpen = false; }
        else if (a === "org-add-grp") {
          const gid = "g" + (S.groups.length + 1);
          S.groups.push({ id: gid, nameZh: "新分组 " + S.groups.length, nameEn: "Group " + S.groups.length, items: [] });
        }
        else if (a === "toggle-place") { S.placePopOpen = !S.placePopOpen; }
        else if (a === "clear-in-pill") { S.inItemPillActive = false; toast(l("这一句将发往整个项目主对话", "Next message will target whole project")); }
        else if (a === "convert-goal") {
          const it = S.items[S.currentItem];
          if (it) { it.kind = "goal"; toast(l("已变成 Goal，原装进来的对象一件不少", "Converted to Goal; all held objects preserved")); }
        }
        render();
      });
    });

    app.querySelectorAll("[data-conflict]").forEach((b) => b.addEventListener("click", () => { S.conflictChoice = b.dataset.conflict; render(); }));
    app.querySelectorAll("[data-preview-blocked]").forEach((b) => b.addEventListener("click", () => toast(l("预览中不执行写入操作，采用后才会真实生效", "Preview mode blocks write actions until adopted"))));
    app.querySelectorAll("[data-real-done]").forEach((b) => b.addEventListener("click", () => toast(l("已调用待办公开动作标完成（可撤销）", "Marked done via Todo public action"), () => {})));
    app.querySelectorAll("[data-sw-proj]").forEach((b) => b.addEventListener("click", () => { S.swProject = b.dataset.swProj; render(); }));
    app.querySelectorAll("[data-pick-home]").forEach((b) => b.addEventListener("click", () => { S.currentItem = null; S.activeTab = null; S.swOpen = false; S.inItemPillActive = true; render(); }));
    app.querySelectorAll("[data-pick-item]").forEach((b) => b.addEventListener("click", () => {
      S.currentItem = b.dataset.pickItem;
      S.activeTab = null;
      S.swOpen = false;
      S.inItemPillActive = true;
      toast(l(`已切到「${l(S.items[S.currentItem].titleZh, S.items[S.currentItem].titleEn)}」，在途任务归属不变`, "Switched item; running tasks stay on their original item"));
      render();
    }));
    app.querySelectorAll("[data-toggle-grp]").forEach((b) => b.addEventListener("click", () => { S.expandedGroups[b.dataset.toggleGrp] = !S.expandedGroups[b.dataset.toggleGrp]; render(); }));
    app.querySelectorAll("[data-pin-item]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const it = S.items[b.dataset.pinItem]; if (it) it.pinned = !it.pinned; render(); }));
    app.querySelectorAll("[data-done-item]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.doneItem;
      toast(l("已收进「已完成」折叠区", "Moved to Completed"), () => {});
      render();
    }));
    app.querySelectorAll("[data-ckind]").forEach((b) => b.addEventListener("click", () => { S.createKind = b.dataset.ckind; render(); }));
    app.querySelectorAll("[data-side-tab]").forEach((b) => b.addEventListener("click", () => { S.sideTab = b.dataset.sideTab; render(); }));
    app.querySelectorAll("[data-open-tab]").forEach((b) => b.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-tab]")) return;
      S.activeTab = b.dataset.openTab; render();
    }));
    app.querySelectorAll("[data-close-tab]").forEach((b) => b.addEventListener("click", () => {
      const it = S.items[S.currentItem];
      if (it) it.tabs = it.tabs.filter((x) => x.id !== b.dataset.closeTab);
      S.activeTab = null; render();
    }));
    app.querySelectorAll("[data-rm-held]").forEach((b) => b.addEventListener("click", () => {
      const list = S.held[S.currentItem] || [];
      const removed = list.find((x) => x.id === b.dataset.rmHeld);
      S.held[S.currentItem] = list.filter((x) => x.id !== b.dataset.rmHeld);
      toast(l("已从事项移出（原对象未删除）", "Removed from item (source object kept)"), () => { if (removed) S.held[S.currentItem].push(removed); });
      render();
    }));
    app.querySelectorAll("[data-place-into]").forEach((b) => b.addEventListener("click", () => {
      S.placePopOpen = false;
      const it = S.items[b.dataset.placeInto];
      toast(l(`已放进「${l(it.titleZh, it.titleEn)}」`, `Added to "${l(it.titleZh, it.titleEn)}"`));
      render();
    }));
    app.querySelectorAll("[data-lpop]").forEach((b) => b.addEventListener("click", () => { S.listPop = S.listPop === b.dataset.lpop ? null : b.dataset.lpop; render(); }));
    app.querySelectorAll("[data-lscope]").forEach((b) => b.addEventListener("click", () => { S.listScope = b.dataset.lscope; render(); }));
    app.querySelectorAll("[data-del-grp]").forEach((b) => b.addEventListener("click", () => {
      const idx = S.groups.findIndex((g) => g.id === b.dataset.delGrp);
      if (idx >= 0 && S.groups.length > 1) {
        const target = idx > 0 ? idx - 1 : 1;
        S.groups[target].items.push(...S.groups[idx].items);
        S.groups.splice(idx, 1);
        toast(l("已删除分组，组内事项已并入相邻组", "Group deleted; items merged into adjacent group"));
        render();
      }
    }));
    app.querySelectorAll("[data-move-up]").forEach((b) => b.addEventListener("click", () => {
      const [gid, iStr] = b.dataset.moveUp.split(":");
      const i = Number(iStr);
      const g = S.groups.find((x) => x.id === gid);
      if (g && i > 0) { [g.items[i - 1], g.items[i]] = [g.items[i], g.items[i - 1]]; render(); }
    }));
    app.querySelectorAll("[data-move-grp]").forEach((b) => b.addEventListener("click", () => {
      const [gid, iStr, toIdx] = b.dataset.moveGrp.split(":");
      const g = S.groups.find((x) => x.id === gid);
      const [moved] = g.items.splice(Number(iStr), 1);
      if (moved) S.groups[Number(toIdx)].items.push(moved);
      render();
    }));

    const swSearch = document.getElementById("sw-search");
    if (swSearch) {
      swSearch.addEventListener("input", () => {
        S.swSearch = swSearch.value;
        const pos = swSearch.selectionStart;
        render();
        const again = document.getElementById("sw-search");
        again?.focus();
        again?.setSelectionRange(pos, pos);
      });
    }
    const compInput = document.getElementById("comp-input");
    if (compInput) {
      compInput.addEventListener("input", () => { S.draftsByItem[S.currentItem || "home"] = compInput.value; });
    }
  }

  document.getElementById("ctrl-reset").addEventListener("click", () => { S = initialState(); render(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (S.organizeOpen) { S.organizeOpen = false; render(); }
      else if (S.swOpen) { S.swOpen = false; render(); }
      else if (S.placePopOpen) { S.placePopOpen = false; render(); }
      else if (S.listPop) { S.listPop = null; render(); }
    }
  });

  render();
})();
