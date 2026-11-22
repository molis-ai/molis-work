// The Coding frame shared by the Coding design samples (33 coding-env-recovery, 35-2 coding-daily-basics): the prototype strip,
// the Coding head, the files column (12: directory C), the conversation column, the composer, popovers grown from their trigger,
// the graphite toast, the 04 recovery frame (12: recovery A) and the "component-board additions" marker. Every control is the
// component board's own renderer from kit.js (window.mwKit); the layout layer is coding-execution-states/styles.css plus
// coding-frame/coding-proto.css. A sample calls window.codingProto({...}) with its blocks; nothing here reads a folder, runs a command
// or calls a model.
(() => {
  window.codingProto = function codingProto(cfg) {
    const K = window.mwKit;
    document.getElementById("icons").innerHTML = window.mwKitSprite;
    const D = cfg.data;
    const BLOCKS = D.blocks.map((b) => b.id);
    const fresh = () => ({
      block: BLOCKS[0], scheme: { ...D.initial, ...D.decided } /* initial: where an undecided block opens */, state: Object.fromEntries(D.blocks.map((b) => [b.id, D.states[b.id][0][0]])),
      lang: "zh", mode: "execute", draft: "", files: false, board: false, marks: false, v: {}, busy: null, ...(cfg.extra ? cfg.extra() : {}),
    });
    const transient = (s) => ({ ...s, v: {}, busy: null });
    let S = load();
    function load() {
      try {
        const v = JSON.parse(localStorage.getItem(cfg.key) || "null");
        if (v && v.scheme && v.state && BLOCKS.includes(v.block)) return Object.assign(fresh(), v, { v: {}, busy: null });
      } catch { /* storage unavailable: start fresh */ }
      return fresh();
    }
    function save() { try { localStorage.setItem(cfg.key, JSON.stringify(transient(S))); } catch { /* storage unavailable: keep in memory */ } }

    const L = (zh, en) => (S.lang === "zh" ? zh : en);
    const P = (pair) => pair[S.lang === "zh" ? 0 : 1];
    const esc = K.escapeHtml;
    const sch = () => S.scheme[S.block];
    const st = () => S.state[S.block];

    // ---------- the board's parts ----------
    const ic = (n, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
    const btn = (label, o = {}) => K.renderButton({
      label, variant: o.v || "secondary", size: o.size || "sm", icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, loading: o.loading,
      className: o.cls, attrs: { "data-act": o.act, "data-arg": o.arg, "aria-haspopup": o.menu ? "menu" : undefined, "aria-expanded": o.expanded, title: o.title },
    });
    const ring = (state, size) => K.renderStateRing({ state, size });
    const tag = (label, state, tone) => K.renderStatusMark({ label, state, tone });
    const plainTag = (label, state, tone) => K.renderStatusMark({ label, state, tone, plain: true });
    const badge = (label, tone = "neutral") => K.renderBadge({ label, tone });
    // Outcome → the shared ring family and status tone (one ring library; the caller keeps its own words).
    const OUT = {
      ok: ["done", "done"], err: ["failed", "blocked"], unk: ["verify", "attention"], cx: ["cancelled", "quiet"], warn: ["interrupted", "attention"],
      skip: ["idle", "quiet"], wait: ["waiting", "idle"], run: ["running", "progress"], hold: ["blocked", "hold"], info: ["idle", "quiet"],
    };
    // A part the component board does not have yet: outlined with its reason when "mark additions" is on (workflow §5, #1772).
    const fresh_ = (why) => ` data-new="${esc(why)}"`;

    // ---------- prototype strip ----------
    const seg = (label, items) => K.renderToggleGroup({ label, items }).replace('data-slot="toggle-group"', 'data-slot="toggle-group" data-seg-thumb');
    function proto() {
      const decided = D.decided[S.block];
      const schemes = seg(L("方案", "Scheme"), ["A", "B", "C"].filter((x) => D.schemes[S.block][x]).map((x) => ({ value: x, label: x + (decided === x ? " ✓" : ""), current: x === sch(), attrs: { "data-proto": "scheme", title: P(D.schemes[S.block][x]) } })));
      const lang = seg(L("语言", "Language"), [["zh", "中"], ["en", "EN"]].map(([v, l]) => ({ value: v, label: l, current: S.lang === v, attrs: { "data-proto": "lang" } })));
      const resolved = document.documentElement.dataset.theme || "system";
      const theme = seg(L("外观", "Theme"), [["light", L("浅", "Light")], ["dark", L("深", "Dark")], ["system", L("跟随", "Auto")]].map(([v, l]) => ({ value: v, label: l, current: resolved === v, attrs: { "data-theme-option": v } })));
      document.getElementById("proto").innerHTML = `<b>${L("原型 · 模拟数据", "Prototype · sample data")}</b>
        <label>${L("块", "Block")}<select id="p-block">${D.blocks.map((b) => `<option value="${b.id}"${b.id === S.block ? " selected" : ""}>${esc(P(b.name))}</option>`).join("")}</select></label>
        <label>${L("方案", "Scheme")}${schemes}</label><span class="sname">${esc(P(D.schemes[S.block][sch()]))}${decided === sch() ? L(" · 已定", " · decided") : ""}</span>
        <label>${L("状态", "State")}<select id="p-state">${D.states[S.block].map(([id, zh, en]) => `<option value="${id}"${id === st() ? " selected" : ""}>${esc(L(zh, en))}</option>`).join("")}</select></label>
        <label>${L("语言", "Language")}${lang}</label><label>${L("外观", "Theme")}${theme}</label>
        <label class="marks"><input type="checkbox" class="mw-check" data-proto="marks"${S.marks ? " checked" : ""}>${L("标出组件板新增", "Mark board additions")}</label>
        ${btn(L("重置", "Reset"), { act: "reset", v: "ghost" })}`;
    }

    // ---------- frame ----------
    function head(o = {}) {
      const filesBtn = btn(L("文件", "Files"), { icon: "folder-tree", act: "toggle-files", cls: "only-narrow", expanded: String(S.files) });
      const boardBtn = o.board ? btn(L("任务板", "TaskBoard"), { icon: "list-ordered", act: "toggle-board", cls: "only-board-narrow", expanded: String(S.board) }) : "";
      return `<header class="c-head"><h1>Coding</h1><span class="sub ell grow">${esc(o.title || L("首页加一个订阅表单", "Add a subscribe form to the home page"))}</span>
        <span class="facts only-wide"><span>${ic("git-branch", "sm")}${esc(o.branch || "main")}</span><span>${esc(o.changes || L("2 处改动", "2 changes"))}</span></span><span class="tools">${filesBtn}${boardBtn}</span></header>`;
    }
    function frame(p) {
      const hasBoard = !!p.board;
      const cls = ["c-body", hasBoard ? "has-board" : "", S.files ? "files-open" : "", S.board && hasBoard ? "board-open" : ""].join(" ");
      return `${head({ board: hasBoard, ...(p.head || {}) })}${p.top || ""}<div class="${cls}">${p.dir || dirCol({})}<div class="c-main"><div class="c-scroll"><div class="c-column">${p.work}</div></div>${p.composer || composer()}</div>${p.board || ""}<button class="scrim" data-act="close-drawers" aria-label="${L("关闭", "Close")}"></button></div>`;
    }
    let riseIndex = 0;
    const rise = (html) => `<div class="rise" style="--i:${Math.min(riseIndex++, 11)}">${html}</div>`;
    const you = (text, extra = "") => rise(`<div style="display:grid"><div class="you">${esc(text)}${extra}</div></div>`);
    const round = (label, extra = "") => rise(`<div class="round">${ic("history", "sm")}<span class="ell"><b>${L("本轮", "This round")}</b> · ${esc(label || L("执行", "Execute"))} · ${L("10:42 开始", "started 10:42")}${extra}</span></div>`);
    const ai = (html) => rise(`<div class="ai"><div class="who">${ic("sparkles", "sm")}Coding</div>${html}</div>`);
    const working = (text) => rise(`<div class="working">${plainTag(text, "running", "progress")}</div>`);
    const TREE = [["folder-open", "src", 0], ["folder-open", "components", 1], ["file", "SubscribeForm.tsx", 2, "A"], ["file", "Hero.tsx", 2, "M"], ["file", "app.tsx", 1], ["folder", "tests", 0], ["file", ".env.example", 0], ["file", "AGENTS.md", 0], ["file", "package.json", 0]];
    function treeRows(rows = TREE, selected = "SubscribeForm.tsx") {
      return rows.map(([icon, name, depth, mark]) => `<button type="button" class="mw-dir-row${name === selected ? " is-selected" : ""}" style="padding-left:${8 + depth * 16}px">${ic(icon, "sm")}<span class="nm">${esc(name)}</span>${mark ? `<span class="m">${mark}</span>` : "<span></span>"}</button>`).join("");
    }
    // Directory C (12): the files column opens with where Coding works.
    function dirCol(o) {
      const picker = `<div class="c-dir__label">${L("Coding 在哪里做", "Where Coding works")}</div><button type="button" class="picker" data-act="toast" data-arg="${esc(L("工作目录选择（12 已定）", "Working folder picker (decided in 12)"))}">${ic("folder-tree", "sm")}<span class="nm">${esc(o.folder || "website")}</span>${badge(L("工作目录", "Working folder"), "info")}${ic("chevron-down", "sm")}</button>`;
      return `<aside class="c-dir" aria-label="${L("文件", "Files")}"><div class="c-dir__head">${o.head ?? picker}${o.note || ""}</div><div class="c-dir__list">${o.list ?? treeRows(o.rows, o.selected)}</div>${o.foot ? `<div class="c-dir__foot">${o.foot}</div>` : ""}</aside>`;
    }

    // The composer (12): mode, rules, model, send. `attach` adds the attachment button, `tray` what is attached, `slash` the menu.
    function composer(o = {}) {
      const mode = btn(L("执行", "Execute"), { icon: "edit", act: "toast", arg: L("模式菜单（12 已定）", "Mode menu (decided in 12)"), menu: true });
      const rules = btn(L("规则 2", "Rules 2"), { icon: "book", v: "ghost", act: "toast", arg: L("规则菜单（12 已定）", "Rules menu (decided in 12)"), menu: true });
      const send = btn(L("发送", "Send"), { v: "primary", icon: "send", iconOnly: true, size: "md", act: o.sendAct || "send", cls: "send", disabled: o.sendDisabled, title: o.sendNote });
      return `<div class="c-compose"><div class="c-compose__in">${o.above || ""}
        <div class="box${o.boxCls ? " " + o.boxCls : ""}"${o.boxAttrs || ""}>${o.tray || ""}<textarea id="draft" rows="2" aria-label="${L("消息", "Message")}" placeholder="${esc(o.placeholder || L("告诉 Coding 要做什么", "Tell Coding what to do"))}">${esc(S.draft)}</textarea>
        <div class="box__foot">${o.leading || ""}${mode}${rules}<span class="cap only-wide">${esc(o.model || "MiniMax-M3")}</span>${o.footExtra || ""}<span class="grow"></span>${o.sendNote ? `<span class="cap ell">${esc(o.sendNote)}</span>` : ""}${send}</div></div>${o.below || ""}</div></div>`;
    }

    // The 04 recovery frame, as 12 decided it (recovery A): what happened, why and what to do, what is kept, primary/secondary,
    // "carry on", and the folded technical details. tone: err | wait | info | ok.
    function recover(rec, o = {}) {
      if (!rec) return "";
      const icon = { err: "circle-alert", wait: "circle-alert", info: "info", ok: "check" }[rec.tone];
      const acts = (rec.acts || []).map(([v, act, label, arg, menu]) => btn(label, { v, act, arg, menu, loading: S.busy === act })).join("");
      const carry = rec.carry === false || rec.tone === "ok" || rec.tone === "info" ? "" : btn(L("先往下走", "Carry on"), { v: "ghost", act: "toast", arg: L("先往下走；这一条留在待处理里", "Carrying on; this stays in to-do") });
      const kept = rec.kept && rec.kept.length ? `<div class="kept">${rec.kept.map((k) => `<span>${ic("check", "xs")}${esc(k)}</span>`).join("")}</div>` : "";
      const tech = rec.tech ? `<details class="tech"><summary>${ic("chevron-right", "xs")}${L("技术细节", "Details")}</summary><code>${esc(rec.tech)}</code></details>` : "";
      const inner = `<div class="recover__title">${ic(icon, "sm")}${esc(rec.title)}</div>${rec.body ? `<p>${esc(rec.body)}</p>` : ""}${rec.extra || ""}${kept}${acts || carry ? `<div class="acts">${acts}${carry}</div>` : ""}${tech}`;
      return `<div class="recover tone-${rec.tone}${o.cls ? " " + o.cls : ""}" role="${rec.tone === "info" || rec.tone === "ok" ? "status" : "alert"}"${rec.landed ? " data-craft-new" : ""}${fresh_(L("恢复块：04 失败框架，12 已定为恢复 A", "Recovery block: the 04 failure frame, decided as recovery A in 12"))}>${inner}</div>`;
    }
    // A one-line notice above the composer (12's hint).
    const hint = (tone, lead, text, acts = "") => `<div class="hint tone-${tone}" role="status">${lead}<span class="grow">${text}</span>${acts ? `<span class="acts">${acts}</span>` : ""}</div>`;
    // The round's process (VUX-13): a quiet line per run of steps that opens to each step.
    const fold = (summary, body, o = {}) => `<details class="pf-group"${o.open ? " open" : ""}${o.state ? ` data-state="${o.state}"` : ""}><summary>${summary}</summary><div class="pf-group__body">${body}</div></details>`;
    const foldStep = (summary, body) => body ? `<details class="pf-step"><summary>${summary}</summary><div class="pf-step__body">${body}</div></details>` : `<div class="pf-line">${summary}</div>`;

    // ---------- popovers: the shared mw-menu, grown from its trigger ----------
    let pop = null;
    function closePop(restore = true) { if (!pop) return; const back = pop.back; pop.el.remove(); pop = null; if (restore && back && document.contains(back)) back.focus(); }
    function openPop(anchor, inner, cls = "") {
      closePop(false);
      const el = document.createElement("div"); el.className = "pop";
      el.innerHTML = `<div class="mw-menu ${cls}" role="menu">${inner}</div>`; document.body.appendChild(el);
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      let top = r.bottom + 6, up = false;
      if (top + h > innerHeight - 8) { top = Math.max(56, r.top - h - 6); up = true; }
      const left = Math.min(Math.max(8, r.right - w > 8 && r.left + w > innerWidth - 8 ? r.right - w : r.left), innerWidth - w - 8);
      if (up) el.firstElementChild.classList.add("is-up");
      el.style.left = left + "px"; el.style.top = top + "px";
      pop = { el, back: anchor };
      (el.querySelector("button:not([disabled])") || el).focus();
    }
    const item = (o) => `<button type="button" class="mw-menu__item" role="${o.role || "menuitem"}"${o.checked !== undefined ? ` aria-checked="${o.checked}"` : ""}${o.disabled ? " disabled" : ""} data-act="${o.act || "close-pop"}"${o.arg ? ` data-arg="${esc(o.arg)}"` : ""}>${o.lead || (o.icon ? K.icon(o.icon) : "")}<span class="grow">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>${o.badge || ""}${o.kbd ? `<kbd class="mw-kbd">${esc(o.kbd)}</kbd>` : ""}${o.checked ? K.icon("check") : ""}</button>`;
    const group = (label, items) => `<div class="mw-menu__group" role="group">${label ? `<div class="mw-menu__label">${esc(label)}</div>` : ""}${items}</div>`;

    // ---------- toast: the graphite capsule ----------
    let toastTimer;
    function toast(msg, state, undo) {
      const slot = document.getElementById("toast"); clearTimeout(toastTimer);
      const mark = state ? K.renderStateRing({ state: state === "failed" ? "failed" : "done" }) : "";
      slot.innerHTML = `<div class="mw-toast${state === "failed" ? " is-error" : ""}" role="status"${state ? ` data-mw-state="${state}" data-ring-mounted` : ""}>${mark}<span>${esc(msg)}</span>${undo ? `<button type="button" class="mw-toast__action mw-toast__action--primary" data-act="${undo}">${L("撤销", "Undo")}</button>` : ""}</div>`;
      toastTimer = setTimeout(() => { slot.innerHTML = ""; }, 4000);
    }

    // ---------- render ----------
    let lastView = "";
    const ctx = {
      K, D, get S() { return S; }, L, P, esc, sch, st, ic, btn, ring, tag, plainTag, badge, OUT, fresh: fresh_, rise, you, round, ai, working,
      treeRows, dirCol, frame, composer, recover, hint, fold, foldStep, openPop, closePop, item, group, toast, render: () => render(), after: (ms, f) => setTimeout(f, ms),
      // A button's busy moment: it keeps its width and shows the board's spinner, then the result lands with one wash.
      busy(act, ms, done) { if (S.busy) return; closePop(false); S.busy = act; render(); setTimeout(() => { S.busy = null; done(); render(); }, ms); },
    };
    let scrollKeep = 0;
    function render() {
      closePop(false);
      const prev = document.querySelector("#app .c-scroll"); scrollKeep = prev ? prev.scrollTop : 0;
      document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
      document.documentElement.classList.toggle("show-new", !!S.marks);
      proto();
      riseIndex = 0;
      const view = `${S.block}/${sch()}/${st()}`;
      const app = document.getElementById("app");
      app.innerHTML = cfg.blocks[S.block](ctx);
      app.classList.toggle("is-arriving", view !== lastView);
      // A conversation opens at its latest turn; a re-render of the same view keeps the reader's place.
      const sc = app.querySelector(".c-scroll");
      if (sc) { if (view !== lastView) sc.scrollTop = sc.scrollHeight; else sc.scrollTop = scrollKeep; }
      lastView = view;
      if (cfg.after) cfg.after(ctx);
      save();
    }
    function applyDefaults() { S.v = {}; S.busy = null; S.draft = ""; if (cfg.defaults) cfg.defaults(ctx); }

    // ---------- events ----------
    document.addEventListener("change", (e) => {
      if (e.target.id === "p-block") { S.block = e.target.value; S.files = S.board = false; applyDefaults(); render(); }
      if (e.target.id === "p-state") { S.state[S.block] = e.target.value; applyDefaults(); render(); }
      if (e.target.dataset && e.target.dataset.proto === "marks") { S.marks = e.target.checked; render(); }
    });
    document.addEventListener("input", (e) => { if (e.target.id === "draft") { S.draft = e.target.value; save(); if (cfg.onDraft) cfg.onDraft(ctx, e.target); } });
    const ACT = {
      toast: (el) => toast(el.dataset.arg || ""),
      "toast-done": (el) => toast(el.dataset.arg || "", "done"),
      "close-pop": () => closePop(),
      reset: () => { try { localStorage.removeItem(cfg.key); } catch { /* ignore */ } S = fresh(); lastView = ""; applyDefaults(); render(); },
      "toggle-files": () => { S.files = !S.files; S.board = false; render(); },
      "toggle-board": () => { S.board = !S.board; S.files = false; render(); },
      "close-drawers": () => { S.files = S.board = false; render(); },
      send: () => toast(L("已发出（模拟）", "Sent (sample)"), "done"),
      ...cfg.acts(ctx),
    };
    document.addEventListener("click", (e) => {
      const p = e.target.closest("[data-proto]");
      if (p && p.dataset.proto !== "marks") {
        if (p.dataset.proto === "scheme") { S.scheme[S.block] = p.getAttribute("value"); S.v = {}; render(); }
        if (p.dataset.proto === "lang") { S.lang = p.getAttribute("value"); render(); }
        return;
      }
      if (e.target.closest("[data-theme-option]")) { setTimeout(proto, 0); return; }
      const el = e.target.closest("[data-act]");
      if (pop && !e.target.closest(".pop") && !(el && el === pop.back)) closePop(false);
      if (!el || el.disabled) return;
      const f = ACT[el.dataset.act];
      if (f) { e.preventDefault(); f(el, e); }
    });
    document.addEventListener("keydown", (e) => {
      if (cfg.onKey && cfg.onKey(ctx, e)) return;
      if (e.key !== "Escape") return;
      if (pop) { closePop(); return; }
      if (S.files || S.board) { S.files = S.board = false; render(); }
    });

    applyDefaults();
    render();
    // The visual foundation client: theme and skin choices, press give, segmented thumb travel, the running ring.
    const client = document.createElement("script"); client.textContent = window.mwKitClient; document.body.appendChild(client);
    return ctx;
  };
})();
