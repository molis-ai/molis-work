// 14 · 外观选择与应用规则 — clickable review prototype. Sample data only: no file is read or written, no Home is touched,
// no model is called. Timers stand in for loading a font and for another window changing the look.
//
// Drawn on the real 「界面与语言」 settings page (settings-shell, settings-navigation, settings-section, settings-setting-row,
// settings-segmented) with board parts from ../kit (mw-btn, mw-toggle-group, mw-radio-group, mw-select, mw-badge, mw-alert,
// mw-status + state ring, mw-bar-status, mw-card, mw-menu, mw-dialog, mw-sheet, mw-toast). The few new parts carry
// data-board-new and are listed in README.md 「组件板新增」; their styles are in proto.css.
//
// Rules every option shares (the part of 「应用规则」 that does not change between A, B and C):
// - Skin and font are one choice for this Home: every window and the Mac App follow it. Light/dark, density and terminal
//   stay on this device; the interface language stays with this browser (the Mac App keeps its own).
// - A font chosen on purpose stays when the skin changes; 「跟随皮肤推荐」 follows the skin.
// - A look whose font has not loaded shows the declared fallback; a font that fails, or a look that fails its checks, never
//   replaces the look in use.
// - Language, light/dark, density and terminal apply at once. Restoring the built-in look keeps the language and your looks.
(() => {
  const D = window.protoData;
  const K = window.mwKit;
  const KEY = "molis-proto.appearance-selection.v1";

  const fresh = () => ({ plan: "C", fault: "none", lang: "zh", langPref: "zh", themePref: "light", density: "standard", terminal: "auto", notes: true });
  let S = load() || fresh();
  let P = freshLook(); // the look state: not kept across reloads
  function freshLook() {
    return { applied: { skin: "soft", font: "follow", mono: "system" }, prev: null, trial: null, load: null, tload: null, fontReady: false, blocked: null, external: false, externalArmed: true, menu: null, dialog: null, sheet: false, status: null };
  }
  let timers = [];
  const STILL = new URLSearchParams(location.search).has("still"); // checks run without the fade
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 1 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* preview without storage */ } }
  function later(ms, fn) { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms); timers.push(t); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // ---------- words ----------
  const L = (zh, en) => (S.lang === "en" ? en : zh);
  const T = (pair) => L(pair[0], pair[1]);
  const esc = K.escapeHtml;
  const announce = (m) => { document.getElementById("live").textContent = m; };
  const skin = (id) => D.skins.find((s) => s.id === id);
  const font = (id) => D.fonts.find((f) => f.id === id);
  const faceOf = (c) => (c.font === "follow" ? skin(c.skin).font : c.font);
  const comboName = (c) => `${T(skin(c.skin).name)} · ${T(font(faceOf(c)).name)}`;
  const invalid = (id) => S.fault === "invalid" && id === "garden";
  const same = (a, b) => a && b && a.skin === b.skin && a.font === b.font && a.mono === b.mono;
  const resolvedTheme = () => (S.themePref === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : S.themePref);
  const needsLoad = (c) => faceOf(c) === "rounded" && !P.fontReady;

  // ---------- board parts ----------
  const ic = (n) => K.icon(n);
  const btn = (variant, label, attrs = {}, o = {}) => K.renderButton({ variant, size: o.size || "sm", label, icon: o.icon, iconOnly: o.iconOnly, key: o.key, disabled: o.disabled, attrs });
  const badge = (tone, label) => K.renderBadge({ tone, label });
  const ring = (state) => K.renderStateRing({ state });
  const statusMark = (tone, state, label) => K.renderStatusMark({ tone, state, label });
  const toggles = (label, items, act) => K.renderToggleGroup({ label, className: "settings-segmented", items: items.map(([v, n, cur]) => ({ value: v, label: n, current: cur, attrs: { "data-act": act, "data-v": v } })) });
  const alertBox = (tone, title, bodyHtml = "", extra = "") => `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status"><strong>${title}</strong>${bodyHtml}${extra}</div>`;
  const row = (title, desc, value, cls = "") => `<section class="settings-setting-row${cls ? " " + cls : ""}"><div class="setting-copy"><strong>${title}</strong><span>${desc}</span></div><div class="setting-value">${value}</div></section>`;
  const section = (id, title, scope, inner, extra = "") => `<section class="settings-section" aria-labelledby="${id}" ${extra}><h2 id="${id}">${title}</h2><p class="proto-scope">${scope}</p>${inner}</section>`;
  const NEW_EN = { "外观卡": "Look card", "试用条": "Trial bar", "样张卡": "Specimen card", "换外观的淡入": "Look cross-fade" };
  const isNew = (name) => `data-board-new="${S.lang === "zh" ? name : NEW_EN[name]}"`;
  const problems = (id) => `<ul>${skin(id).problems.map((p) => `<li>${esc(T(p))}</li>`).join("")}</ul>`;

  function toast(message, action) {
    const host = document.getElementById("toasts");
    host.innerHTML = `<div class="mw-toast" data-slot="toast" role="status"><span>${esc(message)}</span>${action ? `<button type="button" class="mw-toast__action" data-act="${action.act}">${esc(action.label)}</button>` : ""}</div>`;
    announce(message);
    clearTimeout(toast.t); toast.t = setTimeout(() => { host.innerHTML = ""; }, 5200);
  }

  // ---------- what the page shows ----------
  // A: the applied look (a failed load already went back to the previous one). B: the trial, else the applied look.
  // C: the page keeps the applied look; only the specimen shows the trial.
  const pageLook = () => (S.plan === "B" && P.trial ? P.trial : P.applied);
  const specimenLook = () => P.trial || P.applied;
  // While a font loads, or after it failed during a trial, the page draws the declared fallback.
  function faceShown(c, loadState) {
    const face = faceOf(c);
    if (face !== "rounded") return face;
    return loadState && (loadState.phase === "loading" || loadState.phase === "failed") ? "system" : "rounded";
  }

  // ---------- skin colours, as if read from the skin files ----------
  function lookRules() {
    const decl = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
    let css = "";
    for (const s of D.skins) {
      if (!s.vars) continue;
      for (const mode of ["light", "dark"]) {
        const v = decl(s.vars[mode]);
        css += `:root[data-look="${s.id}"][data-resolved-theme="${mode}"],:root[data-look="${s.id}"][data-resolved-theme="${mode}"] body{${v}}\n`;
        css += `:root[data-resolved-theme="${mode}"] .proto-specimen__canvas[data-look="${s.id}"]{${v}}\n`;
      }
    }
    // Soft Workbench is the stylesheet itself; the specimen inherits it when the page is Soft, and restates the
    // roles it needs when the page wears another look.
    for (const mode of ["light", "dark"]) {
      const sw = D.skins[0].swatch[mode];
      css += `:root[data-resolved-theme="${mode}"] .proto-specimen__canvas[data-look="soft"]{--desk:${sw[0]};--paper:${sw[1]};--accent:${sw[2]};--ink:${sw[3]}}\n`;
    }
    document.getElementById("look-rules").textContent = css;
  }

  // ---------- page frame ----------
  function settingsPage(content) {
    const nav = [
      [L("本机", "This Mac")], ["sun", L("界面与语言", "Interface & language"), true], ["folder", L("本机目录", "Local folders")],
      [L("个人", "Personal")], ["bookmark", L("记忆", "Memory")],
      ["AI"], ["key", L("模型设置", "Models")], ["message", L("助理", "Assistant")], ["user", L("角色", "Characters")], ["text", L("提示词", "Prompts")],
      [L("工具与接入", "Tools & access")], ["terminal", L("AI 与执行工具", "AI & runtimes")], ["book", L("能力库", "Library")], ["link", L("服务连接", "Service connections")], ["shield", L("对外接入", "External access")], ["workflow", L("调用记录", "Call history")],
      [L("系统", "System")], ["bug", L("诊断", "Diagnostics")],
    ];
    return `<header class="project-preferences-chrome"><span>${L("全局设置", "Settings")}</span><a href="#" data-act="noop" aria-label="${L("关闭全局设置", "Close settings")}">${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置", "System settings")}"><a class="settings-nav-back" href="#" data-act="noop">${ic("arrow")} ${L("返回项目", "Back to project")}</a><div class="settings-nav-body">${nav.map((n) => (n.length === 1 ? `<div class="settings-nav-group-label">${n[0]}</div>` : `<a href="#" data-act="noop"${n[2] ? ' aria-current="page"' : ""}>${ic(n[0])}${n[1]}</a>`)).join("")}</div></nav>
      <div class="settings-content">${content}</div></main>`;
  }

  // ---------- the look section ----------
  function skinCard(s) {
    const mode = resolvedTheme();
    const sw = s.swatch[mode];
    const style = `--sw0:${sw[0]};--sw1:${sw[1]};--sw2:${sw[2]};--sw3:${sw[3]};${sw[4] ? `--sw4:${sw[4]};` : ""}${sw[5] ? `--sw5:${sw[5]};` : ""}${s.vars ? "--sw-r:10px" : "--sw-r:7px"}`;
    const inUse = P.applied.skin === s.id;
    const trying = P.trial && P.trial.skin === s.id && !inUse;
    const pressed = S.plan === "A" ? inUse : (P.trial ? P.trial.skin === s.id : inUse);
    const badges = [
      inUse ? badge("success", L("在用", "In use")) : "",
      trying ? badge("info", S.plan === "C" ? L("样张里", "In the specimen") : L("试用中", "Trying")) : "",
      invalid(s.id) ? badge("warning", L("没通过检查", "Fails checks")) : "",
      s.sample ? `<span class="proto-sample-tag">${badge("neutral", L("配色示意", "Colours are a stand-in"))}</span>` : "",
    ].join("");
    const more = btn("ghost", L("更多操作", "More actions"), { "data-act": "menu", "data-id": s.id, "aria-haspopup": "menu", "aria-expanded": String(P.menu === s.id) }, { iconOnly: true, icon: "more" });
    const menu = P.menu === s.id ? K.renderMenu({ items: [
      K.renderMenuItem({ label: L("复制为我的方案", "Duplicate as mine"), iconName: "copy", attrs: { "data-act": "lib", "data-v": "copy" } }),
      s.mine ? K.renderMenuItem({ label: L("导出…", "Export…"), iconName: "download", attrs: { "data-act": "lib", "data-v": "export" } }) : "",
      s.mine ? K.renderMenuItem({ label: inUse ? L("移除（在用，不能移除）", "Remove (in use)") : L("移除", "Remove"), iconName: "trash", danger: true, disabled: inUse, attrs: { "data-act": "lib", "data-v": "remove" } }) : "",
    ].join("") }) : "";
    return `<div class="proto-skin"${trying ? " data-trial" : ""}>
      <button type="button" class="proto-skin__pick" aria-pressed="${pressed}" data-act="skin" data-id="${s.id}">
        <span class="proto-skin__view" style="${style}" aria-hidden="true"><i class="w"></i><i class="t"></i><i class="l"></i><i class="l l2"></i><i class="b"></i><i class="d d1"></i><i class="d d2"></i></span>
        <span class="proto-skin__text"><span class="proto-skin__name"><span>${esc(T(s.name))}</span></span><span class="proto-skin__meta">${esc(T(s.by))} · ${L("推荐", "Suggests")}「${esc(T(font(s.font).name))}」</span></span>
        <span class="proto-skin__badges">${badges}</span>
      </button>
      <span class="proto-skin__more">${more}</span>${menu}
    </div>`;
  }
  function skinGrid() { return `<div class="proto-skins" role="group" aria-label="${L("皮肤", "Skin")}" ${isNew("外观卡")}>${D.skins.map(skinCard).join("")}</div>`; }

  // The font choice: 「跟随皮肤推荐」 plus the schemes, each hint set in its own face.
  function fontRows(c) {
    const cur = c.font;
    const rec = font(skin(c.skin).font);
    const items = [["follow", L("跟随皮肤推荐", "Follow the skin"), L(`现在是「${T(rec.name)}」`, `Now “${T(rec.name)}”`), rec.id]].concat(D.fonts.map((f) => [f.id, T(f.name), T(f.note), f.id]));
    const radios = items.map(([v, title, note, face]) => `<label class="mw-check-row"><input class="mw-radio" data-slot="radio" type="radio" name="font" value="${v}" data-act="font" data-v="${v}"${cur === v ? " checked" : ""}><span><strong>${esc(title)}</strong><span class="proto-sample proto-face--${face}">${L("永和九年 · 你好 Aa Gg 0123456789", "Quick brown fox · 你好 Aa Gg 0123456789")}</span><small class="mw-field__hint">${esc(note)}</small></span></label>`).join("");
    const fixed = cur !== "follow" && cur !== skin(c.skin).font;
    const keep = fixed ? `<p class="proto-hint">${ic("info")}<span>${L(`你选定了「${T(font(cur).name)}」，换皮肤时保持不变；${T(skin(c.skin).name)} 推荐「${T(rec.name)}」。`, `You chose “${T(font(cur).name)}”, so it stays when the skin changes; ${T(skin(c.skin).name)} suggests “${T(rec.name)}”.`)}</span>${btn("link", L("改用推荐", "Use the suggestion"), { "data-act": "font", "data-v": "follow" })}</p>` : "";
    return row(L("字体", "Font"), L("界面、标题和长文用的字。等宽字体单独选。", "Type for the interface, titles and long text. Monospace is chosen on its own."), `<fieldset class="mw-radio-group proto-fonts" data-slot="radio-group" role="radiogroup"><legend class="mw-sr-only">${L("字体", "Font")}</legend>${radios}</fieldset>${keep}`, "proto-stack");
  }
  function monoRow(c) {
    const opts = D.monos.map(([v, n]) => `<option value="${v}"${c.mono === v ? " selected" : ""}>${esc(T(n))}</option>`).join("");
    return row(L("等宽字体", "Monospace"), `${L("代码、终端和对比里用，换界面字体不影响它。", "For code, the terminal and diffs; the interface font never changes it.")} <code class="proto-face--mono-${c.mono}">git diff --stat</code>`, `<select class="mw-select" data-act="mono" aria-label="${L("等宽字体", "Monospace")}">${opts}</select>`);
  }
  function libRow() {
    return row(L("我的方案", "My looks"), L("复制内置外观再改，或让助理按你的描述做一套。做好的方案在这里选。", "Duplicate a built-in look and change it, or ask the assistant to make one. Finished looks show up here."), `<div class="proto-lib">${btn("secondary", L("导入方案…", "Import a look…"), { "data-act": "lib", "data-v": "import" }, { icon: "upload" })}${btn("ghost", L("让助理做一套", "Ask the assistant"), { "data-act": "lib", "data-v": "assistant" }, { icon: "sparkles" })}</div>`);
  }

  // Feedback under the cards (option A), from the last switch.
  function feedbackA() {
    const st = P.status;
    if (P.blocked) {
      const s = skin(P.blocked);
      return `<div class="proto-feedback">${alertBox("warning", esc(L(`「${T(s.name)}」还不能用上，外观没有变`, `“${T(s.name)}” can’t be used yet; the look hasn’t changed`)), problems(s.id), `<div class="proto-actions">${btn("secondary", L("交给助理修改", "Ask the assistant to fix it"), { "data-act": "lib", "data-v": "assistant" }, { icon: "sparkles" })}${btn("ghost", L("看文件里的问题", "See the problems in the file"), { "data-act": "lib", "data-v": "file" })}</div>`)}</div>`;
    }
    if (!st) return "";
    if (st.phase === "loading") return `<div class="proto-feedback">${statusMark("progress", "running", L(`正在换成 ${st.name}：圆润字体加载中，先用系统字体显示`, `Switching to ${st.name}: the rounded font is loading, the system font stands in`))}</div>`;
    if (st.phase === "failed") return `<div class="proto-feedback">${alertBox("danger", esc(L("圆润字体没加载上，外观保持原样", "The rounded font didn’t load; the look stays as it was")), `<p>${esc(L(`还是 ${st.back}。字体文件读不出来（示意：文件损坏）。`, `Still ${st.back}. The font file couldn’t be read (sample: the file is damaged).`))}</p>`, `<div class="proto-actions">${btn("secondary", L("再试一次", "Try again"), { "data-act": "retry" })}${btn("ghost", L(`${st.skinName} 配系统无衬线`, `${st.skinName} with the system sans`), { "data-act": "fallback-apply" })}</div>`)}</div>`;
    if (st.phase === "done") return `<div class="proto-feedback">${statusMark("done", "done", st.external ? L(`另一个窗口刚换成了 ${st.name}，这里已跟着换好`, `Another window just switched to ${st.name}; this one followed`) : L(`已用上 ${st.name}。这个窗口已换好，其他窗口和 Mac App 跟着换。`, `Now using ${st.name}. This window is done; other windows and the Mac App follow.`))}</div>`;
    return "";
  }

  // The trial bar (option B).
  function trialBar() {
    if (S.plan !== "B" || !P.trial) return "";
    const c = P.trial;
    const name = comboName(c);
    let tone = "", head, sub, list = "", acts;
    const restore = btn("secondary", L("还原", "Put it back"), { "data-act": "trial-cancel" }, { size: "md" });
    if (invalid(c.skin)) {
      tone = "warning"; head = `${ring("blocked")}${esc(L(`「${T(skin(c.skin).name)}」有 2 个问题，修好之前不能用上`, `“${T(skin(c.skin).name)}” has 2 problems; fix them before using it`))}`;
      sub = L("你看到的是它现在的样子，只在这个窗口。", "What you see is how it looks now, in this window only."); list = problems(c.skin);
      acts = `${restore}${btn("secondary", L("交给助理修改", "Ask the assistant to fix it"), { "data-act": "lib", "data-v": "assistant" }, { size: "md", icon: "sparkles" })}${btn("primary", L("用上", "Use it"), { "data-act": "trial-apply", "data-primary": "" }, { size: "md", key: "↵", disabled: true })}`;
    } else if (P.tload && P.tload.phase === "failed") {
      tone = "danger"; head = `${ring("failed")}${esc(L("圆润字体没加载上，这个组合还不能用上", "The rounded font didn’t load; this combination can’t be used yet"))}`;
      sub = L(`${T(skin(c.skin).name)} 的颜色已在这个窗口试着，字先用系统无衬线显示。`, `${T(skin(c.skin).name)}’s colours are on in this window; the system sans stands in for the type.`);
      acts = `${restore}${btn("secondary", L("再试一次", "Try again"), { "data-act": "retry" }, { size: "md" })}${btn("secondary", L("改用系统无衬线试", "Try with the system sans"), { "data-act": "font", "data-v": "system" }, { size: "md" })}`;
    } else if (P.external) {
      tone = "warning"; head = `${ring("conflict")}${esc(L(`另一个窗口刚换成了「${comboName(P.applied)}」`, `Another window just switched to “${comboName(P.applied)}”`))}`;
      sub = L(`你还在试 ${name}；用上它会替换另一个窗口的选择。`, `You are still trying ${name}; using it replaces the other window’s choice.`);
      acts = `${btn("secondary", L("留着它", "Keep theirs"), { "data-act": "trial-cancel" }, { size: "md" })}${btn("primary", L("仍然用上", "Use mine anyway"), { "data-act": "trial-apply", "data-primary": "" }, { size: "md", key: "↵" })}`;
    } else {
      const loading = P.tload && P.tload.phase === "loading";
      head = `${ring(loading ? "running" : "draft")}${esc(L(`正在试 ${name}`, `Trying ${name}`))}`;
      sub = loading ? L("圆润字体加载中，先用系统字体显示。只在这个窗口，别的窗口不变。", "The rounded font is loading; the system font stands in. Only this window; others are unchanged.")
        : L(`只在这个窗口；点「还原」或离开设置，就回到 ${comboName(P.applied)}。`, `Only this window. “Put it back” or leaving Settings returns to ${comboName(P.applied)}.`);
      acts = `${restore}${btn("primary", L("用上", "Use it"), { "data-act": "trial-apply", "data-primary": "" }, { size: "md", key: "↵" })}`;
    }
    return `<div class="proto-trialbar" role="region" aria-label="${L("试用外观", "Trying a look")}" data-tone="${tone}" ${isNew("试用条")}><div class="proto-trialbar__text" role="status" aria-live="polite"><strong>${head}</strong><small>${esc(sub)}</small>${list}</div><div class="proto-trialbar__actions">${acts}</div></div>`;
  }

  // The specimen (option C): a card drawn in the candidate look.
  function specimen() {
    const c = specimenLook();
    const trying = !!P.trial;
    const face = faceShown(c, P.tload);
    const reading = faceOf(c) === "reading";
    const sub = trying ? L(`试：${comboName(c)}`, `Trying: ${comboName(c)}`) : L(`现在用的：${comboName(c)}`, `In use: ${comboName(c)}`);
    let status = "", primaryDisabled = !trying, extra = "";
    if (!trying) status = L("点一个皮肤或字体，样张先换，页面不变。", "Pick a skin or a font: the specimen changes first, the page stays.");
    else if (invalid(c.skin)) { status = `${statusMark("blocked", "blocked", L("有 2 个问题，修好之前不能用上", "2 problems; fix them before using it"))}${problems(c.skin)}`; primaryDisabled = true; extra = btn("secondary", L("交给助理修改", "Ask the assistant to fix it"), { "data-act": "lib", "data-v": "assistant" }, { icon: "sparkles" }); }
    else if (P.tload && P.tload.phase === "failed") { status = statusMark("blocked", "failed", L("圆润字体没加载上，样张先用系统无衬线；这个组合还不能用上", "The rounded font didn’t load; the specimen uses the system sans and the combination can’t be used yet")); primaryDisabled = true; extra = btn("secondary", L("再试一次", "Try again"), { "data-act": "retry" }); }
    else if (P.tload && P.tload.phase === "loading") status = statusMark("progress", "running", L("圆润字体加载中，样张先用系统字体", "The rounded font is loading; the specimen uses the system font"));
    else if (P.external) status = statusMark("attention", "conflict", L(`另一个窗口刚换成了「${comboName(P.applied)}」；用上会替换它`, `Another window just switched to “${comboName(P.applied)}”; using this replaces it`));
    else status = L("页面没变；用上之后这个 Home 的所有窗口一起换。", "The page hasn’t changed; once used, every window of this Home switches.");
    const t = (zh, en) => esc(L(zh, en));
    const canvas = `<div class="proto-specimen__canvas" data-look="${c.skin}" style="--font:var(--proto-font-${face === "rounded" ? "rounded" : "system"});--font-mono:var(--proto-font-mono-${c.mono})">
      <div class="proto-specimen__sheet">
        <h4><span>${t("本周工作", "This week")}</span>${badge("info", L("3 项", "3 items"))}</h4>
        <ul class="proto-specimen__rows">
          <li>${ring("done")}<span>${t("整理访谈记录", "Tidy the interview notes")}</span><span>09:41</span></li>
          <li>${ring("running")}<span>${t("起草第四季度计划", "Draft the Q4 plan")}</span><span>${t("进行中", "Running")}</span></li>
          <li>${ring("waiting")}<span>${t("等设计评审", "Wait for design review")}</span><span>11/06</span></li>
        </ul>
        <label class="mw-field" data-slot="field"><span class="mw-field__label">${t("项目名称", "Project name")}</span><input class="mw-input" data-slot="input" value="${t("Molis 新版发布", "Molis launch")}" aria-invalid="true"><p class="mw-field__error" role="alert">${t("已经有一个同名项目。", "A project with this name already exists.")}</p></label>
        <div class="proto-specimen__btns">${btn("primary", L("保存", "Save"), { tabindex: "-1" }, { key: "↵" })}${btn("secondary", L("取消", "Cancel"), { tabindex: "-1" })}${btn("ghost", L("更多", "More"), { tabindex: "-1" }, { icon: "more" })}</div>
        <p class="proto-specimen__read${reading ? " proto-face--reading" : ""}">${t("2026 年 11 月 4 日，完成 1,284 条整理，用时 3.5 秒。长一点的说明在阅读时更舒展，标点「，。」与 English words 混排也要对齐。", "On 4 November 2026, 1,284 notes were sorted in 3.5 seconds. Longer passages read more easily, and 中文 mixed with English should sit on one baseline.")}</p>
        <pre class="proto-specimen__code">const look = "${c.skin}";  // ${t("等宽", "monospace")}</pre>
      </div>
    </div>`;
    return `<article class="mw-card proto-specimen" data-slot="card" ${isNew("样张卡")}>
      <header class="mw-card__header"><div><h3>${L("样张", "Specimen")}</h3><small>${esc(sub)}</small></div>${trying ? badge("info", L("没用上", "Not applied")) : badge("success", L("在用", "In use"))}</header>
      <div class="mw-card__panel">${canvas}</div>
      <footer class="mw-card__footer"><div class="proto-specimen__status" role="status" aria-live="polite">${status}</div><div class="proto-specimen__btns proto-specimen__btns--end">${extra}${btn("secondary", L("这次不换", "Not this time"), { "data-act": "trial-cancel" }, { disabled: !trying })}${btn("primary", P.external ? L("仍然用上", "Use mine anyway") : L("用上", "Use it"), { "data-act": "trial-apply", "data-primary": "" }, { key: "↵", disabled: primaryDisabled })}</div></footer>
    </article>`;
  }

  function lookSection() {
    const c = S.plan === "A" ? P.applied : (P.trial || P.applied);
    const scope = L("这个 Home 的所有窗口和 Mac App 共用一套外观。", "One look for every window of this Home and the Mac App.");
    const choices = `${skinGrid()}${S.plan === "A" ? feedbackA() : ""}${fontRows(c)}${monoRow(c)}${libRow()}`;
    const inner = S.plan === "C" ? `<div class="proto-split"><div>${choices}</div>${specimen()}</div>` : choices;
    return section("look-title", L("外观", "Look"), scope, inner, "data-look-section");
  }

  function deviceSection() {
    return section("device-title", L("这台设备", "This device"), L("只在这台设备上，别的设备各自设置。", "Kept on this device; other devices set their own."),
      row(L("主题", "Theme"), L("选择固定主题，或跟随系统外观。", "A fixed theme, or follow the system."), toggles(L("主题", "Theme"), [["light", L("浅色", "Light"), S.themePref === "light"], ["dark", L("深色", "Dark"), S.themePref === "dark"], ["system", L("跟随系统", "System"), S.themePref === "system"]], "theme"))
      + row(L("界面密度", "Density"), L("调整 Goal 导航和正文的间距。", "Spacing of the Goal navigation and the page."), toggles(L("界面密度", "Density"), [["standard", L("标准", "Standard"), S.density === "standard"], ["compact", L("紧凑", "Compact"), S.density === "compact"]], "density"))
      + row(L("终端外观", "Terminal"), L("为终端内容单独选择明暗配色。", "Light or dark for terminal content, on its own."), toggles(L("终端外观", "Terminal"), [["auto", L("跟随界面", "Follow"), S.terminal === "auto"], ["light", L("浅色", "Light"), S.terminal === "light"], ["dark", L("深色", "Dark"), S.terminal === "dark"]], "terminal")));
  }

  function langSection() {
    const missing = S.fault === "nolang";
    let note = "";
    if (S.langPref === "system") note = missing
      ? alertBox("info", esc(L("系统语言是日本語，还没有这种语言，先用中文显示", "Your system language is Japanese, which isn’t available yet; showing Chinese")), `<p>${esc(L("有了日本語语言包会自动换过去。", "It switches by itself once a Japanese language pack is added."))}</p>`)
      : `<p class="proto-hint">${ic("info")}<span>${esc(L("跟着系统：中文（简体）。", "Following the system: Chinese (Simplified)."))}</span></p>`;
    return section("lang-title", L("语言", "Language"), L("只影响这个浏览器；Mac App 有自己的选择。项目内容保持原来的语言。", "This browser only; the Mac App keeps its own. Project content keeps its own language."),
      row(L("界面语言", "Interface language"), L("换了马上生效，不用刷新，正在写的内容都留着。", "Takes effect at once, without reloading; what you are writing stays."), toggles(L("界面语言", "Interface language"), [["system", L("跟随系统", "System"), S.langPref === "system"], ["zh", "中文", S.langPref === "zh"], ["en", "English", S.langPref === "en"]], "lang") + note, "proto-stack"));
  }

  function recoverSection() {
    return section("recover-title", L("恢复", "Recover"), L("外观显示不对、看不清时用。也可以在 Mac App 菜单「帮助 › 恢复内置外观」里做。", "For a look that shows wrong or can’t be read. Also in the Mac App under Help › Restore the built-in look."),
      row(L("恢复内置外观", "Restore the built-in look"), L("换回 Soft Workbench 和系统字体。语言、你的方案和工作内容都保留。", "Back to Soft Workbench and the system font. Your language, your looks and your work stay."), btn("secondary", L("恢复内置外观…", "Restore…"), { "data-act": "recover" }, { icon: "undo" })));
  }

  function heading() {
    return `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("界面与语言", "Interface & language")}</h1></div><p>${L("外观、字体、明暗和语言。各项写着它管到哪里。", "Look, font, light or dark, and language. Each says how far it reaches.")}</p></header>`;
  }

  function recoverDialog() {
    if (P.dialog !== "recover") return "";
    return `<dialog class="mw-dialog mw-dialog--form" data-modal aria-labelledby="recover-title-d"><form class="mw-form" method="dialog" data-act="noop">
      <header class="mw-form__header"><h2 id="recover-title-d">${L("恢复内置外观？", "Restore the built-in look?")}</h2></header>
      <div class="mw-form__body"><p>${esc(L(`从 ${comboName(P.applied)} 换回 Soft Workbench · 系统无衬线。这个 Home 的所有窗口一起换；语言、你的方案和工作内容都保留，之后还能撤销。`, `From ${comboName(P.applied)} back to Soft Workbench · System sans, in every window of this Home. Your language, your looks and your work stay, and you can undo it.`))}</p></div>
      <footer class="mw-form__footer">${btn("secondary", L("取消", "Cancel"), { "data-act": "dialog-close", type: "button" }, { size: "md" })}${btn("primary", L("恢复", "Restore"), { "data-act": "recover-do", "data-primary": "" }, { size: "md", key: "↵" })}</footer>
    </form></dialog>`;
  }
  function specimenSheet() {
    if (!(S.plan === "C" && P.sheet && P.trial)) return "";
    return `<dialog class="mw-sheet" data-modal aria-label="${L("样张", "Specimen")}"><div class="mw-form__body"><div class="proto-sheet-close">${btn("ghost", L("先回去挑", "Back to the choices"), { "data-act": "sheet-close" }, { icon: "chevron-down" })}</div>${specimen()}</div></dialog>`;
  }

  // ---------- look switching ----------
  // slot: "load" (A applying) or "tload" (B/C trial). The prototype's font is local; the timer stands in for fetching it.
  function startLoad(slot, onReady, onFail) {
    const ms = S.fault === "slow" ? 3600 : S.fault === "fontfail" ? 1700 : 450;
    P[slot] = { phase: "loading" };
    later(ms, () => {
      if (S.fault === "fontfail") { P[slot] = slot === "load" ? null : { phase: "failed" }; if (onFail) onFail(); render(); return; }
      P.fontReady = true; P[slot] = null; onReady(); render();
    });
  }

  function applyA(next, external = false) {
    const target = { ...P.applied, ...next };
    if (same(target, P.applied)) return;
    if (invalid(target.skin)) { P.blocked = target.skin; P.status = null; return; }
    P.blocked = null;
    const before = { ...P.applied };
    const commit = () => {
      P.prev = before; P.applied = target; P.status = { phase: "done", name: comboName(target), external };
      if (!external) toast(L(`已用上 ${comboName(target)}`, `Now using ${comboName(target)}`), { act: "undo", label: L("撤销", "Undo") });
      armExternal();
    };
    if (needsLoad(target)) {
      // The colours change at once with the declared fallback type; if the font fails the whole switch goes back.
      P.applied = target; P.status = { phase: "loading", name: comboName(target) };
      startLoad("load", commit, () => {
        P.applied = before; P.status = { phase: "failed", back: comboName(before), skinName: T(skin(target.skin).name), target };
        announce(L("圆润字体没加载上，外观保持原样", "The rounded font didn’t load; the look stays as it was"));
      });
      return;
    }
    commit();
  }

  function setTrial(next) {
    const base = P.trial || P.applied;
    const t = { ...base, ...next };
    P.trial = same(t, P.applied) && !P.external ? null : t;
    P.tload = null;
    if (P.trial && needsLoad(P.trial)) startLoad("tload", () => {});
    if (S.plan === "C" && P.trial && matchMedia("(max-width: 760px)").matches) P.sheet = true;
    if (!P.trial) P.sheet = false;
    if (P.trial) armExternal();
  }

  function applyTrial() {
    if (!P.trial || invalid(P.trial.skin) || (P.tload && P.tload.phase === "failed")) return;
    P.prev = { ...P.applied }; P.applied = P.trial; P.trial = null; P.external = false; P.sheet = false;
    toast(L(`已用上 ${comboName(P.applied)}，所有窗口跟着换`, `Now using ${comboName(P.applied)} in every window`), { act: "undo", label: L("撤销", "Undo") });
  }

  // 「另一个窗口刚改过」: a few seconds after your first change, another window applies 「蓝绿工作台」.
  function armExternal() {
    if (S.fault !== "elsewhere" || !P.externalArmed) return;
    P.externalArmed = false;
    later(3000, () => {
      const theirs = { skin: "garden", font: "follow", mono: P.applied.mono };
      P.fontReady = true;
      if (S.plan === "A") {
        P.prev = { ...P.applied }; P.applied = theirs; P.status = { phase: "done", name: comboName(theirs), external: true };
        render(); toast(L(`另一个窗口刚换成了 ${comboName(theirs)}`, `Another window switched to ${comboName(theirs)}`), { act: "undo", label: L("换回", "Switch back") });
      } else {
        P.applied = theirs; P.external = !!P.trial;
        render();
      }
    });
  }

  // The look cross-fade (board addition): the page eases from the old look to the new one; reduced motion swaps at once.
  function transition(fn) {
    if (!document.startViewTransition || document.hidden || STILL || matchMedia("(prefers-reduced-motion: reduce)").matches) { fn(); return; }
    document.startViewTransition(fn);
  }

  // ---------- render ----------
  function proto() {
    const opt = (list, v) => list.map(([k, n]) => `<option value="${k}"${k === v ? " selected" : ""}>${esc(T(n))}</option>`).join("");
    document.getElementById("p-title").textContent = L("14 · 外观选择与应用规则（原型）", "14 · Choosing and applying a look (prototype)");
    document.getElementById("p-plan").textContent = L("方案", "Option");
    document.getElementById("p-fault").textContent = L("状态", "State");
    document.getElementById("plan").innerHTML = opt(D.plans, S.plan);
    document.getElementById("fault").innerHTML = opt(D.faults, S.fault);
    const seg = (el, items) => { document.getElementById(el).innerHTML = items.map(([v, n, cur, a]) => `<button type="button" class="mw-toggle${cur ? " is-current" : ""}" aria-pressed="${cur}" ${a}="${v}">${n}</button>`).join(""); };
    seg("lang", [["zh", "中文", S.lang === "zh", "data-lang"], ["en", "English", S.lang === "en", "data-lang"]]);
    const rt = resolvedTheme();
    seg("theme", [["light", L("浅色", "Light"), rt === "light", "data-theme-set"], ["dark", L("深色", "Dark"), rt === "dark", "data-theme-set"]]);
    seg("notes", [["1", L("标出组件板新增", "Mark board additions"), S.notes, "data-notes"]]);
    document.getElementById("reset").querySelector("[data-slot=button-label]").textContent = L("重来", "Restart");
  }

  let settled = false, settleTimer = null;
  function render() {
    const root = document.documentElement;
    const look = pageLook();
    const loadState = S.plan === "A" ? P.load : S.plan === "B" ? P.tload : null;
    const face = S.plan === "C" ? faceShown(P.applied, null) : faceShown(look, loadState);
    root.lang = S.lang === "zh" ? "zh-CN" : "en";
    const rt = resolvedTheme();
    root.dataset.theme = S.themePref; root.dataset.resolvedTheme = rt; root.dataset.skin = "soft"; root.dataset.density = S.density;
    root.dataset.look = look.skin; root.dataset.face = face; root.dataset.mono = look.mono;
    root.toggleAttribute("data-show-new", S.notes);
    proto();
    const app = document.getElementById("app");
    const scroller = document.querySelector(".settings-content");
    const top = scroller ? scroller.scrollTop : 0;
    const focusedAct = document.activeElement?.closest?.("[data-act]");
    const focusKey = focusedAct ? `[data-act="${focusedAct.dataset.act}"]${focusedAct.dataset.id ? `[data-id="${focusedAct.dataset.id}"]` : ""}${focusedAct.dataset.v ? `[data-v="${focusedAct.dataset.v}"]` : ""}` : null;
    app.innerHTML = settingsPage(`<section class="settings-document appearance-document" aria-labelledby="settings-title">${heading()}<div class="settings-body">${lookSection()}${deviceSection()}${langSection()}${recoverSection()}${trialBar()}</div></section>`) + recoverDialog() + specimenSheet();
    const next = document.querySelector(".settings-content");
    if (next) next.scrollTop = top;
    app.querySelectorAll("dialog[data-modal]").forEach((d) => { if (!d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } } });
    const dlg = app.querySelector("dialog[open]");
    if (dlg) dlg.querySelector("[data-primary]")?.focus();
    else if (focusKey) document.querySelector(focusKey)?.focus({ preventScroll: true });
    clearTimeout(settleTimer); settleTimer = setTimeout(() => { settled = true; document.body.classList.add("settled"); }, 450);
    if (settled) document.body.classList.add("settled");
  }
  function arrive() { settled = false; document.body.classList.remove("settled"); }

  function resetAll() { clearTimers(); P = freshLook(); document.getElementById("toasts").innerHTML = ""; if (S.fault === "nolang") { S.langPref = "system"; S.lang = "zh"; } }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-lang],[data-theme-set],[data-notes]");
    if (P.menu && !e.target.closest(".proto-skin__more, .mw-menu")) { P.menu = null; if (!t) { render(); return; } }
    if (!t) return;
    if (t.matches("a")) e.preventDefault();
    if (t.dataset.lang) { S.lang = t.dataset.lang; S.langPref = t.dataset.lang; save(); render(); return; }
    if (t.dataset.themeSet) { S.themePref = t.dataset.themeSet; save(); transition(render); return; }
    if (t.dataset.notes) { S.notes = !S.notes; save(); render(); return; }
    const act = t.dataset.act, id = t.dataset.id, v = t.dataset.v;
    if (t.matches("input[type=radio], select")) return; // handled on change
    switch (act) {
      case "skin":
        if (S.plan === "A") { applyA({ skin: id }); transition(render); }
        else { setTrial({ skin: id }); arrive(); if (S.plan === "B") transition(render); else render(); }
        return;
      case "menu": P.menu = P.menu === id ? null : id; render(); document.querySelector(".proto-skin .mw-menu__item")?.focus(); return;
      case "lib": {
        P.menu = null;
        const msg = { copy: L("（原型）复制出「我的方案」，打开文件或交给助理来改", "(prototype) A copy is added under My looks, to edit in its file or with the assistant"), export: L("（原型）导出成一个文件夹：外观文件、字体方案和能随带的字体", "(prototype) Exported as a folder: the look, its font scheme and the fonts it may carry"), remove: L("（原型）移除前先确认；在用的方案不能移除", "(prototype) Removing asks first; a look in use can’t be removed"), import: L("（原型）选好文件后先检查，通过才出现在这里", "(prototype) A chosen file is checked first and shows up here only if it passes"), assistant: L("（原型）打开助理，带着这个方案和问题", "(prototype) Opens the assistant with this look and its problems"), file: L("（原型）打开方案文件，问题标在对应字段上", "(prototype) Opens the look’s file with each problem at its field") }[v];
        toast(msg); render(); return;
      }
      case "trial-cancel": P.trial = null; P.tload = null; P.external = false; P.sheet = false; transition(render); announce(L("已还原", "Put back")); return;
      case "trial-apply": applyTrial(); transition(render); return;
      case "retry":
        if (S.plan === "A" && P.status && P.status.target) { const target = P.status.target; S.fault = "none"; save(); applyA(target); }
        else if (P.trial) { S.fault = "none"; save(); P.tload = null; startLoad("tload", () => {}); }
        transition(render); return;
      case "fallback-apply": if (P.status && P.status.target) applyA({ ...P.status.target, font: "system" }); transition(render); return;
      case "undo":
        if (P.prev) { const back = P.prev; P.prev = { ...P.applied }; P.applied = back; P.trial = null; P.external = false; P.status = null; P.blocked = null; toast(L(`已换回 ${comboName(back)}`, `Back to ${comboName(back)}`)); transition(render); }
        return;
      case "sheet-close": P.sheet = false; render(); return;
      case "recover": P.dialog = "recover"; arrive(); render(); return;
      case "dialog-close": P.dialog = null; render(); return;
      case "recover-do": P.dialog = null; P.prev = { ...P.applied }; P.applied = { skin: "soft", font: "follow", mono: "system" }; P.trial = null; P.tload = null; P.status = null; P.blocked = null; P.external = false; toast(L("已恢复内置外观", "Built-in look restored"), { act: "undo", label: L("撤销", "Undo") }); transition(render); return;
      case "theme": S.themePref = v; save(); transition(render); return;
      case "density": S.density = v; save(); render(); toast(L("界面密度只改这台设备", "Density changes on this device only")); return;
      case "terminal": S.terminal = v; save(); render(); return;
      case "lang":
        S.langPref = v; S.lang = v === "system" ? "zh" : v; save(); render();
        toast(v === "system" ? L("界面语言跟随系统", "Interface language follows the system") : L("界面语言换成中文，只影响这个浏览器", "Interface language is now English, in this browser only"));
        return;
      default: return;
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "plan") { S.plan = t.value; save(); resetAll(); arrive(); render(); return; }
    if (t.id === "fault") { S.fault = t.value; save(); resetAll(); arrive(); render(); return; }
    if (t.dataset.act === "font") {
      if (S.plan === "A") { applyA({ font: t.value }); transition(render); } else { setTrial({ font: t.value }); S.plan === "B" ? transition(render) : render(); }
      return;
    }
    if (t.dataset.act === "mono") {
      if (S.plan === "A") { applyA({ mono: t.value }); transition(render); } else { setTrial({ mono: t.value }); S.plan === "B" ? transition(render) : render(); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (P.menu) { P.menu = null; render(); return; }
      if (P.dialog) { e.preventDefault(); P.dialog = null; render(); return; }
      if (P.sheet) { e.preventDefault(); P.sheet = false; render(); }
    }
    if (e.key === "Enter" && !e.target.matches("input[type=text], textarea, select, button, a, [role=menuitem]")) {
      const p = document.querySelector("dialog[open] [data-primary]:not(:disabled)") || document.querySelector(".proto-trialbar [data-primary]:not(:disabled)");
      if (p) { e.preventDefault(); p.click(); }
    }
  });
  document.getElementById("reset").addEventListener("click", () => { resetAll(); arrive(); render(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (S.themePref === "system") render(); });

  window.__protoState = () => JSON.parse(JSON.stringify({ S, P }));
  lookRules();
  if (S.fault === "nolang" && S.langPref !== "system") { S.langPref = "system"; S.lang = "zh"; }
  render();
})();
