// 37-1 · 生成页面运行、采用与恢复 — clickable review prototype. Sample data only: no Home is read or written, no model is
// called, no action runs. Timers stand in for the assistant making a draft and for the adoption steps.
//
// Drawn in a sketched workbench (tab strip, project home, dock — the frame is a stand-in, not part of this decision) with
// board parts from ../kit (mw-btn, mw-toggle-group, mw-select, mw-input, mw-switch, mw-badge, mw-status + state ring,
// mw-alert, mw-bar-status, mw-table, mw-dialog--form, mw-popover, mw-menu, mw-steps, mw-check-row, mw-toast). The few new
// parts carry data-board-new and are listed in README.md 「组件板新增」; their styles are in proto.css.
//
// The user chose B (side by side) on 2026-11-04; it is the default. A and C stay only for comparison.
// The page is the home's own content (a platform capability), not a plugin: nothing is installed or listed as a plugin.
//
// What every option shares (only 「从草稿到采用」 differs between A, B and C):
// - A draft never replaces the page in use. Checks run on every draft; a failed check blocks adopting, says what and why,
//   and offers a fix. Real content is the default preview; writing from a preview asks first, sample content never writes.
// - Adopting lists what changes, at which scope; a new permission is its own line; one already given is reused, not asked.
//   Steps report done / failed / not yet; a retry redoes only what failed. Undo is offered once it is in use.
// - In use: an action failing stays on its row with the reason and a retry; a withdrawn permission disables the buttons it
//   covers and says why; a plugin turned off empties only its column; a page that will not load falls back to the previous
//   usable version, then to the basic home, keeping the draft and your edits.
// - Versions: one list under the version button (the 19 pattern). Restoring never redoes finished work.
(() => {
  const D = window.protoData;
  const K = window.mwKit;
  const KEY = "molis-proto.generated-page-adoption.v1";
  const STILL = new URLSearchParams(location.search).has("still");

  const fresh = () => ({ plan: "B", stage: "live", fault: "none", lang: "zh", theme: "light", notes: true });
  let S = load() || fresh();
  let P = {};
  let timers = [];
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 2 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, s: S })); } catch { /* preview without storage */ } }
  function later(ms, fn) { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, STILL ? Math.min(ms, 60) : ms); timers.push(t); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // ---------- words ----------
  const L = (zh, en) => (S.lang === "en" ? en : zh);
  const T = (pair) => (pair ? L(pair[0], pair[1]) : "");
  const esc = K.escapeHtml;
  const Q = (s) => L(`「${s}」`, `“${s}”`);
  const announce = (m) => { document.getElementById("live").textContent = m; };
  const ver = (id) => D.versions.find((v) => v.id === id);
  const person = (id) => T(D.people.find((p) => p[0] === id).slice(1));
  const F = (id) => S.fault === id;

  // ---------- board parts ----------
  const ic = (n) => K.icon(n);
  const btn = (variant, label, attrs = {}, o = {}) => K.renderButton({ variant, size: o.size || "sm", label, icon: o.icon, iconOnly: o.iconOnly, key: o.key, disabled: o.disabled, attrs });
  const badge = (tone, label) => K.renderBadge({ tone, label });
  const ring = (state) => K.renderStateRing({ state });
  const mark = (tone, state, label) => K.renderStatusMark({ tone, state, label });
  const toggles = (label, items, act, cls = "") => K.renderToggleGroup({ label, className: cls, items: items.map(([v, n, cur]) => ({ value: v, label: n, current: cur, attrs: { "data-act": act, "data-v": v } })) });
  const alertBox = (tone, title, body = "", actions = "", extra = "") => `<div class="mw-alert mw-alert--${tone} gp-alert" data-slot="alert" role="status" ${extra}><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${actions ? `<div class="gp-alert__actions">${actions}</div>` : ""}</div>`;
  const isNew = (zh, en) => `data-board-new="${L(zh, en)}"`;

  function toast(message, action) {
    const host = document.getElementById("toasts");
    host.innerHTML = `<div class="mw-toast" data-slot="toast" role="status"><span>${esc(message)}</span>${action ? `<button type="button" class="mw-toast__action" data-act="${action.act}">${esc(action.label)}</button>` : ""}</div>`;
    announce(message);
    clearTimeout(toast.t); toast.t = setTimeout(() => { host.innerHTML = ""; }, 6000);
  }

  // ---------- state for a stage ----------
  function enter(stage, quiet) {
    clearTimers();
    S.stage = stage;
    P = {
      inUse: "v2", project: F("switch") ? "other" : "main", draft: null, dialog: null, adopt: null, cStep: 0, guide: false,
      versionsOpen: false, menu: false, compose: false, checksOpen: false, showNow: false, view: "draft", rows: {},
      filter: { quick: "all", who: "all", compare: true }, loadTry: 0, revokedSeen: false,
    };
    const draft = () => ({ ready: true, gen: false, fixed: false, dropPR: false, conflict: null, data: "real" });
    if (stage === "live" && F("restart")) P.draft = { ...draft(), restored: true };
    if (stage === "gen") startGen();
    if (stage === "draft") { P.draft = draft(); openDraft(); }
    if (stage === "adopt") { P.draft = draft(); openDraft(); openAdopt(); }
    if (stage === "done" || stage === "versions") {
      P.inUse = "v3"; P.hasV3 = true;
      if (F("loadfail")) P.inUse = "v2", P.fellBack = "v3";
      if (F("allfail")) P.inUse = "base", P.fellBack = "all";
      if (stage === "versions") P.versionsOpen = true;
    }
    if (!quiet) render();
  }
  function openDraft() { if (S.plan === "C") { P.guide = true; P.cStep = 2; } }
  function startGen() {
    P.draft = { ready: false, gen: true, fixed: false, dropPR: false, conflict: null, data: "real" };
    P.compose = false;
    if (S.plan === "C") { P.guide = true; P.cStep = 1; }
    S.stage = "gen";
    later(1600, () => {
      P.draft = { ...P.draft, ready: true, gen: false };
      if (S.plan === "C") { P.cStep = 2; S.stage = "draft"; }
      announce(L("第 3 版草稿好了", "The version 3 draft is ready"));
      render();
    });
  }
  function openAdopt() {
    P.adopt = { phase: "review", step: -1, failed: null, grant: true, retried: false };
    if (S.plan === "C") { P.guide = true; P.cStep = 3; } else P.dialog = "adopt";
    S.stage = "adopt";
  }

  // What blocks adopting right now, if anything.
  function blocker() {
    const d = P.draft;
    if (!d || !d.ready) return null;
    if (F("checkfail") && !d.fixed && !d.dropPR) return "check";
    if (F("conflict") && !d.conflict) return "conflict";
    return null;
  }
  const prShown = (v, ctx) => v === "v3" && !(ctx.draft && P.draft && P.draft.dropPR) && !(P.adopt && P.adopt.phase !== "review" && !P.adopt.grant && !ctx.draft);
  const prBlocked = (ctx) => ctx.draft && F("checkfail") && P.draft && !P.draft.fixed && !P.draft.dropPR;
  const ownerLabel = (v, ctx) => {
    // Your edit renamed the column; version 3 named it back. Until you choose, the draft shows its own name.
    if (v === "v3" && F("conflict")) {
      const c = P.draft ? P.draft.conflict : "mine";
      if (ctx.draft && (!c || c === "new")) return L("负责人", "Owner");
      if (!ctx.draft && P.chosen === "new") return L("负责人", "Owner");
    }
    return L("谁在做", "Who’s on it");
  };

  // ---------- the generated page itself ----------
  function generatedPage(v, ctx = {}) {
    const sample = ctx.draft && P.draft && P.draft.data === "sample";
    const showPR = prShown(v, ctx);
    const v3 = v === "v3";
    const f = P.filter;
    const newTag = (zh, en) => (ctx.draft && v3 ? `<span class="gp-new">${badge("info", L(zh, en))}</span>` : "");
    let rows = (sample ? D.sampleRows : D.rows).filter((r) => !r.hiddenByYou);
    if (f.quick === "mine") rows = rows.filter((r) => r.who === "me");
    if (f.quick === "stuck") rows = rows.filter((r) => r.state === "blocked");
    if (v3 && f.who !== "all") rows = rows.filter((r) => r.who === f.who);
    rows = rows.slice().sort((a, b) => (a.state === "blocked" ? -1 : 0) - (b.state === "blocked" ? -1 : 0));
    const revoked = F("revoked") && !ctx.draft;
    const depOff = F("depoff") && showPR;
    const tools = `<div class="gp-tools">
      ${toggles(L("快速筛选", "Quick filter"), [["all", L("全部", "All"), f.quick === "all"], ["mine", L("我的", "Mine"), f.quick === "mine"], ["stuck", L("卡住的", "Stuck"), f.quick === "stuck"]], "quick")}
      ${v3 ? `<label class="gp-tool">${esc(ownerLabel(v, ctx))}<select class="mw-select" data-act="who" aria-label="${esc(ownerLabel(v, ctx))}">${D.people.map((p) => `<option value="${p[0]}"${f.who === p[0] ? " selected" : ""}>${esc(T(p.slice(1)))}</option>`).join("")}</select>${newTag("新", "New")}</label>` : ""}
      <label class="gp-tool">${L("截止到", "Due by")}<input class="mw-input" type="date" value="2026-11-08" aria-label="${L("截止到", "Due by")}"></label>
      ${v3 ? `<label class="gp-tool gp-tool--switch"><span class="mw-switch"><input type="checkbox" role="switch" data-act="compare"${f.compare ? " checked" : ""}><span class="mw-switch__track"></span></span>${L("和上周比", "Compare with last week")}${newTag("新", "New")}</label>` : ""}
    </div>`;
    const compare = v3 && f.compare ? `<div class="gp-compare" role="group" aria-label="${L("这周和上周", "This week and last")}">${D.compare.map(([n, a, b]) => `<div class="gp-stat"><span>${esc(T(n))}</span><strong class="mw-num">${a}</strong><small>${L(`上周 ${b}`, `Last week ${b}`)}</small></div>`).join("")}</div>` : "";
    const notes = [
      sample ? alertBox("info", L("这里是示例内容", "This is sample content"), L("点了不会写进任何地方。换成真实内容可以看你的事项。", "Nothing you click is saved. Switch to real content to see your items.")) : "",
      depOff ? alertBox("warning", L("Coding 已停用，「PR 状态」先空着", "Coding is off, so PR status is empty for now"), L("其余照常。启用 Coding 后这一栏自己回来。", "Everything else works. The column comes back when Coding is on."), btn("secondary", L("启用 Coding", "Turn on Coding"), { "data-act": "enable-coding" })) : "",
      revoked ? alertBox("warning", L("这个页面不能再改待办了", "This page can no longer change to-dos"), L("今天 11:02 你在设置里收回了「标完成」。看和筛选照常。", "You withdrew “Mark done” in Settings today at 11:02. Viewing and filtering still work."), btn("secondary", L("看这个页面的许可", "See this page’s permissions"), { "data-act": "perms" })) : "",
    ].join("");
    const head = `<tr><th>${L("事项", "Item")}</th><th>${L("状态", "Status")}</th><th>${esc(ownerLabel(v, ctx))}</th>${showPR ? `<th class="${prBlocked(ctx) ? "gp-th-blocked" : ""}">${L("PR 状态", "PR status")}${newTag("新", "New")}</th>` : ""}<th>${L("截止", "Due")}</th><th><span class="mw-sr-only">${L("操作", "Actions")}</span></th></tr>`;
    const body = rows.map((r) => rowHtml(r, { ...ctx, showPR, revoked, depOff, sample })).join("") || `<tr><td colspan="6"><div class="mw-empty"><strong>${L("这个筛选下没有事项", "Nothing under this filter")}</strong><p>${L("换个筛选看看。", "Try another filter.")}</p></div></td></tr>`;
    return `<div class="gp-page${ctx.compact ? " gp-page--compact" : ""}">
      ${tools}${notes}${compare}
      <div class="mw-table-wrap gp-table"><table class="mw-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <p class="gp-foot">${ic("shield")}<span>${L("这是首页自己的页面，在隔离里运行；事项来自待办", "This page belongs to the home and runs isolated. Items come from To-dos")}${showPR ? L("，PR 来自 Coding", ", PRs from Coding") : ""}${L("。", ".")}</span></p>
    </div>`;
  }

  function rowHtml(r, ctx) {
    const st = P.rows[r.id] || {};
    const pr = ctx.showPR ? `<td class="gp-pr">${prBlocked(ctx) ? mark("blocked", "blocked", L("已拦下", "Blocked")) : ctx.depOff ? `<span class="gp-muted">—</span>` : mark(r.prTone === "blocked" ? "blocked" : r.prTone === "hold" ? "hold" : r.prTone === "done" ? "done" : "idle", r.prTone === "blocked" ? "failed" : r.prTone === "hold" ? "waiting" : r.prTone === "done" ? "done" : "draft", T(r.pr))}</td>` : "";
    const now = st.done ? "done" : r.state;
    const stateTone = { progress: "progress", blocked: "blocked", idle: "idle", done: "done" }[now];
    const ringState = { progress: "running", blocked: "blocked", idle: "draft", done: "done" }[now];
    let action = "";
    if (st.done) action = `<span class="gp-rowdone">${mark("done", "done", L("已标完成", "Marked done"))}${btn("link", L("撤销", "Undo"), { "data-act": "row-undo", "data-id": r.id })}</span>`;
    else if (r.state !== "done") {
      const dis = ctx.revoked;
      action = btn("secondary", L("标完成", "Mark done"), { "data-act": "row-done", "data-id": r.id, ...(dis ? { title: L("这个页面不能再改待办", "This page can no longer change to-dos") } : {}) }, { disabled: dis, icon: "check" });
    }
    const cells = `<td class="gp-title"><button type="button" class="gp-link" data-act="open-item">${esc(T(r.title))}</button></td><td class="gp-st">${mark(stateTone, ringState, st.done ? L("完成了", "Done") : T(r.stateLabel))}</td><td class="gp-who">${esc(person(r.who))}</td>${pr}<td class="gp-due"><span class="mw-num">${esc(T(r.due))}</span></td><td class="gp-act">${action}</td>`;
    let extra = "";
    if (st.confirm) extra = `<tr class="gp-rowmsg"><td colspan="6"><div class="gp-confirm" role="group" aria-label="${L("确认", "Confirm")}"><span>${ic("info")}${esc(L(`这会真的把${Q(T(r.title))}标完成，写进待办。`, `This really marks ${Q(T(r.title))} done in To-dos.`))}</span>${btn("ghost", L("算了", "Cancel"), { "data-act": "row-cancel", "data-id": r.id })}${btn("primary", L("标完成", "Mark done"), { "data-act": "row-commit", "data-id": r.id }, { key: "↵" })}</div></td></tr>`;
    if (st.error) extra = `<tr class="gp-rowmsg"><td colspan="6">${alertBox("danger", L("没标上", "Not marked"), L("小林刚改过这一项，待办里的内容和页面上看到的不一样了。刷新这一行再看。", "Lin just changed this item, so it no longer matches what the page shows. Refresh the row and look again."), btn("secondary", L("刷新这一行", "Refresh this row"), { "data-act": "row-refresh", "data-id": r.id }, { icon: "refresh" }))}</td></tr>`;
    return `<tr data-row="${r.id}"${st.error ? ' class="gp-row--error"' : ""}${st.flash ? ' class="gp-row--flash"' : ""}>${cells}</tr>${extra}`;
  }

  // ---------- page header with the version button (shared) ----------
  function pageHeader() {
    const v = P.inUse;
    const name = v === "base" ? L("首页", "Home") : T(D.page);
    const verBtn = v === "base" ? "" : `<span class="gp-ver">${btn("ghost", T(ver(v).name), { "data-act": "versions", "aria-haspopup": "dialog", "aria-expanded": String(P.versionsOpen) }, { icon: "history" })}${P.versionsOpen ? versionsPopover() : ""}</span>`;
    const more = `<span class="gp-more">${btn("ghost", L("更多", "More"), { "data-act": "menu", "aria-haspopup": "menu", "aria-expanded": String(P.menu) }, { iconOnly: true, icon: "more" })}${P.menu ? K.renderMenu({ items: [
      v === "base" ? "" : K.renderMenuItem({ label: L("回到基础首页", "Back to the basic home"), iconName: "home", attrs: { "data-act": "to-base" } }),
      K.renderMenuItem({ label: L("这个页面能做什么", "What this page may do"), iconName: "shield", attrs: { "data-act": "perms" } }),
    ].join("") }) : ""}</span>`;
    const edit = S.stage === "gen" ? "" : btn("secondary", L("改这个页面", "Change this page"), { "data-act": "compose" }, { icon: "sparkles" });
    return `<header class="gp-head"><div class="gp-head__title"><h1>${esc(name)}</h1>${verBtn}</div><div class="gp-head__acts">${v === "base" ? "" : edit}${more}</div></header>`;
  }

  function versionsPopover() {
    const rows = [];
    if (P.draft && P.draft.ready && S.stage !== "done") rows.push({ id: "draft", name: L("第 3 版", "Version 3"), when: T(ver("v3").when), why: T(ver("v3").why), tags: [badge("info", L("草稿", "Draft"))], act: btn("secondary", L("看草稿", "View draft"), { "data-act": "to-draft" }) });
    for (const v of D.versions) {
      if (v.id === "v3" && !P.hasV3) continue;
      const inUse = P.inUse === v.id;
      const tags = [inUse ? badge("success", L("在用", "In use")) : "", v.edits ? badge("neutral", L(`你改过 ${v.edits} 处`, `${v.edits} edits by you`)) : "", P.fellBack && v.id === "v3" ? badge("warning", L("没打开", "Did not load")) : "", !inUse && v.id === prevUsable() ? badge("neutral", L("上一可用", "Last working")) : ""].join("");
      rows.push({ id: v.id, name: T(v.name), when: T(v.when), why: T(v.why), tags: [tags], act: inUse ? "" : btn("secondary", L("换回这一版", "Restore"), { "data-act": "restore", "data-v": v.id }) });
    }
    rows.push({ id: "base", name: L("基础首页", "Basic home"), when: "", why: L("不用生成的页面，只看各插件自己的内容", "No generated page; each plugin’s own content"), tags: [P.inUse === "base" ? badge("success", L("在用", "In use")) : ""], act: P.inUse === "base" ? "" : btn("secondary", L("换成基础首页", "Switch"), { "data-act": "restore", "data-v": "base" }) });
    const list = rows.map((r) => `<li class="gp-vrow"><div class="gp-vrow__text"><strong>${esc(r.name)}</strong>${r.when ? `<span class="gp-muted">${esc(r.when)}</span>` : ""}${r.tags.join("")}<small>${esc(r.why)}</small></div>${r.act}</li>`).join("");
    return K.renderPopover({ className: "gp-versions", preview: true, attrs: { role: "dialog", "aria-label": L("版本", "Versions") }, body: `<ul class="gp-vlist">${list}</ul><p class="gp-hint">${ic("info")}<span>${L("换回只换页面，不会重做或撤回已经做过的事（标完成的待办不会变回去）。", "Restoring only swaps the page. It never redoes or reverts work already done; to-dos you marked done stay done.")}</span></p>` });
  }
  const prevUsable = () => (P.inUse === "v3" ? "v2" : P.inUse === "v2" ? "v1" : "v2");

  // ---------- composer: 「改这个页面」 ----------
  function composer() {
    if (!P.compose) return "";
    return `<section class="gp-compose" aria-label="${L("要怎么改", "How to change it")}">
      <label class="mw-field"><span class="mw-field__label">${ic("sparkles")}${L("要怎么改？交给助理做一版草稿，现在的页面不会变。", "How should it change? The assistant makes a draft; the page in use stays as it is.")}</span>
      <textarea class="mw-textarea" rows="2" id="ask">${esc(T(D.ask))}</textarea></label>
      <div class="gp-row-end">${btn("ghost", L("取消", "Cancel"), { "data-act": "compose-cancel" })}${btn("primary", L("交给助理", "Hand to the assistant"), { "data-act": "generate" }, { key: "↵" })}</div>
    </section>`;
  }

  // While the assistant works, the page in use stays usable; one quiet line says so.
  function genLine() {
    if (!P.draft) return "";
    if (P.draft.gen) return `<div class="gp-genline">${K.renderBarStatus({ spin: true, title: L("助理在做第 3 版草稿", "The assistant is making a version 3 draft"), caption: L("现在的页面照常能用；做好了在这里说", "The page in use keeps working; this line says when it is ready") })}${btn("ghost", L("停下", "Stop"), { "data-act": "stop-gen" })}</div>`;
    if (S.plan !== "C" && (S.stage === "gen" || (S.stage === "live" && P.draft.ready))) {
      const restored = P.draft.restored;
      return `<div class="gp-genline">${K.renderBarStatus({ glyph: restored ? "history" : "sparkles", title: restored ? L("上次没采用的第 3 版草稿还在", "Your unadopted version 3 draft is still here") : L("第 3 版草稿好了", "The version 3 draft is ready"), caption: restored ? L("今天 14:20 做的，重启后接着用", "Made today at 14:20, kept over the restart") : L("采用之前，现在的页面不会变", "Nothing changes until you adopt it") })}${btn("ghost", L("放弃", "Discard"), { "data-act": "discard" })}${btn("primary", L("看草稿", "View draft"), { "data-act": "to-draft" })}</div>`;
    }
    return "";
  }

  // ---------- draft summary, checks and issues (shared) ----------
  function checkMark() {
    const b = blocker();
    if (!P.draft || !P.draft.ready) return "";
    if (b === "check") return mark("blocked", "blocked", L("1 项检查没过", "1 check failed"));
    if (b === "conflict") return mark("attention", "conflict", L("有 1 处要你选", "1 thing needs your choice"));
    if (F("depoff")) return mark("hold", "waiting", L("检查都过了 · 1 块先空着", "Checks passed · 1 part empty for now"));
    return mark("done", "done", L("检查都过了", "Checks passed"));
  }
  function checksList() {
    const failed = F("checkfail") && P.draft && !P.draft.fixed && !P.draft.dropPR;
    return `<ul class="gp-checks">${D.checks.map((c) => {
      const bad = failed && c.bad;
      return `<li>${ring(bad ? "blocked" : "done")}<span>${esc(T(bad ? c.bad : c.ok))}</span></li>`;
    }).join("")}${F("depoff") ? `<li>${ring("waiting")}<span>${L("要用 Coding 的「PR 状态」一栏：Coding 已停用，这一栏先空着，其余照常", "The PR status column needs Coding, which is off: it stays empty, everything else works")}</span></li>` : ""}</ul>`;
  }
  function changeChips() {
    const d = P.draft;
    const items = [[L("PR 状态一栏", "PR status column"), !(d && d.dropPR)], [L("按负责人筛", "Filter by owner"), true], [L("和上周比", "Compare with last week"), true]];
    return `<div class="gp-chips" aria-label="${L("这一版改了什么", "What this version changes")}"><span class="gp-muted">${L("这一版：", "This version:")}</span>${items.filter((i) => i[1]).map((i) => badge("info", "+ " + i[0])).join("")}${badge("neutral", L("你改过的 2 处照旧", "Your 2 edits kept"))}</div>`;
  }
  function issues() {
    const b = blocker();
    const d = P.draft;
    if (b === "check") return alertBox("danger", L("「PR 状态」一栏没通过检查，先不能采用", "The PR status column failed a check, so this draft can’t be adopted yet"), L("它想直接读 Coding 的数据，没走 Coding 公开的操作，已在隔离里拦下。别的部分没问题。", "It tried to read Coding’s data directly rather than through Coding’s public actions, and was stopped inside the sandbox. The rest is fine."), btn("secondary", L("交给助理改", "Ask the assistant to fix it"), { "data-act": "fix" }, { icon: "sparkles" }) + btn("ghost", L("去掉这一栏再采用", "Drop the column and adopt"), { "data-act": "drop-pr" }));
    if (b === "conflict") return `<div class="gp-conflict" ${isNew("改动对照", "Edit clash")}>${alertBox("warning", L("第 3 版把「谁在做」叫回了「负责人」", "Version 3 renamed “Who’s on it” back to “Owner”"), L("这是你在第 2 版里改的。选一个，再采用。", "You changed this in version 2. Choose one, then adopt."))}
      <div class="gp-pair"><div class="gp-pair__side"><small>${L("你改的", "Yours")}</small><strong>${L("谁在做", "Who’s on it")}</strong></div><div class="gp-pair__side"><small>${L("第 3 版", "Version 3")}</small><strong>${L("负责人", "Owner")}</strong></div></div>
      <div class="gp-row-end">${btn("primary", L("保留我的", "Keep mine"), { "data-act": "pick", "data-v": "mine" })}${btn("secondary", L("用新的", "Use the new one"), { "data-act": "pick", "data-v": "new" })}${btn("ghost", L("合并后再改", "Merge, then edit"), { "data-act": "pick", "data-v": "merge" })}</div></div>`;
    if (F("conflict") && d && d.conflict) return `<p class="gp-hint">${ic("check")}<span>${d.conflict === "new" ? L("用第 3 版的列名「负责人」。", "Using version 3’s name, “Owner”.") : L("保留你的列名「谁在做」。", "Keeping your name, “Who’s on it”.")}</span>${btn("link", L("改选", "Change"), { "data-act": "pick", "data-v": "" })}</p>`;
    if (d && d.dropPR) return `<p class="gp-hint">${ic("info")}<span>${L("已去掉「PR 状态」一栏；以后可以再让助理加回来。", "The PR status column is dropped; you can ask for it again later.")}</span></p>`;
    if (d && d.fixed) return `<p class="gp-hint">${ic("check")}<span>${L("助理改好了：「PR 状态」现在经 Coding 公开的操作读取，检查都过了。", "Fixed: PR status now reads through Coding’s public action, and every check passes.")}</span></p>`;
    return "";
  }
  const dataToggle = () => toggles(L("预览用的内容", "Preview content"), [["real", L("真实内容", "Real content"), P.draft.data === "real"], ["sample", L("示例内容", "Sample content"), P.draft.data === "sample"]], "data");
  const adoptBtn = (label = L("采用…", "Adopt…")) => {
    const b = blocker();
    return btn("primary", label, { "data-act": "adopt", ...(b ? { title: b === "check" ? L("先处理没通过的检查", "Deal with the failed check first") : L("先选一个列名", "Choose a column name first") } : {}) }, { key: "↵", disabled: !!b });
  };

  // ---------- adoption: review and progress (dialog in A/B, a step in C) ----------
  function adoptReview() {
    const d = P.draft;
    const a = P.adopt;
    const lines = D.changes.filter((c) => !(c.kind === "grant" && (d.dropPR || F("depoff")))).map((c) => {
      if (c.kind === "grant") return `<li class="gp-change gp-change--grant"><label class="mw-check-row"><input class="mw-check" type="checkbox" data-act="grant"${a.grant ? " checked" : ""}><span><strong>${esc(T(c.text))}</strong><small>${esc(T(c.why))} · ${esc(T(c.scope))}</small></span></label>${badge("warning", L("新的许可", "New permission"))}</li>`;
      return `<li class="gp-change">${ic(c.icon)}<span>${esc(T(c.text))}</span>${c.scope[0] ? badge("neutral", T(c.scope)) : ""}</li>`;
    }).join("");
    const dep = F("depoff") ? `<li class="gp-change">${ring("waiting")}<span>${L("「PR 状态」要 Coding：Coding 已停用，这一栏先不出现；启用 Coding 后自己出现，不用再采用一次", "PR status needs Coding, which is off: the column is hidden for now and appears once Coding is on, without adopting again")}</span>${btn("link", L("启用 Coding", "Turn on Coding"), { "data-act": "enable-coding" })}</li>` : "";
    const partial = !a.grant && !d.dropPR && !F("depoff") ? `<p class="gp-hint">${ic("info")}<span>${L("不给这个许可，就先采用其余部分；「PR 状态」一栏不出现。", "Without this permission the rest is adopted and the PR status column is left out.")}</span></p>` : "";
    return `<ul class="gp-changes">${lines}${dep}</ul>${partial}<p class="gp-hint">${ic("shield")}<span>${esc(T(D.notDone))}</span></p>`;
  }
  function adoptProgress() {
    const a = P.adopt;
    const skipGrant = !a.grant || (P.draft && P.draft.dropPR) || F("depoff");
    return `<ol class="gp-steps">${D.steps.map((s, i) => {
      if (i === 1 && skipGrant) return `<li>${ring("draft")}<span>${esc(T(s))}</span><small class="gp-muted">${L("这次不做", "Skipped this time")}</small></li>`;
      let st = "draft", note = L("还没做", "Not yet");
      if (a.failed === i) { st = "failed"; note = L("没成：设置暂时写不进去，别的步骤没受影响", "Failed: settings could not be written just now; other steps are unaffected"); }
      else if (i < a.step || a.phase === "done") { st = "done"; note = L("已生效", "Done"); }
      else if (i === a.step) { st = "running"; note = L("正在做", "Working"); }
      return `<li>${ring(st)}<span>${esc(T(s))}</span><small class="${a.failed === i ? "gp-bad" : "gp-muted"}">${esc(note)}</small></li>`;
    }).join("")}</ol>`;
  }
  function runAdopt(from = 0) {
    const a = P.adopt;
    a.phase = "run"; a.failed = null; a.step = from;
    const skipGrant = !a.grant || P.draft.dropPR || F("depoff");
    const tick = () => {
      if (a.step === 1 && skipGrant) a.step++;
      if (a.step >= D.steps.length) { finishAdopt(); return; }
      if (a.step === 1 && F("adoptfail") && !a.retried) { a.failed = 1; a.phase = "failed"; announce(L("记下许可这一步没成", "Recording the permission failed")); render(); return; }
      render();
      later(650, () => { a.step++; tick(); });
    };
    tick();
  }
  function finishAdopt() {
    P.adopt.phase = "done";
    P.chosen = P.draft.conflict;
    if (S.plan === "C") { P.cStep = 4; render(); return; }
    P.dialog = null; P.draft = null; P.inUse = "v3"; P.hasV3 = true; S.stage = "done"; save();
    render();
    toast(L("已换成第 3 版，别的窗口也换了", "Now on version 3, in every window"), { act: "undo-adopt", label: L("撤销", "Undo") });
  }
  function adoptFooter() {
    const a = P.adopt;
    if (a.phase === "review") return `${btn("ghost", L("取消", "Cancel"), { "data-act": "adopt-cancel" })}${btn("primary", a.grant || P.draft.dropPR || F("depoff") ? L("采用", "Adopt") : L("先采用其余部分", "Adopt the rest"), { "data-act": "adopt-run" }, { key: "↵" })}`;
    if (a.phase === "failed") return `${btn("ghost", L("退回已做的", "Undo what was done"), { "data-act": "adopt-rollback" })}${btn("secondary", L("先采用其余部分", "Adopt the rest"), { "data-act": "adopt-skip" })}${btn("primary", L("只重试这一步", "Retry this step"), { "data-act": "adopt-retry" }, { key: "↵" })}`;
    return `${btn("ghost", L("在后台继续", "Keep going in the background"), { "data-act": "adopt-bg" })}`;
  }
  function adoptDialog() {
    const a = P.adopt;
    const title = a.phase === "review" ? L("采用第 3 版？", "Adopt version 3?") : a.phase === "failed" ? L("有一步没成，首页还没换", "One step failed; the home hasn’t changed") : L("正在采用第 3 版", "Adopting version 3");
    const sub = a.phase === "review" ? L("采用后这个项目的首页换成第 3 版，可以撤销。", "The project home becomes version 3. You can undo it.") : a.phase === "failed" ? L("第 3 版已经存好。重试只做没成的这一步，已做的不会重复；也可以不要这个许可，先采用其余部分。", "Version 3 is saved. Retrying redoes only this step, never the finished ones; or adopt the rest without this permission.") : L("关掉这个窗口也会做完。", "It finishes even if you close this.");
    return `<dialog class="mw-dialog mw-dialog--form gp-dialog" aria-labelledby="adopt-title" data-slot="dialog">
      <form class="mw-form" onsubmit="return false"><header class="mw-form__header"><h2 id="adopt-title">${esc(title)}</h2><p>${esc(sub)}</p></header>
      <div class="mw-form__body">${a.phase === "review" ? adoptReview() : adoptProgress()}</div>
      <footer class="mw-form__footer">${adoptFooter()}</footer></form></dialog>`;
  }

  // ---------- basic home (the 15 choice, shortened) ----------
  function basicHome(other) {
    const plug = D.plugins.map((p) => `<article class="mw-card gp-plug"><header class="mw-card__header"><span class="gp-plug__mark">${ic(p.icon)}</span><h3 class="mw-card__title">${esc(T(p.name))}</h3></header><p class="mw-card__description">${other ? L("还没有内容", "Nothing here yet") : esc(T(p.line))}</p><footer class="mw-card__footer">${btn("secondary", L("打开", "Open"), { "data-act": "noop" })}</footer></article>`).join("");
    const waiting = other ? "" : `<section class="gp-wait"><h2>${L("等你 2", "Waiting for you · 2")}</h2><ul>
      <li>${mark("attention", "waiting", L("要你看", "Review"))}<span>${L("#412 写升级说明", "#412 Write the upgrade notes")}</span>${btn("primary", L("去看", "Review"), { "data-act": "noop" })}</li>
      <li>${mark("attention", "waiting", L("要回复", "Reply"))}<span>${L("王小姐问发布时间", "Ms Wang asks about the release date")}</span>${btn("secondary", L("回复", "Reply"), { "data-act": "noop" })}</li></ul></section>`;
    return `<div class="gp-base"><p class="gp-muted gp-base__note">${L("基础首页：只显示各插件已有的内容，不用模型。", "Basic home: each plugin’s own content, no model.")}</p>${waiting}<div class="gp-plugs">${plug}</div></div>`;
  }

  // ---------- the home area, per plan ----------
  function homeArea() {
    if (P.project === "other") return `${`<header class="gp-head"><div class="gp-head__title"><h1>${L("首页", "Home")}</h1></div></header>`}${basicHome(true)}`;
    if (S.plan === "C" && P.guide) return guide();
    const d = P.draft;
    const drafting = d && d.ready && (S.stage === "draft" || S.stage === "adopt");
    if (S.plan === "A" && drafting) return planADraft();
    if (S.plan === "B" && drafting) return planBDraft();
    return liveHome();
  }

  function liveHome() {
    let fall = "";
    if (P.fellBack === "v3" && P.inUse === "v2") fall = alertBox("warning", L("第 3 版没打开，先用第 2 版", "Version 3 didn’t load, so version 2 is shown"), L("它在隔离里出错停下了，没影响别的。第 3 版和你改过的地方都还在。", "It failed inside its sandbox and affected nothing else. Version 3 and your edits are kept."), btn("secondary", L("再试一次", "Try again"), { "data-act": "retry-load" }, { icon: "refresh" }) + btn("ghost", L("交给助理看看", "Ask the assistant to look"), { "data-act": "fix-load" }, { icon: "sparkles" }));
    if (P.fellBack === "all" && P.inUse === "base") fall = alertBox("warning", L("生成的页面都没打开，先用基础首页", "No generated page loaded, so the basic home is shown"), L("第 3 版和第 2 版都在隔离里出错停下了。页面和你改过的地方都在，打开的标签也都在。", "Versions 3 and 2 both failed inside their sandbox. The pages, your edits and your open tabs are all kept."), btn("secondary", L("再试一次", "Try again"), { "data-act": "retry-load" }, { icon: "refresh" }) + btn("ghost", L("交给助理看看", "Ask the assistant to look"), { "data-act": "fix-load" }, { icon: "sparkles" }));
    if (P.inUse === "base" && P.byChoice) fall = `<p class="gp-hint">${ic("info")}<span>${L("「发布检查台」已保存，随时可以换回来。", "Release check board is saved; switch back any time.")}</span>${btn("link", L("换回发布检查台", "Back to Release check board"), { "data-act": "restore", "data-v": P.byChoice })}</p>`;
    const body = P.inUse === "base" ? basicHome(false) : generatedPage(P.inUse, {});
    return `${pageHeader()}${composer()}${genLine()}${fall}${body}`;
  }

  // A — the draft takes the home area; one bar on top says it is a draft and holds every decision.
  function planADraft() {
    if (P.showNow) return `<div class="gp-nowbar">${K.renderBarStatus({ glyph: "eye", title: L("你在看现在的首页（第 2 版）", "You are looking at the home in use (version 2)"), caption: L("草稿还在", "The draft is kept") })}${btn("primary", L("回到草稿", "Back to the draft"), { "data-act": "show-now" })}</div>${generatedPage("v2", {})}`;
    const bar = `<div class="gp-draftbar">
      <div class="gp-draftbar__id">${badge("info", L("草稿", "Draft"))}<strong>${esc(T(D.page))} · ${L("第 3 版", "Version 3")}</strong><span class="gp-muted">${esc(T(ver("v3").when))}</span></div>
      <div class="gp-draftbar__acts">${dataToggle()}<span class="gp-checks-btn">${`<button type="button" class="gp-checkmark" data-act="checks" aria-expanded="${P.checksOpen}" ${isNew("检查摘要", "Check summary")}>${checkMark()}${ic("chevron-down")}</button>`}${P.checksOpen ? K.renderPopover({ className: "gp-checkpop", preview: true, body: checksList() }) : ""}</span>
      ${btn("ghost", L("看现在的", "See the current one"), { "data-act": "show-now" })}${btn("ghost", L("放弃", "Discard"), { "data-act": "discard" })}${adoptBtn()}</div></div>`;
    return `${bar}<div class="gp-draftbody">${changeChips()}${issues()}${reviseLine()}${generatedPage("v3", { draft: true })}</div>${P.dialog === "adopt" ? adoptDialog() : ""}`;
  }
  const reviseLine = () => `<div class="gp-revise"><input class="mw-input" type="text" placeholder="${L("还想怎么改？比如：卡住的标红", "Anything else? e.g. highlight stuck items")}" aria-label="${L("还想怎么改", "Anything else to change")}">${btn("secondary", L("再改改", "Revise"), { "data-act": "revise" }, { icon: "sparkles" })}</div>`;

  // B — the page in use and the draft side by side; narrow windows switch between them.
  function planBDraft() {
    const now = `<section class="gp-col" data-col="now" aria-label="${L("现在", "In use")}"><header class="gp-col__head">${badge("success", L("在用", "In use"))}<strong>${L("现在 · 第 2 版", "In use · version 2")}</strong></header>${generatedPage("v2", { compact: true })}</section>`;
    const draft = `<section class="gp-col gp-col--draft" data-col="draft" aria-label="${L("草稿", "Draft")}"><header class="gp-col__head">${badge("info", L("草稿", "Draft"))}<strong>${L("第 3 版", "Version 3")}</strong>${dataToggle()}</header>${changeChips()}${issues()}${generatedPage("v3", { draft: true, compact: true })}${reviseLine()}</section>`;
    const sw = `<div class="gp-split-switch">${toggles(L("看哪一边", "Which side"), [["now", L("现在", "In use"), P.view === "now"], ["draft", L("草稿", "Draft"), P.view === "draft"]], "view")}</div>`;
    const bar = `<div class="gp-adoptbar" ${isNew("对照采用条", "Compare bar")}><span class="gp-checks-btn"><button type="button" class="gp-checkmark" data-act="checks" aria-expanded="${P.checksOpen}" ${isNew("检查摘要", "Check summary")}>${checkMark()}${ic("chevron-up")}</button>${P.checksOpen ? K.renderPopover({ className: "gp-checkpop gp-checkpop--up", preview: true, body: checksList() }) : ""}</span><span class="gp-spacer"></span>${btn("ghost", L("放弃草稿", "Discard draft"), { "data-act": "discard" })}${adoptBtn()}</div>`;
    return `<header class="gp-head"><div class="gp-head__title"><h1>${esc(T(D.page))}</h1><span class="gp-muted">${L("第 3 版草稿和现在对照", "Version 3 draft beside the one in use")}</span></div></header>${sw}<div class="gp-split" data-view="${P.view}">${now}${draft}</div>${bar}${P.dialog === "adopt" ? adoptDialog() : ""}`;
  }

  // C — the 04 guided frame over the home: one thing per step, ↵ moves on; leaving keeps the draft.
  function guide() {
    const names = [L("说想要的", "Describe"), L("看草稿", "Draft"), L("核对", "Check"), L("采用", "Adopt")];
    const step = Math.max(1, P.cStep);
    let body = "", primary = "";
    if (step === 1) {
      const gen = P.draft && P.draft.gen;
      body = `<h2 class="gp-guide__q">${L("这个页面要怎么改？", "How should this page change?")}</h2><p class="gp-muted">${L("助理做一版草稿；采用之前，现在的首页不会变。", "The assistant makes a draft; the home in use stays as it is until you adopt.")}</p>
        <textarea class="mw-textarea gp-guide__ask" rows="3" aria-label="${L("要怎么改", "How to change it")}"${gen ? " disabled" : ""}>${esc(T(D.ask))}</textarea>
        ${gen ? K.renderBarStatus({ spin: true, title: L("助理在做第 3 版草稿", "The assistant is making a version 3 draft"), caption: L("可以先回首页，做好了底栏会亮", "You can go back to the home; the bar lights up when it is ready") }) : ""}`;
      primary = gen ? btn("ghost", L("停下", "Stop"), { "data-act": "stop-gen" }) : btn("primary", L("交给助理", "Hand to the assistant"), { "data-act": "generate" }, { key: "↵" });
    } else if (step === 2) {
      body = `<div class="gp-guide__row"><h2 class="gp-guide__q">${L("第 3 版草稿", "Version 3 draft")}</h2>${dataToggle()}</div>${changeChips()}${issues()}${reviseLine()}<div class="gp-guide__preview">${generatedPage("v3", { draft: true })}</div>`;
      primary = btn("primary", L("下一步：核对", "Next: check"), { "data-act": "c-next", ...(blocker() ? { title: L("先处理上面的问题", "Deal with the issue above first") } : {}) }, { key: "↵", disabled: !!blocker() });
    } else if (step === 3) {
      const a = P.adopt || (P.adopt = { phase: "review", step: -1, failed: null, grant: true, retried: false });
      body = `<h2 class="gp-guide__q">${L("采用前核对", "Before you adopt")}</h2><div class="gp-guide__cols"><section><h3>${L("检查", "Checks")}</h3>${checksList()}</section><section><h3>${L("会改什么", "What changes")}</h3>${adoptReview()}</section></div>`;
      primary = btn("primary", a.grant || P.draft.dropPR || F("depoff") ? L("采用", "Adopt") : L("先采用其余部分", "Adopt the rest"), { "data-act": "c-adopt" }, { key: "↵" });
    } else {
      const a = P.adopt;
      const done = a.phase === "done";
      body = `<div class="gp-guide__done"><h2 class="gp-guide__q">${done ? L("已换成第 3 版", "Now on version 3") : a.phase === "failed" ? L("有一步没成，首页还没换", "One step failed; the home hasn’t changed") : L("正在采用", "Adopting")}</h2>${adoptProgress()}${done ? `<p class="gp-hint">${ic("undo")}<span>${L("回到首页后还能撤销。", "You can still undo this from the home.")}</span></p>` : ""}</div>`;
      primary = done ? btn("primary", L("回首页", "Go to the home"), { "data-act": "c-home" }, { key: "↵" }) : a.phase === "failed" ? `${btn("ghost", L("退回已做的", "Undo what was done"), { "data-act": "adopt-rollback" })}${btn("secondary", L("先采用其余部分", "Adopt the rest"), { "data-act": "adopt-skip" })}${btn("primary", L("只重试这一步", "Retry this step"), { "data-act": "adopt-retry" }, { key: "↵" })}` : "";
    }
    const back = step > 1 && step < 4 ? btn("ghost", L("上一步", "Back"), { "data-act": "c-back" }) : "";
    const exit = step === 4 ? "" : btn("ghost", L("回首页", "Home"), { "data-act": "c-exit" }, { icon: "home" });
    return `<div class="gp-guide" role="region" aria-label="${L("做新版本", "Make a new version")}">
      <div class="gp-guide__body"><p class="gp-guide__kicker">${ic("sparkles")}<span>${esc(T(D.page))} · ${L("做新版本", "New version")}</span></p>${body}</div>
      <footer class="gp-guide__bar"><div class="gp-guide__exit">${exit}</div>
        <div class="gp-guide__steps">${K.renderSteps({ total: 4, current: step - 1, label: L("步骤", "Steps") })}<span><b>${step}/4</b> <em>${esc(names[step - 1])}</em></span></div>
        <div class="gp-guide__acts">${back}${primary}</div></footer></div>`;
  }

  // ---------- frame (a stand-in for the workbench) ----------
  function frame(inner) {
    const proj = P.project === "other" ? T(D.otherProject) : T(D.project);
    const guideDot = S.plan === "C" && !P.guide && P.draft && P.draft.ready ? `<span class="gp-dot" aria-label="${L("草稿好了", "Draft ready")}"></span>` : "";
    return `<div class="gp-wb">
      <header class="gp-top"><button type="button" class="gp-proj" data-act="switch-project">${ic("folder")}<span>${esc(proj)}</span>${ic("chevron-down")}</button>
        <nav class="gp-tabs" aria-label="${L("标签", "Tabs")}"><a href="#" class="gp-tab" aria-current="page" data-act="noop">${ic("home")}${L("首页", "Home")}${guideDot}</a><a href="#" class="gp-tab" data-act="noop">${ic("note")}${L("发布说明", "Release notes")}</a></nav></header>
      <main class="gp-sheet" id="sheet"><div class="gp-inner">${inner}</div></main>
      <footer class="gp-dock" aria-hidden="true"><span>${ic("sparkles")}${L("助理", "Assistant")}</span><span>${ic("grid")}${L("插件", "Plugins")}</span><span>${ic("library")}Shelf</span><span class="gp-dock__note">${L("工作台外壳是示意", "The workbench frame is a stand-in")}</span></footer>
    </div>`;
  }

  // ---------- proto strip ----------
  function strip() {
    document.documentElement.lang = S.lang === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.dataset.resolvedTheme = S.theme;
    if (S.notes) document.documentElement.setAttribute("data-show-new", ""); else document.documentElement.removeAttribute("data-show-new");
    document.getElementById("p-title").textContent = L("37-1 生成页面采用与恢复 · 原型", "37-1 Generated page adoption · prototype");
    document.getElementById("p-plan").textContent = L("方案", "Option");
    document.getElementById("p-stage").textContent = L("走到", "Step");
    document.getElementById("p-fault").textContent = L("状态", "State");
    const opts = (list, cur) => list.map((x) => `<option value="${x[0]}"${x[0] === cur ? " selected" : ""}>${esc(L(x[1], x[2]))}</option>`).join("");
    document.getElementById("plan").innerHTML = opts(D.plans, S.plan);
    document.getElementById("stage").innerHTML = opts(D.stages, S.stage);
    document.getElementById("fault").innerHTML = opts(D.faults, S.fault);
    const tg = (id, items, cur, act) => { document.getElementById(id).innerHTML = items.map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${v === cur}" data-proto="${act}" data-v="${v}">${n}</button>`).join(""); };
    tg("lang", [["zh", "中文"], ["en", "EN"]], S.lang, "lang");
    tg("theme", [["light", L("浅", "Light")], ["dark", L("深", "Dark")]], S.theme, "theme");
    tg("notes", [["on", L("标出组件板新增", "Mark board additions")], ["off", L("不标", "Hide")]], S.notes ? "on" : "off", "notes");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("重来", "Reset");
  }

  function render() {
    save();
    strip();
    const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
    document.getElementById("app").innerHTML = frame(homeArea());
    document.body.dataset.plan = S.plan;
    if (focusId) { const el = document.querySelector(`#app [data-act="${focusId}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); }
    const dlg = document.querySelector("dialog.gp-dialog");
    if (dlg && !dlg.open) {
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); act("adopt-cancel"); });
      dlg.showModal();
      const p = dlg.querySelector(".mw-btn--primary"); if (p && !p.disabled) p.focus();
    }
  }

  // ---------- actions ----------
  function act(a, el) {
    const v = el && el.dataset.v;
    const id = el && el.dataset.id;
    const st = (rid) => (P.rows[rid] = P.rows[rid] || {});
    switch (a) {
      case "compose": if (S.plan === "C") { P.guide = true; P.cStep = 1; P.draft = null; } else P.compose = true; P.menu = false; render(); if (P.compose) document.getElementById("ask").focus(); return;
      case "compose-cancel": P.compose = false; break;
      case "generate": startGen(); render(); return;
      case "stop-gen": clearTimers(); P.draft = null; if (S.plan === "C") P.guide = false; S.stage = "live"; toast(L("已停下，现在的页面没变", "Stopped; the page in use is unchanged")); break;
      case "to-draft": P.versionsOpen = false; P.draft = P.draft || { ready: true, data: "real" }; S.stage = "draft"; openDraft(); break;
      case "discard": { const kept = P.draft; P.draft = null; P.dialog = null; P.guide = false; S.stage = "live"; render(); toast(L("草稿已放弃，现在的页面没变", "Draft discarded; the page in use is unchanged"), { act: "undo-discard", label: L("撤销", "Undo") }); P.lastDraft = kept; return; }
      case "undo-discard": P.draft = P.lastDraft || { ready: true, data: "real" }; S.stage = "draft"; openDraft(); toast(L("草稿回来了", "The draft is back")); break;
      case "data": P.draft.data = v; P.rows = {}; break;
      case "show-now": P.showNow = !P.showNow; break;
      case "checks": P.checksOpen = !P.checksOpen; break;
      case "fix": P.draft.gen = true; P.draft.ready = true; render(); later(1200, () => { P.draft.fixed = true; P.draft.gen = false; toast(L("助理改好了，检查都过了", "Fixed; every check passes")); render(); }); return;
      case "drop-pr": P.draft.dropPR = true; break;
      case "pick": P.draft.conflict = v || null; break;
      case "revise": toast(L("（原型）助理按你说的再做一版草稿，现在的页面不变", "(prototype) The assistant makes another draft; the page in use stays")); return;
      case "adopt": if (blocker()) return; openAdopt(); break;
      case "grant": P.adopt.grant = el.checked; break;
      case "adopt-run": case "c-adopt": if (S.plan === "C") P.cStep = 4; runAdopt(0); return;
      case "adopt-retry": P.adopt.retried = true; runAdopt(P.adopt.failed); return;
      case "adopt-skip": P.adopt.grant = false; P.adopt.retried = true; runAdopt(P.adopt.failed + 1); return;
      case "adopt-rollback": P.adopt = null; P.dialog = null; S.stage = "draft"; if (S.plan === "C") P.cStep = 3, P.adopt = { phase: "review", step: -1, failed: null, grant: true }, S.stage = "adopt"; toast(L("已退回：第 3 版的草稿还在，首页没变", "Undone: the draft is kept and the home is unchanged")); break;
      case "adopt-cancel": case "adopt-cover": if (P.adopt && P.adopt.phase !== "review") return; P.dialog = null; P.adopt = null; S.stage = "draft"; break;
      case "adopt-bg": P.dialog = null; render(); toast(L("在后台接着采用，好了在这里说", "Adopting in the background; you’ll hear when it’s done")); return;
      case "undo-adopt": P.inUse = "v2"; S.stage = "live"; toast(L("已回到第 2 版；第 3 版留在版本里", "Back on version 2; version 3 stays in the list")); break;
      case "c-next": if (blocker()) return; P.cStep = 3; S.stage = "adopt"; break;
      case "c-back": P.cStep = Math.max(1, P.cStep - 1); if (P.cStep === 2) S.stage = "draft"; break;
      case "c-exit": P.guide = false; S.stage = "live"; if (P.draft && P.draft.ready) toast(L("草稿留着，首页标签上有个点，随时回来", "The draft is kept; the home tab shows a dot")); break;
      case "c-home": P.guide = false; P.draft = null; P.inUse = "v3"; P.hasV3 = true; S.stage = "done"; render(); toast(L("已换成第 3 版，别的窗口也换了", "Now on version 3, in every window"), { act: "undo-adopt", label: L("撤销", "Undo") }); return;
      case "view": P.view = v; break;
      case "versions": P.versionsOpen = !P.versionsOpen; P.menu = false; break;
      case "menu": P.menu = !P.menu; P.versionsOpen = false; break;
      case "restore": {
        const from = P.inUse; P.inUse = v; P.versionsOpen = false; P.menu = false; P.fellBack = null; P.byChoice = v === "base" ? from : null;
        render();
        const name = v === "base" ? L("基础首页", "the basic home") : T(ver(v).name);
        toast(L(`已换回${name}`, `Switched to ${name}`), { act: "undo-restore", label: L("撤销", "Undo") }); P.undoTo = from; return;
      }
      case "to-base": act("restore", { dataset: { v: "base" } }); return;
      case "undo-restore": P.inUse = P.undoTo; P.byChoice = null; toast(L("已撤销", "Undone")); break;
      case "retry-load": P.loadTry++; if (P.loadTry >= 1) { P.inUse = "v3"; P.fellBack = null; toast(L("第 3 版打开了", "Version 3 loaded")); } break;
      case "fix-load": toast(L("（原型）助理带着出错的记录去看，会先给一版草稿", "(prototype) The assistant looks at the error and makes a draft first")); return;
      case "enable-coding": toast(L("（原型）打开插件设置里的 Coding", "(prototype) Opens Coding in plugin settings")); return;
      case "perms": P.menu = false; render(); toast(L("（原型）打开「这个页面能做什么」：读待办、读 PR、给待办标完成，每项可以收回", "(prototype) Opens what this page may do: read to-dos, read PRs, mark to-dos done — each can be withdrawn")); return;
      case "switch-project": P.project = P.project === "other" ? "main" : "other"; render(); if (P.project === "other" && (P.draft || S.stage !== "live")) toast(L("草稿和页面都留在「发布 2.3」，这里用它自己的首页", "The draft and page stay with Release 2.3; this project uses its own home")); return;
      case "quick": P.filter.quick = v; break;
      case "who": P.filter.who = el.value; break;
      case "compare": P.filter.compare = el.checked; break;
      case "row-done": {
        const sample = P.draft && P.draft.data === "sample" && el.closest(".gp-draftbody, .gp-col--draft, .gp-guide");
        if (sample) { toast(L("示例内容，没有写入", "Sample content; nothing was saved")); return; }
        const inDraft = !!el.closest(".gp-draftbody, .gp-col--draft, .gp-guide");
        if (inDraft) { st(id).confirm = true; break; }
        if (F("actionfail") && !st(id).failedOnce) { st(id).error = true; st(id).failedOnce = true; announce(L("没标上", "Not marked")); break; }
        st(id).done = true; announce(L("已标完成", "Marked done")); break;
      }
      case "row-commit": P.rows[id] = { done: true }; announce(L("已标完成", "Marked done")); break;
      case "row-cancel": P.rows[id] = {}; break;
      case "row-undo": P.rows[id] = {}; toast(L("已撤销，待办里改回进行中", "Undone; the to-do is back in progress")); break;
      case "row-refresh": P.rows[id] = { flash: true, failedOnce: true }; render(); later(900, () => { delete P.rows[id].flash; render(); }); return;
      case "open-item": toast(L("（原型）在待办里打开这一项", "(prototype) Opens the item in To-dos")); return;
      case "noop": return;
      default: return;
    }
    render();
  }

  // 换页面的淡入: the home cross-fades when the page in use or the draft view changes, on users' clicks only
  // (View Transition with --dur-move and --ease-quint; reduced motion swaps at once).
  const FADE = new Set(["to-draft", "discard", "undo-discard", "undo-adopt", "restore", "undo-restore", "to-base", "show-now", "c-home", "c-exit", "retry-load", "view"]);
  function withFade(a, fn) {
    const calm = STILL || document.hidden || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || !FADE.has(a)) { fn(); return; }
    document.startViewTransition(fn);
  }

  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-proto]");
    if (p) {
      const k = p.dataset.proto, v = p.dataset.v;
      if (k === "lang") S.lang = v; else if (k === "theme") S.theme = v; else if (k === "notes") S.notes = v === "on";
      render(); return;
    }
    const t = e.target.closest("[data-act]");
    if (!t) {
      if (P.versionsOpen || P.menu || P.checksOpen) { if (!e.target.closest(".mw-popover, .mw-menu")) { P.versionsOpen = false; P.menu = false; P.checksOpen = false; render(); } }
      return;
    }
    if (t.tagName === "A") e.preventDefault();
    if (t.matches("select, input[type=checkbox]")) return;
    if (t.disabled) return;
    withFade(t.dataset.act, () => act(t.dataset.act, t));
  });
  document.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "plan") { S.plan = e.target.value; enter(S.stage); return; }
    if (id === "stage") { enter(e.target.value); return; }
    if (id === "fault") { S.fault = e.target.value; enter(S.stage); return; }
    const t = e.target.closest("[data-act]");
    if (t && t.matches("select, input[type=checkbox]")) act(t.dataset.act, t);
  });
  document.getElementById("reset").addEventListener("click", () => { try { localStorage.removeItem(KEY); } catch { /* none */ } S = fresh(); enter("live"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (P.versionsOpen || P.menu || P.checksOpen) { P.versionsOpen = P.menu = P.checksOpen = false; render(); return; }
      if (P.compose) { act("compose-cancel"); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea" && !(e.metaKey || e.ctrlKey)) { if (P.compose && !e.altKey) { e.preventDefault(); act("generate"); } return; }
      if (tag === "button" || tag === "select" || tag === "a" || (tag === "input" && e.target.type !== "text")) return;
      if (tag === "input") return;
      const scope = P.dialog ? document.querySelector(".gp-dialog") : document.querySelector(".gp-guide__acts, .gp-draftbar, .gp-adoptbar, .gp-confirm");
      const primary = scope && [...scope.querySelectorAll(".mw-btn--primary")].pop();
      if (primary && !primary.disabled) { e.preventDefault(); primary.click(); }
    }
  });

  window.__protoState = () => ({ S, P });
  enter(S.stage, true);
  // A reload in the middle of a flow lands on a stable step.
  if (S.stage === "gen") enter("gen", true);
  render();
})();
