// 34 · 外部会话具体来源差异与第 22 批转交项原型（纯示例数据，不读真实工具、不调模型、不连宿主）。
(() => {
  const D = window.proto34Data;
  document.getElementById("icons").innerHTML = window.mwSprite;
  const app = document.getElementById("app");
  const stripEl = document.querySelector(".proto");
  const KEY = "molis-proto.sessions-34.v1";

  const fresh = () => ({
    block: "sources",
    opt: { sources: "A", cloud: "A", dirs: "A", assistant: "A" },
    state: { sources: "cli-resume", cloud: "account-changed", dirs: "mixed", assistant: "selection-idle" },
    lang: "zh",
    theme: "light",
    cat: false,
    sel: "s-codex",
    mDetail: true,
    copied: "",
    toolSearchOn: true,
    q: "commondir",
    sheet: false,
    moveOpen: false,
    cloudConn: "conn-alice",
    cloudModal: false,
    cloudFixed: false,
    dirConfirmed: false,
    chipsAdded: { sel: false, obj: false },
  });

  let S = load();
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && raw.v === 1 && raw.s) {
        const f = fresh();
        return {
          ...f,
          ...raw.s,
          opt: { ...f.opt, ...raw.s.opt },
          state: { ...f.state, ...raw.s.state },
          chipsAdded: { ...f.chipsAdded, ...(raw.s.chipsAdded || {}) },
          sheet: false,
          moveOpen: false,
          cloudModal: false,
        };
      }
    } catch { /* ignore */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* ignore */ }
  }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const narrow = () => window.innerWidth < 760;
  const blockObj = (id = S.block) => D.blocks.find((b) => b.id === id) || D.blocks[0];
  const curOpt = (id = S.block) => S.opt[id] || "A";
  const curState = (id = S.block) => {
    const b = blockObj(id);
    return b.states.some((x) => x.id === S.state[id]) ? S.state[id] : b.states[0].id;
  };

  // ---- 组件板实件构造器（对齐 packages/plugin-sdk/src/ui 与 packages/design-system/src/primitives） ----
  const ic = (n) => `<svg aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (label, { v = "secondary", icon, attrs = "", disabled = false } = {}) =>
    `<button type="button" class="mw-btn mw-btn--${v} mw-btn--sm" data-slot="button" data-cat="Button"${disabled ? " disabled" : ""} ${attrs}>${icon ? ic(icon) : ""}<span data-slot="button-label">${label}</span></button>`;
  const iconBtn = (label, icon, attrs = "", cls = "") =>
    `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only${cls ? ` ${cls}` : ""}" data-slot="button" data-cat="Button" aria-label="${esc(label)}" ${attrs}>${ic(icon)}<span class="mw-sr-only">${label}</span></button>`;
  const badge = (label, tone = "neutral") =>
    `<span class="mw-badge mw-badge--${tone}" data-slot="badge" data-cat="Badge">${label}</span>`;
  const status = (label, tone = "quiet", ring = null, plain = true) =>
    `<span class="mw-status mw-status--${tone}${plain ? " mw-status--plain" : ""}" data-slot="status" data-cat="Status mark">${ring && window.mwRings && window.mwRings[ring] ? window.mwRings[ring] : ""}<span>${label}</span></span>`;
  const alertBox = (tone, title, body = "", actions = "") =>
    `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status" data-cat="Alert"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${actions ? `<div class="mw-ix-actions">${actions}</div>` : ""}</div>`;
  const selectEl = (attrs, optionsHtml) =>
    `<select class="mw-select" data-slot="select" data-cat="Select" ${attrs}>${optionsHtml}</select>`;
  const searchInput = (value, placeholder, attrs = "") =>
    `<div class="mw-input-group" data-slot="input-group" data-cat="Input Group">${ic("search")}<input class="mw-input" data-slot="input" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" ${attrs}></div>`;
  const who = (kind, text, label) =>
    `<span class="mw-who" data-kind="${kind}" role="img" aria-label="${esc(label)}" data-cat="Who">${esc(text)}</span>`;
  const dirRow = ({ icon, title, meta, stat, current, attrs = "" }) =>
    `<button type="button" title="${esc(title)}" class="mw-dir-row mw-dir-row--meta directory-list-row${current ? " is-selected" : ""}" data-slot="directory-row" data-cat="Directory Row"${current ? ' aria-current="page"' : ""} ${attrs}><span class="mw-dir-row__icon">${ic(icon)}</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${esc(title)}</strong>${stat || ""}</span>${meta ? `<small>${esc(meta)}</small>` : ""}</span></button>`;

  function announce(msg) {
    const live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    setTimeout(() => { live.textContent = msg; }, 25);
  }

  function rail(active = "sessions") {
    const nav = (id, icon, label) =>
      `<button type="button" class="mw-nav-item${active === id ? " is-active" : ""}" data-cat="Nav Item" aria-label="${esc(label)}" title="${esc(label)}">${ic(icon)}</button>`;
    return `<aside class="mw-sidebar mw-sidebar--rail" data-slot="sidebar" data-cat="Sidebar">
      <div class="mw-sidebar__body">${nav("home", "home", L("项目首页", "Project home"))}${nav("sessions", "history", L("外部会话", "External sessions"))}${nav("settings", "settings", L("项目设置", "Project settings"))}</div>
    </aside>`;
  }

  function transcriptHtml(session, { highlightSelection = false } = {}) {
    const toolLabel = T(session.toolName);
    const items = D.transcript.map((e) => {
      if (e.kind === "note") return `<li class="mw-transcript__note">${esc(T(e.text))}</li>`;
      if (e.kind === "step") {
        return `<li class="mw-step">${ic("terminal")}<span class="mw-step__what"><b>${esc(T(e.action))}</b><code title="${esc(e.object)}">${esc(e.object)}</code></span><span class="mw-step__result">${esc(T(e.result))}</span></li>`;
      }
      const isYou = e.kind === "you";
      const face = isYou
        ? who("person", L("你", "Y"), L("你（人）", "You (person)"))
        : who("ai", toolLabel.slice(0, 1).toUpperCase(), `${toolLabel} (AI)`);
      const selCls = highlightSelection && e.selected ? " is-selected" : "";
      const floatBtn = highlightSelection && e.selected && S.block === "assistant" && curOpt("assistant") === "B" && !isChipAdded("sel")
        ? `<div class="s34-float-pick">${btn(L("将选中片段加入本轮助理", "Add selection to this assistant turn"), { v: "secondary", icon: "plus", disabled: curState("assistant") === "round-running", attrs: 'data-act="add-sel"' })}</div>`
        : "";
      return `<li class="mw-turn${selCls}" data-who="${isYou ? "you" : "tool"}">${face}<div class="mw-turn__body"><p class="mw-turn__head"><b>${esc(isYou ? L("你", "You") : toolLabel)}</b><time>${esc(e.time || "")}</time></p><p class="mw-turn__text">${esc(T(e.text))}</p>${floatBtn}</div></li>`;
    }).join("");
    return `<div class="mw-transcript" data-slot="transcript" data-cat="Transcript"><ol class="mw-transcript__log" aria-label="${esc(L("外部会话原文", "External conversation"))}">${items}</ol></div>`;
  }

  // =========================================================================
  // 块 1 · 具体来源差异（回到原工具、工具自带搜索、读取范围三类区分、第 14 行文案）
  // =========================================================================
  function activeSourceSession() {
    const st = curState("sources");
    if (st === "cli-no-flag") return D.sessions.find((s) => s.id === "s-mcode");
    if (st === "cloud-pr") return D.sessions.find((s) => s.id === "s-copilot");
    if (st === "tool-search") return D.sessions.find((s) => s.id === "s-droid");
    return D.sessions.find((s) => s.id === S.sel) || D.sessions[0];
  }

  function renderReturnAction(s, o) {
    const rt = s.returnTarget;
    if (o === "C") {
      if (!rt) return status(L("原工具无单会话恢复参数", "No per-session resume flag"), "quiet");
      return btn(L("在原工具继续 ▾", "Continue in tool ▾"), {
        icon: rt.kind === "url" ? "external" : "terminal",
        attrs: `data-copy="${esc(rt.label)}"`,
      });
    }
    if (!rt) {
      return `<span class="s34-quiet">${status(L("仅目录内交互恢复", "Interactive resume only"), "quiet")}</span>`;
    }
    if (rt.kind === "url") {
      return btn(L("在 GitHub 打开 Pull Request", "Open Pull Request on GitHub"), {
        icon: "external",
        attrs: `data-copy="${esc(rt.label)}"`,
      });
    }
    if (o === "B") {
      return status(L("命令行恢复见下方", "See command bar below"), "quiet");
    }
    return btn(L("复制恢复命令", "Copy resume command"), {
      icon: "terminal",
      attrs: `data-copy="${esc(rt.label)}"`,
    });
  }

  function renderSourcesBlock() {
    const st = curState("sources");
    const o = curOpt("sources");
    const s = activeSourceSession();
    const isToolSearch = st === "tool-search";
    const filterTool = isToolSearch ? "droid" : "all";
    const shownSessions = isToolSearch ? D.sessions.filter((x) => x.toolId === "droid") : D.sessions;

    const toolSearchControl = isToolSearch
      ? o === "A"
        ? btn(
            S.toolSearchOn
              ? L("在 Droid 里搜：已开", "Search in Droid: On")
              : L("在 Droid 里搜", "Search in Droid"),
            { v: S.toolSearchOn ? "primary" : "secondary", icon: "search", attrs: 'data-act="toggle-tool-search"' },
          )
        : o === "B"
          ? btn(L("工具内搜索面板", "Tool search popover"), { v: "secondary", icon: "search", attrs: 'data-act="toggle-tool-search"' })
          : badge(L("已混跑工具搜索", "Merged tool search"), "info")
      : o === "B"
        ? btn(L("工具内搜索（当前筛选不支持）", "Tool search (unavailable unless Droid)"), { v: "secondary", icon: "search", disabled: true })
        : "";

    const topBar = `<div class="s34-toolbar" data-cat="Toolbar">
      <div class="s34-search">${searchInput(isToolSearch ? S.q : "", isToolSearch && S.toolSearchOn && o !== "B" ? L("用 Droid 自带搜索找会话…", "Search via Droid's own index…") : L("搜标题、目录或工具名", "Search titles, folders or tool names"), 'data-field="q"')}</div>
      ${selectEl(
        `aria-label="${esc(L("按工具筛选", "Filter by tool"))}" data-field="tool-filter"`,
        [
          ["all", L("全部已允许工具（5）", "All allowed tools (5)")],
          ["codex", "Codex CLI"],
          ["claude-code", "Claude Code"],
          ["minimax-code", "MiniMax CLI (mcode)"],
          ["copilot-coding-agent", "Copilot Coding Agent"],
          ["droid", L("Factory Droid（带工具搜索）", "Factory Droid (has tool search)")],
        ].map(([v, label]) => `<option value="${v}"${v === filterTool ? " selected" : ""}>${esc(label)}</option>`).join(""),
      )}
      ${toolSearchControl}
      <span class="s34-spacer"></span>
      ${btn(L("读取范围", "Reading scope"), { icon: "sliders", attrs: 'data-act="sheet"' })}
    </div>`;

    const searchBanner = isToolSearch
      ? o === "B"
        ? `<div class="s34-banner">${alertBox(
            "info",
            L("独立「工具内搜索」面板（方案 B）", "Standalone tool-search panel (Option B)"),
            L("在独立面板里运行 `droid sessions search \"commondir\" --json`：找到 1 条在当前读取范围内的会话；Droid 另报出 2 条不在当前允许目录内，已跳过不显示。", "Ran `droid sessions search \"commondir\" --json` in a separate panel: 1 in-scope session matched; 2 out-of-scope hits reported by Droid were skipped."),
          )}</div>`
        : o === "C"
          ? `<div class="s34-banner">${alertBox(
              "warning",
              L("自动混跑跨工具搜索（方案 C）", "Merged search across tools (Option C)"),
              L("敲字时同时查本地标题索引并启动 Droid 子进程搜索：Droid 能命中对话正文，其余 9 个工具只匹配标题和目录，结果混在一张表里。", "Typing queries the local title index and spawns Droid's CLI search together: Droid matches body text while the other 9 tools match titles and folders only."),
            )}</div>`
          : `<div class="s34-banner"><p class="s34-quiet">${status(L("Droid 工具内搜索", "Droid tool search"), "progress")}<span>${L("由 Factory Droid 自带搜索返回 1 条（结果来自外部工具，按当前读取范围过滤）· 另有 2 条不在允许目录内，未显示。", "1 match from Factory Droid's own search (filtered by your reading scope) · 2 hits outside allowed folders were hidden.")}</span></p></div>`
      : st === "move-dialog"
        ? `<div class="s34-banner">${alertBox(
            "info",
            L("待归类 AI 建议说明（合同 §8.4 / §12 第 14 行已定文案）", "Unfiled AI suggestion disclosure (settled copy, §8.4 / §12 row 14)"),
            L("打开「待归类」时，这些会话的标题、目录和开头几句，连同你的项目名和项目目录，会发给你配置的模型用于给出归属建议；这和项目的 AI 能不能读外部会话是两件事，内容不会进入任何项目 AI 的对话。", "When opening Unfiled, session titles, folders and opening prompts — together with your project names and folders — are sent to your configured model to suggest a project. This is separate from Project AI reading and never enters any project AI chat."),
            btn(L("预览「改归属」对话框文案", "Preview Move-project Dialog"), { attrs: 'data-act="move"' }),
          )}</div>`
        : "";

    const listRows = shownSessions.map((row) =>
      dirRow({
        icon: row.surface === "cloud" ? "cloud" : "terminal",
        title: T(row.title),
        meta: `${T(row.toolName)} · ${row.dir || L("云端任务（无本地目录）", "Cloud task (no local folder)")} · ${T(row.when)}`,
        current: row.id === s.id,
        attrs: `data-sel="${row.id}"`,
      }),
    ).join("");

    const copiedNote = S.copied
      ? `<p class="s34-quiet">${status(L("已复制", "Copied"), "done")}<code>${esc(S.copied)}</code><span>${L("粘贴到你自己的终端或浏览器使用；Molis Work 不会替你启动外部工具。", "Paste into your own terminal or browser; Molis Work never launches the external tool itself.")}</span></p>`
      : "";

    const cmdBar = o === "B" || (o === "A" && s.returnTarget && s.returnTarget.kind === "command")
      ? s.returnTarget
        ? o === "B"
          ? `<div class="s34-cmdbar"><span>${esc(s.returnTarget.kind === "url" ? L("原工具链接：", "Original URL:") : L("恢复命令：", "Resume command:"))}</span><code>${esc(s.returnTarget.label)}</code>${btn(L("复制", "Copy"), { v: "secondary", attrs: `data-copy="${esc(s.returnTarget.label)}"` })}</div>`
          : `<p class="s34-quiet"><span>${esc(L("原工具恢复命令：", "Resume command:"))}</span><code>${esc(s.returnTarget.label)}</code></p>`
        : `<div class="s34-cmdbar"><span>${esc(T(s.noResumeWhy))}</span></div>`
      : !s.returnTarget && s.noResumeWhy
        ? `<p class="s34-quiet">${ic("info")}<span>${esc(T(s.noResumeWhy))}</span></p>`
        : s.returnTarget && s.returnTarget.kind === "url"
          ? `<p class="s34-quiet"><span>${esc(L("关联 Pull Request：", "Linked Pull Request:"))}</span><code>${esc(s.returnTarget.label)}</code></p>`
          : "";

    const detailFrame = `<section class="mw-frame" data-slot="frame" data-cat="Frame">
      <header class="mw-frame__header">
        <div class="mw-frame__heading">
          ${narrow() ? iconBtn(L("返回列表", "Back to list"), "chevron-left", 'data-act="back"') : ""}
          <h2>${esc(T(s.title))}</h2>
          <p>${esc([T(s.toolName), s.dir || L("云端任务", "Cloud task"), T(s.when)].join(" · "))}</p>
        </div>
        <div class="mw-frame__action s34-actions">${renderReturnAction(s, o)}</div>
      </header>
      <div class="mw-frame__panel s34-panel">
        <p class="s34-readonly">
          <span>${ic("eye")}${esc(L(`只读：查看和搜索不会让 ${T(s.toolName)} 运行、发消息或改文件。`, `Read only: viewing and searching never runs ${T(s.toolName)}, sends messages, or edits files.`))}</span>
          ${s.forkFrom ? `<span>${ic("git-branch")}${esc(L(`从「${T(s.forkFrom)}」分叉出来的新会话`, `Forked from “${T(s.forkFrom)}”`))}</span>` : ""}
          ${s.viaNote ? `<span>${ic("terminal")}${esc(T(s.viaNote))}</span>` : ""}
        </p>
        ${copiedNote}
        ${cmdBar}
        <p class="s34-owner">
          ${ic("folder")}<b>${esc(T(s.project))}</b><span>${esc(T(s.basis))}</span>
          ${btn(L("改归属", "Change project"), { v: "ghost", attrs: 'data-act="move"' })}
        </p>
        ${transcriptHtml(s)}
      </div>
    </section>`;

    return `<div class="mw-layout-primitives s34-shell${narrow() && S.mDetail ? " s34-shell--detail" : ""}">
      ${rail("sessions")}
      <div class="s34-work">
        ${topBar}
        ${searchBanner}
        <div class="s34-split">
          <aside class="mw-sidebar mw-sidebar--directory s34-list" data-slot="sidebar" data-cat="Directory Panel">
            <div class="mw-sidebar__body">${listRows}</div>
          </aside>
          <div class="s34-detail">${detailFrame}</div>
        </div>
      </div>
    </div>`;
  }

  function renderScopeSheet() {
    const isCloudBlock = S.block === "cloud";
    const cst = curState("cloud");
    const co = curOpt("cloud");

    let cloudRowExtra = "";
    if (isCloudBlock) {
      if (cst === "no-conn") {
        cloudRowExtra = co === "A"
          ? `<div class="s34-conn-inline">${status(L("还没有连接账号", "No connected account"), "attention")}${btn(L("去连接设置接入 GitHub CLI", "Connect GitHub CLI in Settings"), { v: "secondary", icon: "external", attrs: 'data-act="mock-connect"' })}</div>`
          : `<small>${esc(L("勾选时会弹窗提示先去服务连接接入 GitHub CLI。", "Checking this opens a modal asking you to connect GitHub CLI first."))}</small>`;
      } else {
        cloudRowExtra = co === "A"
          ? `<div class="s34-conn-inline">
              <span>${esc(L("读取账号连接：", "Account connection:"))}</span>
              ${selectEl(
                `aria-label="${esc(L("选择 GitHub CLI 连接", "Choose GitHub CLI connection"))}" data-field="cloud-conn"`,
                [
                  ["conn-alice", L("GitHub CLI · @alice（个人主账号）", "GitHub CLI · @alice (personal)")],
                  ["conn-bob", L("GitHub CLI · @bob-work（工作账号，作为独立来源）", "GitHub CLI · @bob-work (work, separate source)")],
                ].map(([v, label]) => `<option value="${v}"${v === S.cloudConn ? " selected" : ""}>${esc(label)}</option>`).join(""),
              )}
            </div>`
          : `<div class="s34-conn-inline">${badge(S.cloudConn === "conn-bob" ? "@bob-work" : "@alice", "info")}${btn(L("弹窗更换连接…", "Change connection in modal…"), { v: "ghost", attrs: 'data-act="cloud-modal"' })}</div>`;
      }
    }

    const connectedChecks = D.scopeTiers.connected.map(([id, name, where, checked]) => {
      const isCopilot = id === "copilot-coding-agent";
      const disabled = isCopilot && isCloudBlock && cst === "no-conn" && co === "A";
      const isChecked = isCopilot && isCloudBlock && cst === "no-conn" ? false : checked;
      return `<label class="mw-check-row s34-check">
        <input class="mw-check" data-slot="checkbox" type="checkbox"${isChecked ? " checked" : ""}${disabled ? " disabled" : ""}${isCopilot && co === "B" ? ' data-act="cloud-modal"' : ""}>
        <span>
          <strong>${esc(name)}${isCopilot ? ` ${badge(L("云端 · gh CLI", "Cloud · gh CLI"))}` : ""}</strong>
          <small>${esc(where)}</small>
          ${isCopilot ? cloudRowExtra : ""}
        </span>
      </label>`;
    }).join("");

    const manualRows = D.scopeTiers.manualExport.map(([, name, why]) =>
      `<label class="mw-check-row s34-check">
        <input class="mw-check" data-slot="checkbox" type="checkbox" disabled>
        <span>
          <strong>${esc(name)} ${status(L("仅支持手动导出", "Manual export only"), "quiet")}</strong>
          <small>${esc(T(why))}</small>
        </span>
      </label>`,
    ).join("");

    const gapRows = D.scopeTiers.unsupported.map(([, name, kind, tag, why]) =>
      `<label class="mw-check-row s34-check">
        <input class="mw-check" data-slot="checkbox" type="checkbox" disabled>
        <span>
          <strong>${esc(name)} ${status(T(tag), kind === "tool_gap" ? "quiet" : "idle")}</strong>
          <small>${esc(T(why))}</small>
        </span>
      </label>`,
    ).join("");

    return `<dialog class="mw-sheet" data-slot="sheet" data-cat="Sheet" aria-labelledby="s34-sheet-title" data-s34-dialog="sheet">
      <form method="dialog" class="mw-form mw-sheet__shell">
        <header class="mw-form__header">
          <div>
            <h2 id="s34-sheet-title" tabindex="-1">${esc(L("读取范围", "Reading scope"))}</h2>
            <p>${esc(L("只读：找出已有会话、看历史和搜索，绝不启动外部 Agent 或改文件。不同账号连接是不同来源，互不混排。", "Read only: list, view and search existing sessions without running external agents or modifying files. Different account connections stay separate sources."))}</p>
          </div>
          ${iconBtn(L("关闭", "Close"), "x", 'data-act="close-sheet"', "mw-dialog__close")}
        </header>
        <div class="mw-form__body s34-sheet-body">
          <section class="s34-tier">
            <h3>${esc(L("已支持自动发现与只读历史（10 个）", "Automatic discovery & read-only history (10)"))}</h3>
            <fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group">${connectedChecks}</fieldset>
          </section>
          <section class="s34-tier">
            <h3>${esc(L("有手动导出命令、暂无自动会话列表（2 个）", "Manual export CLI only, no auto list yet (2)"))}</h3>
            <fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group">${manualRows}</fieldset>
          </section>
          <section class="s34-tier">
            <h3>${esc(L("暂不支持自动读取（40 个登记项摘录：分清「工具未开放」与「待接通」）", "Not auto-readable yet (distinguishes tool gap vs adapter pending)"))}</h3>
            <fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group">${gapRows}</fieldset>
          </section>
          <fieldset class="mw-radio-group" data-slot="radio-group" data-cat="Radio Group" role="radiogroup">
            <legend>${esc(L("读哪些目录里的会话", "Sessions from which folders"))}</legend>
            <label class="mw-check-row s34-check">
              <input class="mw-radio" data-slot="radio" type="radio" name="s34-dirs" checked>
              <span>
                <strong>${esc(L("只读项目连着的目录：~/code/molis-work、~/code/site", "Only folders linked to projects: ~/code/molis-work, ~/code/site"))}</strong>
                <small>${esc(L("包含这些目录的子目录，和这些项目的 git worktree（只读 .git / commondir / gitdir 互指核实，绝不执行 git）。已删或认不出的 worktree、没有目录的云端会话，以及工具带进项目的目录下的会话不在内，要选「所有目录」才看得到。", "Includes subfolders and verified git worktrees (checked via .git / commondir / gitdir files only, never running git). Deleted worktrees, folderless cloud tasks, and folders brought in by tools are excluded unless you choose “All folders”."))}</small>
              </span>
            </label>
            <label class="mw-check-row"><input class="mw-radio" data-slot="radio" type="radio" name="s34-dirs"><span>${esc(L("所有目录", "All folders"))}</span></label>
          </fieldset>
        </div>
        <footer class="mw-form__footer">
          ${btn(L("取消", "Cancel"), { attrs: 'data-act="close-sheet"' })}
          ${btn(L("保存读取范围", "Save reading scope"), { v: "primary", attrs: 'data-act="save-sheet"' })}
        </footer>
      </form>
    </dialog>`;
  }

  function renderMoveDialog() {
    const s = activeSourceSession();
    return `<dialog class="mw-dialog" data-slot="dialog" data-cat="Dialog" aria-labelledby="s34-move-title" data-s34-dialog="move">
      <form method="dialog" class="mw-form mw-dialog__shell">
        <header class="mw-form__header">
          <div>
            <h2 id="s34-move-title">${esc(L("改归到哪个项目", "Move to which project"))}</h2>
            <p>${esc(T(s.title))}</p>
          </div>
          ${iconBtn(L("关闭", "Close"), "x", 'data-act="close-move"', "mw-dialog__close")}
        </header>
        <div class="mw-form__body">
          <label class="mw-field" data-slot="field" data-cat="Field">
            <span class="mw-field__label">${esc(L("项目", "Project"))}</span>
            ${selectEl("", `<option value="molis" selected>Molis Work</option><option value="site">${esc(L("官网改版", "Website redesign"))}</option><option value="none">${esc(L("先不归到项目", "Leave unfiled"))}</option>`)}
            <small class="mw-field__hint">${esc(L("只改这一个会话：不改目录和项目的关系，不搬文件，不改原工具里的记录。它连着的工具调用仍落在旧项目。", "Changes only this session: folder links stay as they are, no files move, and nothing in the original tool changes. Tool calls connected to it still land in the old project."))}</small>
          </label>
        </div>
        <footer class="mw-form__footer">
          ${btn(L("取消", "Cancel"), { attrs: 'data-act="close-move"' })}
          ${btn(L("保存", "Save"), { v: "primary", attrs: 'data-act="close-move"' })}
        </footer>
      </form>
    </dialog>`;
  }

  // =========================================================================
  // 块 2 · 云端来源连接与账号变化（合同 §12 第 28、29 行）
  // =========================================================================
  function renderCloudBlock() {
    const st = curState("cloud");
    const o = curOpt("cloud");
    const copilot = D.sessions.find((x) => x.id === "s-copilot");

    let topAlert = "";
    if (st === "no-conn") {
      topAlert = alertBox(
        "info",
        L("云端来源还没有可用的账号连接", "No account connection for this cloud source yet"),
        o === "A"
          ? L("GitHub Copilot Coding Agent 通过「服务连接」里已验证的官方 GitHub CLI（gh）账号读取。打开「读取范围」即可从行内入口去连接设置接入，接好回来就能勾选。", "GitHub Copilot Coding Agent reads through a verified official GitHub CLI (gh) connection. Open Reading Scope for a direct link to Connections settings.")
          : L("方案 B 在勾选复选框时弹出提示框让你去连接设置。", "Option B pops a modal dialog when you try to check the cloud source."),
        btn(L("打开读取范围查看", "Open Reading Scope"), { v: "primary", attrs: 'data-act="sheet"' }),
      );
    } else if (st === "multi-conn") {
      topAlert = alertBox(
        "info",
        L(`当前使用连接：${S.cloudConn === "conn-bob" ? "GitHub CLI · @bob-work" : "GitHub CLI · @alice"}`, `Active connection: ${S.cloudConn === "conn-bob" ? "GitHub CLI · @bob-work" : "GitHub CLI · @alice"}`),
        L("不同连接对应不同 location_key（`connection:<id>`）：切换到 @bob-work 会作为另一个独立来源读取，绝不把两个账号的会话混在一起。", "Each connection has its own location_key (`connection:<id>`): switching to @bob-work reads as a separate source and never mixes accounts."),
        btn(L("在读取范围切换账号连接", "Switch connection in Reading Scope"), { attrs: 'data-act="sheet"' }),
      );
    } else if (st === "scope-missing") {
      topAlert = alertBox(
        "warning",
        L("GitHub CLI 当前令牌缺少读取 Copilot 任务的 `repo` 权限", "GitHub CLI token is missing the `repo` scope needed for agent tasks"),
        L("Molis Work 默认只用 `notifications,read:user` 连接 GitHub，不会替你静默申请仓库读写权限。如果你需要在这里读取 Copilot 云端任务，请在终端自行刷新权限后再试：", "Molis Work connects GitHub with `notifications,read:user` by default and never silently widens scopes. To read Copilot cloud tasks, refresh your gh token in your terminal and retry:"),
        `${btn(L("复制 `gh auth refresh -h github.com -s repo`", "Copy `gh auth refresh -h github.com -s repo`"), { icon: "terminal", attrs: 'data-copy="gh auth refresh -h github.com -s repo"' })}${btn(L("刷新后重试", "Retry after refresh"), { v: "primary", icon: "refresh", attrs: 'data-act="cloud-fix"' })}`,
      );
    } else if (st === "account-changed" && !S.cloudFixed) {
      topAlert = o === "A"
        ? alertBox(
            "warning",
            L("本机 GitHub CLI 当前登录账号已变成 @bob-work（原允许连接是 @alice）", "Local GitHub CLI is now signed in as @bob-work (allowed connection is @alice)"),
            L("为防止跨账号串读，宿主在读前读后核对了 gh 账号指纹并暂停了读取（`needs_login: account_changed`）。你有两条明确出路：", "To prevent cross-account leaks, the Host verified gh's account fingerprint and paused reading (`needs_login: account_changed`). Choose either path:"),
            `${btn(L("我已在终端切回 @alice，重新核对", "Switched gh back to @alice — re-check"), { v: "primary", icon: "refresh", attrs: 'data-act="cloud-fix"' })}${btn(L("去读取范围改用 @bob-work 的连接", "Use @bob-work's connection in Reading Scope"), { icon: "sliders", attrs: 'data-act="switch-bob"' })}`,
          )
        : alertBox(
            "warning",
            L("GitHub Copilot Coding Agent 需要核对账号（方案 B）", "GitHub Copilot Coding Agent needs account check (Option B)"),
            L("本机 gh 登录账号与所选连接不一致，请打开读取范围处理。", "Local gh account differs from the selected connection; open Reading Scope to resolve."),
            btn(L("打开读取范围", "Open Reading Scope"), { v: "primary", attrs: 'data-act="sheet"' }),
          );
    } else if (st === "login-expired" && !S.cloudFixed) {
      topAlert = alertBox(
        "warning",
        L("GitHub CLI 登录状态已失效或连接已停用", "GitHub CLI sign-in expired or connection was disabled"),
        L("之前读到的云端会话已隐藏，不会继续返回旧缓存。重新登录或恢复连接后即可恢复。", "Previously indexed cloud sessions are hidden until the connection is valid again."),
        `${btn(L("去连接设置重新验证", "Re-verify in Connections"), { v: "primary", icon: "user", attrs: 'data-act="cloud-fix"' })}${btn(L("调整读取范围", "Reading scope"), { attrs: 'data-act="sheet"' })}`,
      );
    } else {
      topAlert = alertBox(
        "success",
        L("账号连接核对通过，已恢复只读读取", "Account fingerprint verified — read-only access restored"),
        L(`当前使用连接：${S.cloudConn === "conn-bob" ? "@bob-work" : "@alice"}。读前与读后指纹一致。`, `Using connection ${S.cloudConn === "conn-bob" ? "@bob-work" : "@alice"} with pre/post fingerprint verification.`),
      );
    }

    const copiedLine = S.copied
      ? `<div class="s34-banner"><p class="s34-quiet">${status(L("已复制", "Copied"), "done")}<code>${esc(S.copied)}</code></p></div>`
      : "";

    const cloudBlocked = (st === "account-changed" || st === "login-expired" || st === "no-conn") && !S.cloudFixed;
    const bodyPanel = cloudBlocked
      ? `<section class="mw-frame" data-slot="frame" data-cat="Frame">
          <header class="mw-frame__header"><div class="mw-frame__heading"><h2>GitHub Copilot Coding Agent</h2><p>${esc(L("云端来源 · 账号指纹保护已生效", "Cloud source · Account fingerprint guard active"))}</p></div></header>
          <div class="mw-frame__panel s34-panel">
            <div class="mw-empty" data-slot="empty" data-cat="Empty">
              <span class="mw-empty__mark">${ic("cloud")}</span>
              <h2>${esc(st === "no-conn" ? L("先接入你的 GitHub CLI 账号", "Connect your GitHub CLI account first") : L("核对账号连接前不显示该账号下的会话", "Sessions stay hidden until the account matches"))}</h2>
              <p>${esc(L("云端来源每次跑只读命令前后都会核实当前登录指纹；账号变了或连接停用时立刻停止返回内容，不会把 @bob-work 的任务混进 @alice 的索引。", "Every cloud CLI read checks the account fingerprint before and after execution; on mismatch or disconnect, nothing is returned and accounts never mix."))}</p>
            </div>
          </div>
        </section>`
      : `<section class="mw-frame" data-slot="frame" data-cat="Frame">
          <header class="mw-frame__header">
            <div class="mw-frame__heading"><h2>${esc(T(copilot.title))}</h2><p>${esc(`${T(copilot.toolName)} · ${S.cloudConn === "conn-bob" ? "@bob-work" : "@alice"} · ${T(copilot.when)}`)}</p></div>
            <div class="mw-frame__action s34-actions">${btn(L("在 GitHub 打开 Pull Request", "Open Pull Request on GitHub"), { icon: "external", attrs: `data-copy="${esc(copilot.returnTarget.label)}"` })}</div>
          </header>
          <div class="mw-frame__panel s34-panel">${transcriptHtml(copilot)}</div>
        </section>`;

    return `<div class="mw-layout-primitives s34-shell${narrow() ? " s34-shell--detail" : ""}">
      ${rail("sessions")}
      <div class="s34-work">
        <div class="s34-toolbar" data-cat="Toolbar">
          <strong>${esc(L("外部会话 · 云端来源与连接", "External sessions · Cloud sources & connections"))}</strong>
          <span class="s34-spacer"></span>
          ${btn(L("读取范围", "Reading scope"), { icon: "sliders", attrs: 'data-act="sheet"' })}
        </div>
        <div class="s34-banner">${topAlert}</div>
        ${copiedLine}
        <div class="s34-split">
          <aside class="mw-sidebar mw-sidebar--directory s34-list" data-slot="sidebar" data-cat="Directory Panel">
            <div class="mw-sidebar__body">
              ${dirRow({ icon: "terminal", title: T(D.sessions[0].title), meta: "Codex CLI · ~/code/molis-work", current: false, attrs: 'data-act="noop"' })}
              ${dirRow({
                icon: "cloud",
                title: cloudBlocked ? "GitHub Copilot Coding Agent" : T(copilot.title),
                meta: cloudBlocked ? L("暂停读取 · 等待核对账号", "Paused · Verify account") : `Copilot · ${S.cloudConn === "conn-bob" ? "@bob-work" : "@alice"}`,
                stat: cloudBlocked ? status(L("需要核对账号", "Check account"), "attention") : "",
                current: true,
              })}
            </div>
          </aside>
          <div class="s34-detail s34-detail--always">${bodyPanel}</div>
        </div>
      </div>
    </div>`;
  }

  // =========================================================================
  // 块 3 · 项目设置「输入与输出」区分工具带进来的目录（合同 §12 第 24 行，原 R5）
  // =========================================================================
  function renderDirsBlock() {
    const st = curState("dirs");
    const o = curOpt("dirs");
    const confirmed = st === "confirmed" || st === "person-only" || S.dirConfirmed;
    const outputUnconfirmed = st === "output-unconfirmed" && !S.dirConfirmed;

    const personRow = (name, pathStr, roles) => `<div class="s34-dir-row" data-cat="Setting Row">
      ${ic("folder")}
      <div class="s34-dir-copy">
        <div class="s34-dir-title">
          <strong>${esc(name)}</strong>
          ${roles.includes("input") ? badge(L("参考目录", "Input folder")) : ""}
          ${roles.includes("output") ? badge(L("输出目录", "Output folder"), "info") : ""}
        </div>
        <span class="s34-dir-path">${esc(pathStr)}</span>
      </div>
      <div class="s34-dir-acts">
        ${!roles.includes("output") ? btn(L("设为输出", "Make output")) : ""}
        ${iconBtn(L("移除", "Remove"), "trash")}
      </div>
    </div>`;

    const toolBroughtRow = () => {
      if (st === "person-only") return "";
      if (confirmed) {
        return `<div class="s34-dir-row" data-cat="Setting Row">
          ${ic("folder")}
          <div class="s34-dir-copy">
            <div class="s34-dir-title">
              <strong>molis-sdk-experiment</strong>
              ${badge(L("参考目录", "Input folder"))}
            </div>
            <span class="s34-dir-path">~/code/molis-sdk-experiment</span>
            <div class="s34-dir-note is-done">${ic("check")}<span>${esc(L("已确认为你连入的目录：现已纳入外部会话「只读项目连着的目录」与自动归属。", "Confirmed as your linked folder: now included in external-session project folder scope and automatic filing."))}</span></div>
          </div>
          <div class="s34-dir-acts">${btn(L("设为输出", "Make output"))}${iconBtn(L("移除", "Remove"), "trash")}</div>
        </div>`;
      }
      return `<div class="s34-dir-row" data-cat="Setting Row">
        ${ic("folder")}
        <div class="s34-dir-copy">
          <div class="s34-dir-title">
            <strong>molis-sdk-experiment</strong>
            ${badge(L("参考目录", "Input folder"))}
            ${status(L("工具带入 · 待确认", "Tool-brought · Unconfirmed"), "attention")}
          </div>
          <span class="s34-dir-path">~/code/molis-sdk-experiment</span>
          <div class="s34-dir-note">${ic("circle-alert")}<span>${esc(L("由外部工具（MCP context_bind）带入，未经你本人确认：不进入外部会话「只读项目连着的目录」，这个目录下的会话不会自动归入本项目。确认连入后按你添加的目录生效。", "Brought in by an external tool (MCP context_bind), not yet confirmed by you: excluded from external sessions' “Only folders linked to projects” and from automatic project filing until you confirm."))}</span></div>
        </div>
        <div class="s34-dir-acts">
          ${btn(L("确认连入", "Confirm link"), { v: "primary", icon: "check", attrs: 'data-act="confirm-dir"' })}
          ${iconBtn(L("移除", "Remove"), "trash")}
        </div>
      </div>`;
    };

    const inputsSection = o === "B" && !confirmed && st !== "person-only"
      ? `<article class="mw-card" data-slot="card" data-cat="Card">
          <header class="mw-card__header"><div><h2 class="mw-card__title">${esc(L("你添加的读取文件夹", "Folders added by you"))}</h2><p class="mw-card__description">${esc(L("只读参考；纳入外部会话的项目目录范围与自动归属。", "Read-only inputs; included in external-session folder scope and auto-filing."))}</p></div></header>
          <div class="s34-dir-card">${personRow("molis-work", "~/code/molis-work", ["input", "output"])}${personRow("design-tokens", "~/code/design-tokens", ["input"])}</div>
        </article>
        <article class="mw-card" data-slot="card" data-cat="Card">
          <header class="mw-card__header"><div><h2 class="mw-card__title">${esc(L("工具带入、待你确认的文件夹（方案 B 拆节）", "Folders brought in by tools, awaiting confirmation (Option B)"))}</h2><p class="mw-card__description">${esc(L("确认连入前不扩大外部会话读取范围，也不自动归入外部会话。", "Does not widen external-session reading scope or auto-file sessions until you confirm."))}</p></div></header>
          <div class="s34-dir-card">${toolBroughtRow()}</div>
        </article>`
      : `<article class="mw-card" data-slot="card" data-cat="Card">
          <header class="mw-card__header"><div><h2 class="mw-card__title">${esc(L("读取的文件夹", "Folders to read"))}</h2><p class="mw-card__description">${esc(L("只读参考，可添加多个；移除文件夹不会删除磁盘上的任何文件。", "Read-only inputs; removing one here never deletes files on disk."))}</p></div></header>
          <div class="s34-dir-card">
            ${personRow("molis-work", "~/code/molis-work", outputUnconfirmed ? ["input"] : ["input", "output"])}
            ${personRow("design-tokens", "~/code/design-tokens", ["input"])}
            ${toolBroughtRow()}
          </div>
        </article>`;

    const outputCard = `<article class="mw-card" data-slot="card" data-cat="Card">
      <header class="mw-card__header"><div><h2 class="mw-card__title">${esc(L("输出去哪里", "Where output goes"))}</h2><p class="mw-card__description">${esc(L("整个项目共用唯一输出位置。", "One output location shared across the project."))}</p></div></header>
      <div class="s34-dir-card">
        <div class="s34-dir-row" data-cat="Setting Row">
          ${ic("folder")}
          <div class="s34-dir-copy">
            <div class="s34-dir-title">
              <strong>${esc(outputUnconfirmed ? "molis-sdk-experiment" : "molis-work")}</strong>
              ${badge(L("输出目录", "Output folder"), "info")}
              ${outputUnconfirmed ? status(L("工具带入 · 待确认", "Tool-brought · Unconfirmed"), "attention") : ""}
            </div>
            <span class="s34-dir-path">${esc(outputUnconfirmed ? "~/code/molis-sdk-experiment" : "~/code/molis-work")}</span>
            ${outputUnconfirmed ? `<div class="s34-dir-note">${ic("circle-alert")}<span>${esc(L("这个输出目录是工具带入的，尚未经你本人确认：确认连入或打开下方「读取说明文件」后才算你确认的目录。", "This output folder was brought in by a tool: confirm it or turn on repository instructions below to mark it as yours."))}</span></div>` : ""}
          </div>
          <div class="s34-dir-acts">
            ${outputUnconfirmed ? btn(L("确认连入", "Confirm link"), { v: "primary", icon: "check", attrs: 'data-act="confirm-dir"' }) : ""}
            ${btn(L("更换", "Change"))}
          </div>
        </div>
        <div class="mw-setting" data-cat="Setting Row" style="padding:12px 16px;border-top:1px solid var(--line)">
          <div>
            <strong>${esc(L("读取仓库说明文件（AGENTS.md / CLAUDE.md）", "Read repository instructions (AGENTS.md / CLAUDE.md)"))}</strong>
            <p style="margin:2px 0 0;color:var(--muted);font-size:12px">${esc(outputUnconfirmed ? L("当前输出目录未经你确认，暂不读取里面的说明文件；打开开关即一并确认。", "Paused until you confirm this output folder; turning the switch on confirms it.") : L("输出目录由你本人选定，默认读取里面的说明文件。", "Enabled for your confirmed output folder."))}</p>
          </div>
          <div>
            <span class="mw-switch" data-slot="switch" data-cat="Switch">
              <input type="checkbox" role="switch"${outputUnconfirmed ? "" : " checked"} aria-label="${esc(L("读取仓库说明文件", "Read repository instructions"))}" data-act="confirm-dir">
              <span class="mw-switch__track" aria-hidden="true"></span>
            </span>
          </div>
        </div>
      </div>
    </article>`;

    return `<div class="mw-layout-primitives s34-shell">
      ${rail("settings")}
      <div class="s34-work">
        <div class="s34-settings-wrap">
          <header class="s34-settings-head">
            <h1>${esc(L("项目设置 · 输入与输出", "Project Settings · Inputs & Output"))}</h1>
            <p>${esc(L("你本人添加的目录与外部工具（MCP / 终端绑定）带进来的目录分开标明；后者确认前不会扩大外部会话读取范围，也不会把会话自动归入本项目。", "Folders you linked yourself are distinguished from folders brought in by external tools; tool-brought folders never widen external-session scope or auto-file sessions until you confirm."))}</p>
          </header>
          ${inputsSection}
          ${outputCard}
        </div>
      </div>
    </div>`;
  }

  // =========================================================================
  // 块 4 · 个人助理引用外部会话与选区边界（合同 §12 第 44 行）
  // =========================================================================
  function isChipAdded(kind) {
    const st = curState("assistant");
    if (st === "selection-added") return kind === "sel" ? true : !!S.chipsAdded.obj;
    if (st === "selection-idle" || st === "round-running") return !!S.chipsAdded[kind];
    return false;
  }

  function renderChip({ label, note, added, disabled, onAdd, onDrop }) {
    return `<span class="s34-chip${added ? "" : " is-optional"}${disabled ? " is-disabled" : ""}" data-cat="Badge">
      <span class="s34-chip__label">${esc(label)}</span>
      ${note ? `<span class="s34-chip__note">${esc(note)}</span>` : ""}
      <button type="button" class="s34-chip__act"${disabled ? " disabled" : ""} aria-label="${esc(added ? L("移出", "Remove") : L("加入本轮", "Add to this turn"))}" ${added ? onDrop : onAdd}>${added ? "×" : "+"}</button>
    </span>`;
  }

  function renderAssistantBlock() {
    const st = curState("assistant");
    const o = curOpt("assistant");
    const s = D.sessions[1]; // Claude Code session
    const running = st === "round-running";
    const selAdded = isChipAdded("sel");
    const objAdded = isChipAdded("obj");

    let chipsHtml = "";
    let hintHtml = "";

    if (st === "at-mention") {
      chipsHtml = renderChip({
        label: L("@ 排查 390 宽度下按钮换行与溢出", "@ Fix button wrapping and overflow at 390px"),
        note: L("仅标题与目录 · 仅本轮", "Title & folder only · this turn"),
        added: true,
        disabled: false,
        onAdd: "",
        onDrop: 'data-act="noop"',
      });
      if (o === "A") {
        chipsHtml += renderChip({
          label: L("选中原文 · 4 行", "Selected text · 4 lines"),
          note: L("未加入", "Not added"),
          added: selAdded,
          disabled: false,
          onAdd: 'data-act="add-sel"',
          onDrop: 'data-act="drop-sel"',
        });
        hintHtml = `<p class="s34-strip-hint">${esc(L("「@」引用外部会话只带标题、目录和工具名；要让助理读左侧选中的那几句原文，点选区签上的「+」加入这一轮。", "“@” carries only the session's title, folder and tool name; click “+” on the selection chip to include the highlighted transcript lines in this turn."))}</p>`;
      } else {
        hintHtml = alertBox(
          "info",
          L("「@」不含对话正文 · 仅本轮有效（方案 B 横幅）", "“@” carries no transcript · This turn only (Option B banner)"),
          L("外部会话不会记成这项工作的长期对象；要带原文请点左侧选区旁的浮动按钮。", "External sessions are never stored as persistent work objects; use the floating button beside your selection to attach transcript text."),
        );
      }
    } else {
      if (o === "A" || selAdded) {
        chipsHtml += renderChip({
          label: L("选中原文 · 4 行（14:13 回答）", "Selected text · 4 lines (14:13 reply)"),
          note: selAdded ? L("不可信材料 · 仅本轮", "Untrusted · this turn only") : L("未加入", "Not added"),
          added: selAdded,
          disabled: running && !selAdded,
          onAdd: 'data-act="add-sel"',
          onDrop: 'data-act="drop-sel"',
        });
      }
      if (o === "A" || objAdded) {
        chipsHtml += renderChip({
          label: L("当前会话：排查 390 宽度下按钮换行", "Current session: Fix 390px wrapping"),
          note: objAdded ? L("仅标题与目录 · 仅本轮", "Title & folder · this turn") : L("未加入", "Not added"),
          added: objAdded,
          disabled: running && !objAdded,
          onAdd: 'data-act="add-obj"',
          onDrop: 'data-act="drop-obj"',
        });
      }

      if (running) {
        hintHtml = o === "A"
          ? `<p class="s34-strip-hint is-warn">${esc(L("这一轮助理还在运行，不能中途补充外部会话内容（中途补充会留在后续每一轮历史里）。等本轮结束后，可新发一轮带上它。", "This assistant turn is still running: mid-run follow-ups cannot carry external-session content (which would persist across later turns). Wait for this turn to finish, then send it in the next turn."))}</p>`
          : alertBox(
              "warning",
              L("运行中不能补充外部会话内容", "Cannot add external-session content while running"),
              L("中途补充会写进后续轮次历史，违背「外部会话材料只进这一轮」的边界；请等本轮完成后再发。", "Mid-run follow-ups persist in multi-turn history; wait until the current turn finishes."),
            );
      } else if (selAdded || objAdded) {
        hintHtml = o === "A"
          ? `<p class="s34-strip-hint">${esc(L("已作为不可信参考加入本轮：不会记成这项工作的对象，下一轮也不会自动再带。", "Added as untrusted reference for this turn only: not linked as a work object and not carried into the next turn."))}</p>`
          : alertBox(
              "info",
              L("外部会话材料仅本轮有效", "External-session material applies to this turn only"),
              L("发送后按不可信数据加围栏交给模型，不关联工作对象，下一轮不自动延续。", "Fenced as untrusted input for this turn only; never linked to the work or repeated next turn."),
            );
      } else {
        hintHtml = `<p class="s34-strip-hint">${esc(L("外部会话页面的选区和当前会话默认不自动带入；需要给助理看时，点上方「+」明确加入这一轮。", "Selections and the open session on this page are never auto-attached; click “+” above when you want the assistant to see them this turn."))}</p>`;
      }
    }

    const assistantPanel = `<aside class="s34-assistant" aria-label="${esc(L("个人助理", "Personal Assistant"))}">
      <div class="s34-assistant__head">
        <strong>${esc(L("个人助理 · Molis Work", "Assistant · Molis Work"))}</strong>
        ${running ? status(L("正在运行", "Running"), "progress", "running") : status(L("就绪", "Ready"), "quiet")}
      </div>
      <div class="s34-assistant__log">
        <div class="mw-turn" data-who="you">${who("person", L("你", "Y"), L("你", "You"))}<div class="mw-turn__body"><p class="mw-turn__head"><b>${esc(L("你", "You"))}</b><time>14:22</time></p><p class="mw-turn__text">${esc(L("帮我对照一下我们现在的外部会话返回前再核逻辑。", "Compare our pre-return scope re-check logic."))}</p></div></div>
        <div class="mw-turn" data-who="tool">${who("ai", "A", "Assistant")}<div class="mw-turn__body"><p class="mw-turn__head"><b>${esc(L("助理", "Assistant"))}</b><time>14:22</time>${running ? status(L("正在整理", "Working"), "progress", "running") : ""}</p><p class="mw-turn__text">${esc(running ? L("正在读取当前项目的动作合同与测试…", "Reading the current project's action contracts and tests…") : L("好的。如果你要我参考某段外部工具会话，请把它点「+」加进这一轮。", "Sure — if you want me to reference an external tool session, add it for this turn with “+”."))}</p></div></div>
      </div>
      <div class="s34-assistant__composer">
        ${chipsHtml ? `<div class="s34-strip" role="region" aria-label="${esc(L("下一条发送携带的上下文", "Context for next send"))}">${chipsHtml}</div>` : ""}
        ${hintHtml}
        <div class="s34-composer-box" data-cat="Input Group">
          <textarea aria-label="${esc(L("给助理发消息", "Message assistant"))}" placeholder="${esc(running ? L("本轮运行中（可发普通文字补充，不可带外部会话）…", "Turn running (plain follow-ups allowed; external sessions disabled)…") : L("输入问题，或输入 @ 搜索引用…", "Ask anything, or type @ to reference…"))}"></textarea>
          ${btn(running ? L("补充", "Follow up") : L("发送", "Send"), { v: "primary" })}
        </div>
      </div>
    </aside>`;

    return `<div class="mw-layout-primitives s34-shell s34-shell--detail" data-external-session-surface="true">
      ${rail("sessions")}
      <div class="s34-work">
        <div class="s34-toolbar" data-cat="Toolbar">
          <strong>${esc(T(s.title))}</strong>
          ${badge(T(s.toolName))}
          <span class="s34-spacer"></span>
          <span class="s34-quiet">${esc(L("左侧已选中 14:13 的一段原文", "14:13 reply highlighted on the left"))}</span>
        </div>
        <div class="s34-split s34-split--assistant">
          <aside class="mw-sidebar mw-sidebar--directory s34-list" data-slot="sidebar" data-cat="Directory Panel">
            <div class="mw-sidebar__body">
              ${dirRow({ icon: "terminal", title: T(D.sessions[0].title), meta: "Codex CLI · 12m", current: false, attrs: 'data-act="noop"' })}
              ${dirRow({ icon: "terminal", title: T(s.title), meta: "Claude Code · ~/code/molis-work", current: true, attrs: 'data-act="noop"' })}
            </div>
          </aside>
          <div class="s34-detail s34-detail--always">
            <section class="mw-frame" data-slot="frame" data-cat="Frame">
              <header class="mw-frame__header">
                <div class="mw-frame__heading"><h2>${esc(T(s.title))}</h2><p>${esc(`${T(s.toolName)} · ${s.dir} · ${T(s.when)}`)}</p></div>
                <div class="mw-frame__action s34-actions">${btn(L("复制恢复命令", "Copy resume command"), { icon: "terminal", attrs: `data-copy="${esc(s.returnTarget.label)}"` })}</div>
              </header>
              <div class="mw-frame__panel s34-panel">${transcriptHtml(s, { highlightSelection: true })}</div>
            </section>
          </div>
          ${assistantPanel}
        </div>
      </div>
    </div>`;
  }

  // ---- 原型控制条与顶层同步 ----
  function syncStrip() {
    const b = blockObj();
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.dataset.resolvedTheme = S.theme;
    document.body.classList.toggle("cat", !!S.cat);

    document.getElementById("p-title").textContent = L("原型 · 外部会话（第 34 批）", "Prototype · Sessions (Batch 34)");
    document.getElementById("p-block").textContent = L("块", "Area");
    document.getElementById("p-opt").textContent = L("方案", "Option");
    document.getElementById("p-state").textContent = L("状态", "State");

    const blockSel = document.getElementById("block");
    blockSel.innerHTML = D.blocks.map((x) => `<option value="${x.id}"${x.id === S.block ? " selected" : ""}>${esc(T(x.name))}</option>`).join("");

    const optSel = document.getElementById("opt");
    optSel.innerHTML = b.opts.map(([k, label]) => `<option value="${k}"${k === curOpt() ? " selected" : ""}>${esc(T(label))}</option>`).join("");

    const stateSel = document.getElementById("state");
    stateSel.innerHTML = b.states.map((st) => `<option value="${st.id}"${st.id === curState() ? " selected" : ""}>${esc(T(st.name))}</option>`).join("");

    document.querySelectorAll("#lang button").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.lang === S.lang)));
    document.querySelectorAll("#theme button").forEach((el) => {
      const k = el.dataset.themeSet;
      el.textContent = k === "light" ? L("浅色", "Light") : L("深色", "Dark");
      el.setAttribute("aria-pressed", String(k === S.theme));
    });
    const catBtn = document.getElementById("cat");
    catBtn.textContent = L("标出组件", "Highlight parts");
    catBtn.setAttribute("aria-pressed", String(!!S.cat));
    document.getElementById("reset").textContent = L("还原", "Reset");
  }

  function render() {
    if (stripEl.parentElement !== document.body) document.body.insertBefore(stripEl, app);
    syncStrip();
    document.documentElement.style.setProperty("--proto-h", `${stripEl.offsetHeight || 42}px`);

    const openSheetAuto = S.block === "sources" && curState("sources") === "scope-tiers";
    const showSheet = S.sheet || openSheetAuto;
    const showMove = S.moveOpen;

    let mainHtml = "";
    if (S.block === "sources") mainHtml = renderSourcesBlock();
    else if (S.block === "cloud") mainHtml = renderCloudBlock();
    else if (S.block === "dirs") mainHtml = renderDirsBlock();
    else mainHtml = renderAssistantBlock();

    app.innerHTML = `${mainHtml}${showSheet ? renderScopeSheet() : ""}${showMove ? renderMoveDialog() : ""}`;

    const dlg = app.querySelector("dialog[data-s34-dialog]");
    if (dlg && !dlg.open) {
      dlg.showModal();
      document.documentElement.style.setProperty("--proto-h", `${stripEl.offsetHeight || 42}px`);
      dlg.append(stripEl);
    }
    save();
  }

  // ---- 交互事件 ----
  document.getElementById("block").addEventListener("change", (e) => {
    S.block = e.target.value;
    S.sheet = false;
    S.moveOpen = false;
    S.copied = "";
    render();
  });
  document.getElementById("opt").addEventListener("change", (e) => {
    S.opt[S.block] = e.target.value;
    render();
  });
  document.getElementById("state").addEventListener("change", (e) => {
    S.state[S.block] = e.target.value;
    S.sheet = false;
    S.moveOpen = false;
    S.cloudFixed = false;
    S.dirConfirmed = false;
    S.copied = "";
    render();
  });
  document.getElementById("lang").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lang]");
    if (!b) return;
    S.lang = b.dataset.lang;
    render();
  });
  document.getElementById("theme").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-theme-set]");
    if (!b) return;
    S.theme = b.dataset.themeSet;
    render();
  });
  document.getElementById("cat").addEventListener("click", () => {
    S.cat = !S.cat;
    render();
  });
  document.getElementById("reset").addEventListener("click", () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    S = fresh();
    render();
  });

  app.addEventListener("click", (e) => {
    const copyEl = e.target.closest("[data-copy]");
    if (copyEl) {
      S.copied = copyEl.dataset.copy;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(S.copied).catch(() => {});
      }
      announce(L(`已复制：${S.copied}`, `Copied: ${S.copied}`));
      render();
      return;
    }
    const selEl = e.target.closest("[data-sel]");
    if (selEl) {
      S.sel = selEl.dataset.sel;
      S.mDetail = true;
      S.copied = "";
      render();
      return;
    }
    const actEl = e.target.closest("[data-act]");
    if (!actEl) return;
    const act = actEl.dataset.act;
    if (act === "back") { S.mDetail = false; render(); }
    else if (act === "sheet") { S.sheet = true; render(); }
    else if (act === "close-sheet" || act === "save-sheet") {
      if (S.block === "sources" && curState("sources") === "scope-tiers") S.state.sources = "cli-resume";
      S.sheet = false;
      render();
    } else if (act === "move") { S.moveOpen = true; render(); }
    else if (act === "close-move") { S.moveOpen = false; render(); }
    else if (act === "toggle-tool-search") { S.toolSearchOn = !S.toolSearchOn; render(); }
    else if (act === "cloud-fix") { S.cloudFixed = true; announce(L("连接核对通过", "Connection verified")); render(); }
    else if (act === "switch-bob") { S.cloudConn = "conn-bob"; S.cloudFixed = true; S.sheet = true; render(); }
    else if (act === "mock-connect") { S.state.cloud = "multi-conn"; S.sheet = true; render(); }
    else if (act === "cloud-modal") {
      S.cloudConn = S.cloudConn === "conn-alice" ? "conn-bob" : "conn-alice";
      announce(L(`已切换为 ${S.cloudConn === "conn-bob" ? "@bob-work" : "@alice"}`, `Switched to ${S.cloudConn === "conn-bob" ? "@bob-work" : "@alice"}`));
      render();
    } else if (act === "confirm-dir") {
      S.dirConfirmed = true;
      announce(L("已确认为你连入的目录", "Confirmed as your linked folder"));
      render();
    } else if (act === "add-sel") { S.chipsAdded.sel = true; render(); }
    else if (act === "drop-sel") { S.chipsAdded.sel = false; if (curState("assistant") === "selection-added") S.state.assistant = "selection-idle"; render(); }
    else if (act === "add-obj") { S.chipsAdded.obj = true; render(); }
    else if (act === "drop-obj") { S.chipsAdded.obj = false; render(); }
  });

  app.addEventListener("change", (e) => {
    if (e.target.matches("[data-field='tool-filter']")) {
      const v = e.target.value;
      if (v === "droid") S.state.sources = "tool-search";
      else if (v === "minimax-code") S.state.sources = "cli-no-flag";
      else if (v === "copilot-coding-agent") S.state.sources = "cloud-pr";
      else {
        S.state.sources = "cli-resume";
        if (v === "claude-code") S.sel = "s-claude";
        if (v === "codex") S.sel = "s-codex";
      }
      render();
    } else if (e.target.matches("[data-field='cloud-conn']")) {
      S.cloudConn = e.target.value;
      S.cloudFixed = true;
      render();
    }
  });

  app.addEventListener("input", (e) => {
    if (e.target.matches("[data-field='q']")) {
      S.q = e.target.value;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (S.sheet || S.moveOpen || (S.block === "sources" && curState("sources") === "scope-tiers"))) {
      e.preventDefault();
      if (S.block === "sources" && curState("sources") === "scope-tiers") S.state.sources = "cli-resume";
      S.sheet = false;
      S.moveOpen = false;
      render();
    }
  });

  window.addEventListener("resize", () => render());
  render();
})();
