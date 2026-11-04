// 13 · service & model connections — clickable review prototype. Sample data only: no sign-in, no key is stored,
// no model is called, no Home is touched. Timers stand in for the browser sign-in and the checks.
//
// Built on the component board (/__ui/catalog) and the real 服务连接 settings page: every control is a board control
// (mw-btn, mw-field, mw-alert, mw-status + state ring, mw-badge, mw-toggle-group, mw-radio-group, mw-choice, mw-card,
// mw-collapsible, mw-steps, mw-dialog, mw-sheet, mw-toast, mw-dir-row) or a class of the real page (settings-shell,
// settings-navigation, settings-connection-row, settings-connector-card, settings-state, settings-connector-steps,
// settings-connector-copy, settings-connector-capabilities, settings-setting-row). Their styles come from board.css,
// a snapshot of the product stylesheet. The few new parts carry data-board-new="…" and are listed in README.md
// 「组件板新增」; their styles are in conn.css.
(() => {
  const D = window.protoData;
  const B = window.MWBoard;
  const KEY = "molis-proto.service-connections.v2";
  const WAIT = 8; // the prototype shortens “about a minute” to 8 seconds
  document.getElementById("icons").innerHTML = B.sprite;

  const fresh = () => ({ block: "direct", plan: { direct: "A", advanced: "A", return: "A" }, fault: "none", origin: "assistant", lang: "zh", theme: "light", notes: true });
  let S = load() || fresh();
  let F = {}; // per-service flow state, not persisted
  let R = {}; // return-block state
  let A = {}; // advanced-block state
  let timers = [], ticker = null, focusAfter = null;

  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 2 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, s: S })); } catch { /* preview without storage */ } }
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (p) => (p ? p[S.lang === "zh" ? 0 : 1] : "");
  const svc = (id) => D.services.find((s) => s.id === id);
  const later = (ms, fn) => { timers.push(setTimeout(() => { fn(); render(); }, ms)); };
  function clearTimers() { timers.forEach(clearTimeout); timers = []; if (ticker) { clearInterval(ticker); ticker = null; } }
  function countdown(onEnd) {
    if (ticker) clearInterval(ticker);
    S._left = WAIT;
    ticker = setInterval(() => { S._left -= 1; if (S._left <= 0) { clearInterval(ticker); ticker = null; onEnd(); } render(); }, 1000);
  }
  function announce(m) { document.getElementById("live").textContent = m; }

  // ---------- board parts (same markup as the plugin-sdk renderers) ----------
  const ic = (n) => `<svg aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const ring = (state) => B.rings[state] || B.rings.idle;
  const status = (tone, state, label, plain = false) => `<span class="mw-status mw-status--${tone}${plain ? " mw-status--plain" : ""}" data-slot="status">${ring(state)}<span>${label}</span></span>`;
  const btn = (variant, label, attrs = "", o = {}) => `<button type="button" class="mw-btn mw-btn--${variant} mw-btn--${o.size || "sm"}${o.iconOnly ? " mw-btn--icon-only" : ""}${o.cls ? " " + o.cls : ""}" data-slot="button" ${attrs}${o.iconOnly ? ` aria-label="${label}"` : ""}>${o.icon ? ic(o.icon) : ""}${o.iconOnly ? `<span class="mw-sr-only">${label}</span>` : `<span data-slot="button-label">${label}</span>`}${o.key ? `<kbd class="mw-btn__key" aria-hidden="true">${o.key}</kbd>` : ""}</button>`;
  const primary = (label, act, extra = "") => btn("primary", label, `data-act="${act}" data-primary ${extra}`, { key: "↵" });
  const alert = (tone, title, body = "", extra = "") => `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${extra}</div>`;
  const badge = (tone, label) => `<span class="mw-badge mw-badge--${tone}" data-slot="badge">${label}</span>`;
  const stateTag = (tone, label, mw) => `<span class="settings-state settings-state--${tone}" data-mw-state="${mw}">${label}</span>`;
  const num = (n) => `<span class="mw-num" data-num-ghost="00">${String(Math.max(n || 0, 0)).padStart(2, "0")}</span>`;
  const left = () => num(S._left);
  const field = (o) => `<label class="mw-field" data-slot="field"><span class="mw-field__label">${o.label}</span><input class="mw-input" data-slot="input" id="${o.id}" type="${o.type || "text"}" autocomplete="off" value="${o.value || ""}" placeholder="${o.placeholder || ""}"${o.error ? ' aria-invalid="true"' : ""}${o.dirty ? " data-dirty" : ""}>${o.error ? `<p class="mw-field__error" role="alert">${o.error}</p>` : o.hint ? `<small class="mw-field__hint">${o.hint}</small>` : ""}</label>`;
  const toggles = (label, items, act) => `<div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${label}">${items.map(([v, n, cur]) => `<button type="button" class="mw-toggle${cur ? " is-current" : ""}" aria-pressed="${cur ? "true" : "false"}" data-act="${act}" data-v="${v}">${n}</button>`).join("")}</div>`;
  const radios = (name, legend, items, act) => `<fieldset class="mw-radio-group" data-slot="radio-group" role="radiogroup"><legend>${legend}</legend>${items.map(([v, title, note, on]) => `<label class="mw-check-row"><input class="mw-radio" data-slot="radio" type="radio" name="${name}" value="${v}" data-act="${act}" data-v="${v}"${on ? " checked" : ""}><span><strong>${title}</strong><small class="mw-field__hint">${note}</small></span></label>`).join("")}</fieldset>`;
  const choice = (label, on, attrs, icon = "") => `<button type="button" class="mw-choice" data-slot="choice" aria-pressed="${on ? "true" : "false"}" ${attrs}><span class="mw-choice__label">${icon ? ic(icon) : ""}${label}</span><span class="mw-choice__check" aria-hidden="true">${ic("check")}</span></button>`;
  const steps = (count, at, failAt, label) => `<ol class="mw-steps" data-slot="steps" aria-label="${label}">${Array.from({ length: count }, (_, i) => `<li${i < at && i !== failAt ? ' class="is-done"' : ""}${i === at ? ' aria-current="step"' : ""}><span></span></li>`).join("")}</ol>`;
  const card = (head, panel, foot = "", extra = "") => `<article class="mw-card" data-slot="card" ${extra}>${head ? `<header class="mw-card__header">${head}</header>` : ""}${panel ? `<div class="mw-card__panel">${panel}</div>` : ""}${foot ? `<footer class="mw-card__footer">${foot}</footer>` : ""}</article>`;
  const settingRow = (title, desc, value) => `<section class="settings-setting-row"><div class="setting-copy"><strong>${title}</strong><span>${desc}</span></div><div class="setting-value">${value}</div></section>`;
  const feedback = (inner) => `<div class="settings-connector-feedback" role="status" aria-live="polite">${inner}</div>`;
  const collapsible = (summary, body, open = false, attrs = "") => `<details class="mw-collapsible" data-slot="collapsible"${open ? " open" : ""} ${attrs}><summary>${summary}</summary><div class="mw-collapsible__body">${body}</div></details>`;
  const NEW_EN = { "就地展开的服务行": "Row that expands in place", "步骤进度说明": "Step caption", "连接页的列表＋详情分栏": "List + detail split", "原处的连接卡": "In-place connect card", "示意外框": "Context frame" };
  const isNew = (name) => `data-board-new="${S.lang === "zh" ? name : NEW_EN[name]}"`;
  function mark(s) {
    const svg = B.marks[s.id];
    if (svg) return `<span class="settings-connector-mark" data-connector-mark="${s.id}" data-on="light" aria-hidden="true"><img src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="" width="24" height="24"></span>`;
    return `<span class="settings-connector-mark" data-connector-mark="${s.id === "image" ? "image-api" : "model-api"}" data-on="light" aria-hidden="true">${ic(s.icon || "sparkles")}</span>`;
  }
  function toast(m, tone = "") {
    document.querySelectorAll(".mw-toast").forEach((x) => x.remove());
    const el = document.createElement("div");
    el.className = "mw-toast is-open";
    el.setAttribute("role", "status");
    if (tone) el.dataset.mwState = tone;
    el.innerHTML = `<span>${m}</span>`;
    document.body.append(el);
    setTimeout(() => el.remove(), 3400);
  }

  // ---------- base state per service, by fault ----------
  function base(id) {
    const s = svc(id);
    if (s.way === "later") return "later";
    if (id === "notion") return "ok";
    if (id === "github") return S.fault === "expired" ? "expired" : S.fault === "switch" ? "ok" : S.block === "advanced" ? "ok" : "off";
    if (id === "minimax") return S.block === "advanced" ? "ok" : "off";
    return "off";
  }
  const st = (id) => (F[id] && F[id].phase) || base(id);
  const acct = (id) => (F[id] && F[id].acct) || (id === "github" ? "yijunw0212" : id === "minimax" ? "••••7f3a" : id === "notion" ? L("Yijun 的工作区", "Yijun’s workspace") : id === "image" ? "••••c21d" : "yijun");
  function setF(id, patch) { F[id] = { ...(F[id] || {}), ...patch }; }

  // The row's state: a settings-state tag (the real page's), or a running status with the board's ring.
  function chip(id) {
    const p = st(id);
    if (["login", "checking", "form", "switchask"].includes(p)) return status("progress", "running", { login: L("连接中", "Connecting"), checking: L("检查中", "Checking"), form: L("填写中", "Filling in"), switchask: L("换账号", "Switching") }[p], true);
    const m = {
      off: ["neutral", L("未连接", "Not connected"), "disconnected"], later: ["neutral", L("还不能一键连接", "Not one-click yet"), "unavailable"],
      ok: ["success", L(`已连接 · ${acct(id)}`, `Connected · ${acct(id)}`), "connected"], done: ["success", L(`已连接 · ${acct(id)}`, `Connected · ${acct(id)}`), "connected"],
      expired: ["warning", L("需重新授权", "Sign in again"), "reauth"], limited: ["warning", L("暂时限流", "Rate limited"), "retrying"],
      rejected: ["danger", L("密钥被拒", "Key refused"), "failed"], cancelled: ["neutral", L("没连上", "Not connected"), "cancelled"],
    }[p] || ["neutral", p, "idle"];
    return stateTag(m[0], m[1], m[2]);
  }

  // ---------- connection flow (shared by every plan) ----------
  function stepsBar(id) {
    const s = svc(id), p = st(id);
    const names = s.way === "key" ? [L("填密钥", "Key"), L("检查", "Check"), L("能用了", "Ready")] : [L("在浏览器登录", "Sign in"), L("看能做什么", "Check"), L("能用了", "Ready")];
    const at = { login: 0, form: 0, switchask: 0, cancelled: 0, rejected: 0, checking: 1, limited: 1, done: 2 }[p];
    if (at === undefined) return "";
    const failAt = p === "cancelled" || p === "rejected" ? at : -1;
    const shown = p === "done" ? 3 : at;
    return `<div class="proto-steps" ${isNew("步骤进度说明")}>${steps(3, shown, failAt, L("进度", "Progress"))}<span>${L(`第 ${Math.min(at + 1, 3)} 步，共 3 步：${names[at]}`, `Step ${Math.min(at + 1, 3)} of 3: ${names[at]}`)}</span></div>`;
  }
  function canList(s, withNot = true) {
    const rows = (s.can || []).map((c) => `<li data-fulfillment="live"><span>${L("能", "Can")}</span>${T(c)}</li>`);
    if (withNot && s.not) rows.push(`<li data-fulfillment="not"><span>${L("没申请", "Not asked")}</span>${T(s.not[0])} · ${T(s.not[1])}</li>`);
    return `<ul class="settings-connector-capabilities">${rows.join("")}</ul>`;
  }
  function usesOf(id) {
    const u = D.usesOf[id];
    if (!u) return `<span class="settings-state settings-state--neutral">${L("还没有地方在用", "Nothing uses it yet")}</span>`;
    return `<span class="proto-badges">${u.map(([, n]) => badge("neutral", T(n))).join("")}</span>`;
  }
  function facts(id) {
    const s = svc(id), p = st(id), exp = p === "expired", lim = p === "limited";
    const reach = exp ? status("attention", "reauth", L("登录过期了 · 11-03 21:40 起", "Sign-in expired · since 11-03 21:40"), true)
      : lim ? status("hold", "retrying", L(`限流中 · ${S._left || 0} 秒后自动再查`, `Rate limited · checks again in ${S._left || 0}s`), true)
      : status("done", "connected", L("连得上 · 刚刚检查", "Reachable · checked just now"), true);
    const allowed = s.way === "key" ? L(`用 ${s.id === "minimax" ? "MiniMax-M3" : "wanx2.1"}，每次调用按你的账户计费`, `Uses ${s.id === "minimax" ? "MiniMax-M3" : "wanx2.1"}; each call is billed to your account`)
      : (s.can || []).map(T).join(L("、", ", ")) + (s.not ? L(`；${T(s.not[0])} 没申请`, `; ${T(s.not[0])} not asked`) : "");
    return card("", [
      settingRow(s.way === "key" ? L("密钥", "Key") : L("账号", "Account"), s.way === "key" ? L("只存在本机钥匙串，页面和助理都看不到原文", "Kept in this Mac’s Keychain; neither the page nor the assistant sees it") : L("在浏览器里登录的账号", "The account you signed in with"), `<strong>${acct(id)}</strong>`),
      settingRow(L("连得上吗", "Reachable"), L("保存后会自动检查", "Checked after saving"), reach),
      settingRow(L("允许做", "Allowed"), allowed, ""),
      settingRow(exp ? L("在等它的", "Waiting on it") : L("在用它的", "Used by"), exp ? L("Feed 的通知更新、Coding 的推送", "Feed updates, a Coding push") : L("改账号或断开会影响这些", "Switching or disconnecting affects these"), exp ? status("attention", "waiting", L("2 件工作在等", "2 pieces waiting"), true) : usesOf(id)),
    ].join(""), "", 'data-facts');
  }

  function flowView(id) {
    const s = svc(id), p = st(id), name = T(s.name);
    if (p === "later") return `<div class="settings-connector-flow"><div class="settings-connector-pending"><p>${T(s.later)}</p></div><div class="settings-connection-row__actions">${s.id === "gmail" ? btn("secondary", L("用自己的 Google 应用（高级）", "Use your own Google app (Advanced)"), 'data-act="to-advanced"') : btn("secondary", L("给管理员发一份说明", "Send your admin a note"), 'data-act="noop"')}</div></div>`;
    if (p === "off" && s.way === "browser") return `<div class="settings-connector-flow">${canList(s)}
      <ol class="settings-connector-steps"><li><strong>${L(`在浏览器登录 ${name}，点同意`, `Sign in to ${name} in your browser and agree`)}</strong><p>${L("登录完会自动回到这里，不用复制任何东西。", "You come back here by yourself; nothing to copy.")}</p></li></ol>${primary(L(`连接 ${name}`, `Connect ${name}`), "connect", `data-id="${id}"`)}</div>`;
    if ((p === "off" || p === "form" || p === "rejected") && s.way === "key") {
      const bad = p === "rejected";
      return `<div class="settings-connector-flow">${p !== "off" ? stepsBar(id) : ""}${canList(s, false)}
        ${field({ id: `key-${id}`, type: "password", label: L(`${name} 的 API 密钥`, `${name} API key`), value: bad ? "sk-cp-0d1e7f…" : "", placeholder: "sk-…", hint: `${T(s.keyWhere)}${L("。只存在本机钥匙串。", ". Kept in this Mac’s Keychain only.")}`, error: bad ? L(`${name} 拒绝了这把密钥（401）。可能过期了，或复制时少了字符。还没保存，换一把再试。`, `${name} refused this key (401). It may have expired or been copied short. Nothing was saved; try another.`) : "" })}
        <div class="settings-connection-row__actions">${primary(bad ? L("再试一次", "Try again") : L("连接", "Connect"), "submit-key", `data-id="${id}"`)}${bad ? btn("secondary", L("换个提供方", "Another provider"), 'data-act="noop"') : ""}</div></div>`;
    }
    if (p === "login") {
      const f = F[id] || {};
      const head = f.relogin ? L(`已在浏览器打开 ${name}，用 ${acct(id)} 重新登录`, `${name} is open in your browser — sign in again as ${acct(id)}`) : f.target ? L(`已在浏览器打开 ${name}，选 ${f.target} 登录`, `${name} is open in your browser — sign in as ${f.target}`) : L(`已在浏览器打开 ${name} 登录页`, `${name} sign-in is open in your browser`);
      return `<div class="settings-connector-flow">${stepsBar(id)}${feedback(`${status("progress", "running", head, true)}<p>${L("登录、点同意后会自动回到这里。关掉这个页面也没关系，回来时接着走。", "Sign in and agree; you come back here by yourself. Closing this page is fine — it picks up when you return.")}</p>`)}
        <div class="settings-connection-row__actions">${btn("secondary", L("再打开一次登录页", "Open sign-in again"), 'data-act="reopen"', { icon: "external" })}${btn("ghost", L("取消", "Cancel"), `data-act="cancel" data-id="${id}"`)}</div></div>`;
    }
    if (p === "checking") return `<div class="settings-connector-flow">${stepsBar(id)}${feedback(status("progress", "running", s.way === "key" ? L(`正在让 ${name} 回一句话…`, `Asking ${name} for a one-line reply…`) : L(`正在看 ${acct(id)} 能做什么…`, `Seeing what ${acct(id)} can do…`), true))}</div>`;
    if (p === "limited") return `<div class="settings-connector-flow">${stepsBar(id)}${alert("warning", L(`${name} 暂时限流`, `${name} is rate limiting`), s.way === "key" ? L(`密钥已经存好，但还没验证过，验证前不会拿它干活。${left()} 秒后自动再查一次。`, `The key is stored but not verified yet; nothing uses it until it is. Checking again in ${left()}s.`) : L(`已经连上了，能做什么还没查完。${left()} 秒后自动再查一次，不用你做什么。`, `You’re connected; the check isn’t finished. It runs again in ${left()}s — nothing for you to do.`))}
      <div class="settings-connection-row__actions">${btn("secondary", L("不等了，先这样", "Don’t wait"), `data-act="limit-stop" data-id="${id}"`)}</div></div>`;
    if (p === "cancelled") {
      const was = base(id) === "expired";
      return `<div class="settings-connector-flow">${stepsBar(id)}${feedback(`${status("quiet", "cancelled", L("没有连上", "Not connected"), true)}<p>${was ? L(`登录页关了，或在 ${name} 那边点了取消。原来的连接还停在「需重新授权」，在等的 2 件工作也还在等。`, `The sign-in page was closed or cancelled on ${name}. The old connection still needs signing in again, and the 2 waiting pieces of work still wait.`) : L(`登录页关了，或在 ${name} 那边点了取消。这里什么都没改。`, `The sign-in page was closed or cancelled on ${name}. Nothing changed here.`)}</p>`)}
      <div class="settings-connection-row__actions">${primary(was ? L("重新登录", "Sign in again") : L("重新连接", "Connect again"), was ? "relogin" : "connect", `data-id="${id}"`)}${btn("ghost", L("先不连", "Not now"), `data-act="reset-one" data-id="${id}"`)}</div></div>`;
    }
    if (p === "switchask") {
      const f = F[id] || {};
      return `<div class="settings-connector-flow">${radios(`how-${id}`, L(`换一个 ${name} 账号`, `Use another ${name} account`), [
          ["replace", L(`换掉 ${acct(id)}`, `Replace ${acct(id)}`), L("用到它的 3 处跟着换成新账号。正在推送的 1 件会先停下，换好后问你要不要接着做。", "The 3 places that use it switch to the new account. The push in progress pauses; you’re asked whether to carry on after."), f.how !== "add"],
          ["add", L("再加一个账号", "Add another account"), L("两个都留着。以后哪件事要分清用哪个，再问你。", "Keep both. You’re asked which one only where it matters."), f.how === "add"],
        ], "how")}
        ${settingRow(L("用到它的", "Used by"), L("换掉时这些跟着换", "These follow a replacement"), usesOf(id))}
        <div class="settings-connection-row__actions">${primary(L("去登录新账号", "Sign in to the new account"), "switch-go", `data-id="${id}"`)}${btn("ghost", L("算了", "Never mind"), `data-act="reset-one" data-id="${id}"`)}</div></div>`;
    }
    if (p === "done" && S.block === "return" && S.plan.return !== "B") {
      // Coming from somewhere else: one line of result, then back to the work — no management actions here.
      return `<div class="settings-connector-flow">${stepsBar(id)}${alert("success", S.origin === "coding" ? L("推送和开 PR 已允许", "Push and PRs allowed") : L(`${name} 能用了 · ${acct(id)}`, `${name} is ready · ${acct(id)}`))}${s.can ? canList(s, S.origin !== "coding") : ""}</div>`;
    }
    if (p === "done" || p === "ok" || p === "expired") {
      const f = F[id] || {};
      const head = p === "done" ? alert("success", f.switched ? L(`现在用 ${acct(id)}`, `Now using ${acct(id)}`) : f.relogin ? L("恢复了", "Back again") : L(`${name} 能用了`, `${name} is ready`),
        f.switched === "replace" ? L(`用到它的 3 处已跟着换过来，yijunw0212 已断开。${name} 那边给旧账号的授权，要撤销就去 ${name} 设置。`, `The 3 places now use it; yijunw0212 is disconnected. To revoke the old grant on ${name}, use ${name}’s settings.`) : f.switched === "add" ? L("两个账号都在。用到 GitHub 的地方，默认还用原来的；要分清时会问你。", "Both accounts are kept. Places keep using the old one by default and ask when it matters.") : f.relogin ? L("在等的 2 件工作已经接着做了，没有从头来。", "The 2 waiting pieces of work carried on — nothing restarted.") : L("下面是这个账号现在能做的事。", "Here is what this account can do now."),
        f.switched === "replace" ? `<div class="settings-connection-row__actions">${btn("secondary", L(`打开 ${name} 授权设置`, `Open ${name} grants`), 'data-act="noop"', { icon: "external" })}</div>` : "") : "";
      const acts = p === "expired"
        ? `${primary(L(`用 ${acct(id)} 重新登录`, `Sign in again as ${acct(id)}`), "relogin", `data-id="${id}"`)}${btn("secondary", L("换账号", "Switch account"), `data-act="switch" data-id="${id}"`)}`
        : `${btn("secondary", L("检查连接", "Check connection"), `data-act="check" data-id="${id}"`, { icon: "refresh" })}${s.way === "browser" ? btn("secondary", L("换账号", "Switch account"), `data-act="switch" data-id="${id}"`) : btn("secondary", L("换密钥", "Replace key"), 'data-act="to-advanced"')}${btn("danger-outline", L("断开", "Disconnect"), 'data-act="noop"')}`;
      return `<div class="settings-connector-flow">${p === "done" ? stepsBar(id) : ""}${head}${facts(id)}<div class="settings-connection-row__actions">${acts}</div></div>`;
    }
    return "";
  }

  // flow transitions
  function connect(id, opts = {}) {
    setF(id, { phase: "login", ...opts });
    announce(L("已打开浏览器登录页", "Sign-in opened in the browser"));
    later(1900, () => {
      if (st(id) !== "login") return;
      if (S.fault === "cancel" && !F[id].retried) { setF(id, { phase: "cancelled", retried: true }); announce(L("没有连上", "Not connected")); return; }
      check(id);
    });
  }
  function check(id) {
    const f = F[id] || {};
    setF(id, { phase: "checking" });
    later(1200, () => {
      if (st(id) !== "checking") return;
      if (S.fault === "ratelimit" && !f.limitedOnce) { setF(id, { phase: "limited", limitedOnce: true }); countdown(() => { if (st(id) === "limited") check(id); }); return; }
      if (S.fault === "keyrej" && svc(id).way === "key" && !f.rejectedOnce) { setF(id, { phase: "rejected", rejectedOnce: true }); focusAfter = `#key-${id}`; return; }
      if (f.target) setF(id, { acct: f.target, switched: f.how || "replace" });
      setF(id, { phase: "done" }); announce(L("连好了", "Connected")); onDone(id);
    });
  }
  function onDone(id) { if (S.block === "return") returnDone(id); }

  // ---------- the real settings page frame ----------
  function settingsPage(content) {
    const nav = [
      [L("本机", "This Mac")], ["sun", L("界面与语言", "Interface & language")], ["folder", L("本机目录", "Local folders")],
      [L("个人", "Personal")], ["bookmark", L("记忆", "Memory")],
      ["AI"], ["key", L("模型设置", "Models")], ["message", L("助理", "Assistant")], ["user", L("角色", "Characters")], ["text", L("提示词", "Prompts")],
      [L("工具与接入", "Tools & access")], ["terminal", L("AI 与执行工具", "AI & runtimes")], ["book", L("能力库", "Library")], ["link", L("服务连接", "Service connections"), true], ["shield", L("对外接入", "External access")], ["workflow", L("调用记录", "Call history")],
      [L("系统", "System")], ["bug", L("诊断", "Diagnostics")],
    ];
    return `<header class="project-preferences-chrome"><span>${L("全局设置", "Settings")}</span><a href="#" data-act="noop" aria-label="${L("关闭全局设置", "Close settings")}">${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置", "System settings")}"><a class="settings-nav-back" href="#" data-act="noop">${ic("arrow")} ${L("返回项目", "Back to project")}</a><div class="settings-nav-body">${nav.map((n) => n.length === 1 ? `<div class="settings-nav-group-label">${n[0]}</div>` : `<a href="#" data-act="noop"${n[2] ? ' aria-current="page"' : ""}>${ic(n[0])}${n[1]}</a>`).join("")}</div></nav>
      <div class="settings-content">${content}</div></main>`;
  }
  const heading = (extra = "") => `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("服务连接", "Service connections")}</h1></div><p>${L("连接你常用的应用和模型，把工作内容和工具带进 Molis。", "Connect the apps and models you use, and bring their work and tools into Molis.")}</p>${extra}</header>`;
  const doc = (body, head = heading()) => `<section class="settings-document" aria-labelledby="settings-title" data-connectors-settings>${head}<div class="settings-body">${body}</div></section>`;
  const search = () => `<div class="settings-connector-filters"><label class="settings-connector-field"><span>${L("搜索服务", "Find a service")}</span><input class="mw-input" type="search" placeholder="${L("搜索 GitHub、Notion、飞书…", "Search GitHub, Notion, Feishu…")}"></label></div>`;
  const row = (s, extra = "", attrs = "") => `<div class="settings-connection-row" ${attrs}>${mark(s)}<div class="settings-connection-row__identity"><strong>${T(s.name)}</strong><small>${T(s.use)}</small></div>${chip(s.id)}${extra}</div>`;
  const groupOf = (g, inner) => `<section class="settings-connector-subgroup"><h3>${T(g.name)}</h3>${inner}</section>`;

  // ---------- ① direct connect ----------
  function directA() {
    const groups = D.groups.map((g) => groupOf(g, D.services.filter((s) => s.group === g.id).map((s) => {
      const open = S._open === s.id;
      const toggle = btn("ghost", open ? L("收起", "Close") : L("展开", "Open"), `data-act="open" data-id="${s.id}" aria-expanded="${open}" aria-controls="x-${s.id}"`, { icon: open ? "chevron-up" : "chevron-down", iconOnly: true });
      return `<div class="proto-row"${open ? ` ${isNew("就地展开的服务行")} data-open="true"` : ""}>${row(s, toggle, `data-act="open" data-id="${s.id}"`)}${open ? `<div class="proto-row__body" id="x-${s.id}">${flowView(s.id)}</div>` : ""}</div>`;
    }).join(""))).join("");
    return settingsPage(doc(`<section class="settings-connector-catalog">${search()}${groups}</section>`));
  }
  function listCol() {
    return `<nav class="mw-dir" aria-label="${L("服务", "Services")}"><div class="mw-dir__body">${D.groups.map((g) => `<div class="mw-dir__heading"><span class="mw-dir__label">${T(g.name)}</span></div><div class="mw-dir__list">${D.services.filter((s) => s.group === g.id).map((s) => `<button type="button" class="mw-dir-row mw-dir-row--meta" data-slot="directory-row" data-act="sel" data-id="${s.id}"${S._sel === s.id ? ' aria-current="true"' : ""}><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${T(s.name)}</strong></span><small>${chipText(s.id)}</small></span></button>`).join("")}</div>`).join("")}</div></nav>`;
  }
  function chipText(id) { const d = document.createElement("div"); d.innerHTML = chip(id); return d.textContent; }
  function detailHead(s) {
    return `<button class="mw-btn mw-btn--ghost mw-btn--sm settings-connector-back proto-back-only" type="button" data-slot="button" data-act="unsel">${ic("back")}<span data-slot="button-label">${L("返回列表", "Back to list")}</span></button>
      <header class="settings-connector-detail__head">${mark(s)}<h2 tabindex="-1">${T(s.name)}</h2>${chip(s.id)}</header><p class="settings-connector-purpose">${T(s.use)}</p>`;
  }
  function directB() {
    const s = svc(S._sel || "github");
    return settingsPage(doc(`<div class="proto-split${S._selMobile ? " has-sel" : ""}" ${isNew("连接页的列表＋详情分栏")}>${listCol()}<section class="settings-connector-detail">${detailHead(s)}${flowView(s.id)}</section></div>`));
  }
  function directC() {
    const cards = D.groups.map((g) => groupOf(g, `<div class="settings-connectors-grid">${D.services.filter((s) => s.group === g.id).map((s) => `<button class="mw-card settings-connector-card${s.way === "later" ? " settings-connector-card--placeholder" : ""}" type="button" data-act="dlg" data-id="${s.id}">${mark(s)}<span class="settings-connector-card__body"><span class="settings-connector-card__title"><strong>${T(s.name)}</strong>${chip(s.id)}</span><span class="settings-connector-card__copy">${T(s.use)}</span></span></button>`).join("")}</div>`)).join("");
    let dlg = "";
    if (S._dlg) {
      const s = svc(S._dlg);
      dlg = `<dialog class="mw-dialog mw-dialog--form" data-modal aria-labelledby="dlg-h"><form method="dialog" class="mw-form" onsubmit="return false">
        <header class="mw-form__header"><div><h2 id="dlg-h">${st(s.id) === "off" ? L(`连接 ${T(s.name)}`, `Connect ${T(s.name)}`) : T(s.name)}</h2><p>${T(s.use)}</p></div>${btn("ghost", L("关闭", "Close"), 'data-act="dlg-close"', { icon: "x", iconOnly: true, cls: "mw-btn--icon mw-dialog__close" })}</header>
        <div class="mw-form__body">${flowView(s.id)}${collapsible(L("存在哪里", "Where it’s kept"), `<p>${s.way === "key" ? L("密钥只存在本机钥匙串，界面和助理都看不到原文。", "The key stays in this Mac’s Keychain; neither the page nor the assistant sees it.") : L("登录凭据只存在本机钥匙串；Molis Work 的服务器只转一下，不留存。", "Sign-in credentials stay in this Mac’s Keychain; Molis Work’s server only relays them and keeps nothing.")}</p>`)}</div></form></dialog>`;
    }
    return settingsPage(doc(`<section class="settings-connector-catalog">${search()}${cards}</section>${dlg}`));
  }

  // ---------- ② advanced ----------
  function advInner(id) {
    const s = svc(id), own = A.own === true || S.fault === "expired" && id === "github" || S.fault === "cancel" && A.own !== false;
    const fault = S.fault;
    const st0 = A.state || "edit"; // edit | checking | limited | rejected | saved | confirm-leave
    let top = "";
    if (fault === "cancel" && !A.dropped && st0 === "edit") top = alert("warning", L("上次的改动还没保存", "Last time’s changes weren’t saved"), L("草稿留着，原来的连接照常在用。接着改，或者放弃改动。", "The draft is kept and the old connection keeps working. Carry on, or drop the changes."));
    if (fault === "expired" && id === "github" && st0 === "edit") top = alert("danger", L("你自己的 GitHub 应用的 Client Secret 过期了", "Your own GitHub app’s Client Secret expired"), L("连接要重新登录才能用。换一把新的 Secret；或者改回 Molis Work 的应用，什么都不用填。", "The connection needs signing in again. Paste a new Secret — or switch back to the Molis Work app, nothing to fill in."));
    if (st0 === "confirm-leave") top = alert("warning", L("有改动还没保存", "Unsaved changes"), L("放弃的话，回到上次保存的设置；原来的连接一直照常在用。", "Dropping them returns to the last saved setup; the connection kept working throughout."), `<div class="settings-connection-row__actions">${btn("secondary", L("接着改", "Keep editing"), 'data-act="adv-keep"')}${btn("danger", L("放弃改动", "Drop changes"), 'data-act="adv-drop"')}</div>`);
    const stat = st0 === "checking" ? status("progress", "running", L("保存前先检查…", "Checking before saving…"), true)
      : st0 === "limited" ? status("hold", "retrying", L(`${T(s.name)} 限流（429），${S._left || 0} 秒后自动再查；检查过了才换上`, `${T(s.name)} rate limited (429); checks again in ${S._left || 0}s, switches only once it passes`), true)
      : st0 === "saved" ? status("done", "done", L("已保存，检查通过", "Saved and checked"), true)
      : `<small class="mw-field__hint">${L("保存前会先检查；检查不过不保存，原来的连接照常在用。", "It checks before saving; if the check fails nothing is saved and the old connection keeps working.")}</small>`;
    const rej = st0 === "rejected";
    const footer = `<footer class="mw-form__footer proto-savebar"><span class="proto-savebar__status">${stat}</span>${btn("secondary", L("放弃改动", "Drop changes"), 'data-act="adv-leave"')}${btn("primary", L("保存并检查", "Save and check"), 'data-act="adv-save" data-primary', { key: "↵" })}</footer>`;
    const diag = collapsible(L("诊断", "Diagnostics"), `<pre class="proto-diag">${diagText(id)}</pre>`);
    if (id === "github") {
      const sec = `<ol class="settings-connector-steps">
        <li><strong>${L("登记回调地址", "Register the callback URL")}</strong><p>${L("把下面的地址加进你的 GitHub 应用的回调地址。", "Add this address to your GitHub app’s callback URLs.")}</p><div class="settings-connector-copy"><code>http://127.0.0.1:4207/api/settings/connectors/methods/oauth/callback</code>${btn("ghost", L("复制", "Copy"), 'data-act="copied"')}</div></li>
        <li><strong>${L("填写应用信息", "Fill in the app")}</strong>${field({ id: "cid", label: "Client ID", value: own ? "Iv23liQ8xW2mPa71" : "", dirty: true })}${field({ id: "csec", type: "password", label: "Client Secret", value: own ? "xxxxxxxxxxxxxxxx" : "", dirty: true, hint: L("只存在本机钥匙串", "Kept in this Mac’s Keychain only"), error: rej ? L("GitHub 不认这个 Client Secret（invalid_client）。没有保存；原来的连接照常在用。", "GitHub doesn’t accept this Client Secret (invalid_client). Nothing saved; the old connection keeps working.") : "" })}</li></ol>`;
      return `<div class="mw-form__body">${top}
        ${radios("adv-own", L("用哪个 GitHub 应用登录", "Which GitHub app signs you in"), [["0", L("Molis Work 的应用", "The Molis Work app"), L("什么都不用填", "Nothing to fill in"), !own], ["1", L("我自己的 GitHub 应用", "My own GitHub app"), L("公司要求用自己注册的应用时选这个", "When your company requires its own registered app"), own]], "adv-own")}
        ${own ? sec : ""}
        ${S.fault === "switch" ? `<div class="proto-subhead"><strong>${L("哪件事用哪个账号", "Which account for what")}</strong><small class="mw-field__hint">${L("改了只影响以后的调用；正在做的那件用原来的账号做完。", "Changes apply to later calls; work already running finishes with its account.")}</small></div>${card("", [["Feed · GitHub 通知", "Feed · GitHub notifications", "yijunw0212"], ["Coding · molis-work 仓库", "Coding · molis-work repo", "molis-bot"], ["助理", "Assistant", "yijunw0212"]].map(([z, e, a], i) => settingRow(L(z, e), "", toggles(L("账号", "Account"), [["yijunw0212", "yijunw0212", (A.use?.[i] || a) === "yijunw0212"], ["molis-bot", "molis-bot", (A.use?.[i] || a) === "molis-bot"]], `use-${i}`))).join(""))}` : ""}
        <div class="proto-subhead"><strong>${L("权限原值", "Raw permissions")}</strong></div><span class="proto-badges">${badge("success", "notifications")}${badge("success", "read:user")}${badge("neutral", `repo · ${L("没申请", "not asked")}`)}</span>
        ${diag}</div>${footer}`;
    }
    // MiniMax
    return `<div class="mw-form__body">${top}
      ${field({ id: "m-url", label: L("地址", "Address"), value: "https://api.minimaxi.com/anthropic", dirty: true, hint: L("模板已经填好；只有用代理或自己部署的服务才改。", "Filled in by the template; change it only for a proxy or your own deployment.") })}
      <div class="mw-field"><span class="mw-field__label">${L("接口格式", "API format")}</span>${toggles(L("接口格式", "API format"), [["anthropic", "Anthropic Messages", (A.fmt || "anthropic") === "anthropic"], ["openai", "OpenAI Chat Completions", A.fmt === "openai"]], "fmt")}</div>
      ${field({ id: "m-id", label: L("模型名", "Model name"), value: "MiniMax-M3", dirty: true })}
      ${field({ id: "m-key", type: "password", label: L("换一把密钥", "Replace the key"), value: rej ? "sk-cp-9a…" : "", placeholder: "sk-…", dirty: true, hint: L("现在用 ••••7f3a；只存在本机钥匙串。", "Now ••••7f3a; kept in this Mac’s Keychain only."), error: rej ? L("MiniMax 拒绝了新密钥（401）。旧密钥 ••••7f3a 照常在用；新密钥没保存，填的还在。", "MiniMax refused the new key (401). The old key ••••7f3a keeps working; the new one isn’t saved and stays filled in.") : "" })}
      ${diag}</div>${footer}`;
  }
  function diagText(id) {
    return id === "github" ? `${L("最近检查", "Last check")}  11-04 10:12  200 OK\n${L("授予的权限", "Granted")}  notifications read:user\n${L("剩余请求", "Remaining")}  4,812 / 5,000  (${L("重置", "resets")} 10:59)\n${L("连接", "Connection")}  conn_gh_8f2a · r14`
      : `${L("最近检查", "Last check")}  11-04 10:08  200 OK  1.4s\nPOST /anthropic/v1/messages  model=MiniMax-M3\n${L("连接", "Connection")}  model-api · conn_mm_31c0 · r6`;
  }
  function advanced() {
    const id = A.subj || "github", s = svc(id), plan = S.plan.advanced;
    const overview = `${facts(id)}<div class="settings-connection-row__actions">${btn("secondary", L("检查连接", "Check connection"), 'data-act="noop"', { icon: "refresh" })}${s.way === "browser" ? btn("secondary", L("换账号", "Switch account"), 'data-act="noop"') : ""}</div>`;
    const subj = `<div class="proto-subject">${toggles(L("看哪个", "Which one"), [["github", "GitHub", id === "github"], ["minimax", "MiniMax", id === "minimax"]], "adv-subj")}</div>`;
    const summary = id === "github" ? L("自己的应用、权限原值、诊断", "Own app, raw permissions, diagnostics") : L("地址、接口格式、模型名、诊断", "Address, API format, model, diagnostics");
    let body;
    if (plan === "A") {
      const open = A.open || ["cancel", "expired", "keyrej", "switch"].includes(S.fault);
      body = `<section class="settings-connector-detail">${detailHead(s)}${overview}<details class="settings-connector-alternatives" data-adv${open ? " open" : ""}><summary>${L("高级", "Advanced")} · ${summary}</summary><form class="mw-form proto-adv" onsubmit="return false">${advInner(id)}</form></details></section>`;
    } else if (plan === "B") {
      const tab = A.tab || (["cancel", "expired", "keyrej", "switch"].includes(S.fault) ? "adv" : "over");
      body = `<section class="settings-connector-detail">${detailHead(s)}<div class="mw-tabs" data-slot="tabs"><div class="mw-tabs__list" role="tablist">${[["over", L("概览", "Overview")], ["adv", L("高级", "Advanced")]].map(([v, n]) => `<button type="button" class="mw-tabs__tab${tab === v ? " is-active" : ""}" role="tab" aria-selected="${tab === v}" data-act="adv-tab" data-v="${v}">${n}</button>`).join("")}</div></div>${tab === "over" ? overview : `<form class="mw-form" onsubmit="return false">${advInner(id)}</form>`}</section>`;
    } else {
      body = `<section class="settings-connector-detail">${detailHead(s)}${overview}<p class="settings-connector-purpose">${id === "github" ? L("要用自己的 GitHub 应用连接，去「自定义连接」。", "To connect with your own GitHub app, use Custom connection.") : L("要用别的地址或格式，去「自定义连接」。", "For another address or format, use Custom connection.")}</p><div class="settings-connection-row__actions">${btn("secondary", L("自定义连接", "Custom connection"), 'data-act="custom"', { icon: "plus" })}</div></section>`;
      if (A.custom || (["cancel", "expired", "keyrej"].includes(S.fault) && !A.forceClosed)) {
        const kinds = [["oauth", "user", L("自己的登录应用", "Your own sign-in app")], ["mcp", "globe", L("远程工具地址", "Remote tool address")], ["model", "sparkles", L("模型地址", "Model address")], ["key", "key", L("只要一把密钥的服务", "Key-only service")]];
        const kind = A.kind || (id === "github" ? "oauth" : "model");
        body += `<dialog class="mw-dialog mw-dialog--form" data-modal aria-labelledby="cu-h"><form method="dialog" class="mw-form" onsubmit="return false"><header class="mw-form__header"><div><h2 id="cu-h">${L("自定义连接", "Custom connection")}</h2><p>${L("先选要连的是哪一种。", "Pick what you’re connecting first.")}</p></div>${btn("ghost", L("关闭", "Close"), 'data-act="custom-close"', { icon: "x", iconOnly: true, cls: "mw-btn--icon mw-dialog__close" })}</header>
          <div class="mw-form__body"><div class="mw-choice-group" role="group" aria-label="${L("种类", "Kind")}">${kinds.map(([v, i, n]) => choice(n, kind === v, `data-act="kind" data-v="${v}"`, i)).join("")}</div></div>
          ${kind === "oauth" ? advInner("github") : kind === "model" ? advInner("minimax") : `<div class="mw-form__body">${alert("info", L("这两种只差字段", "These two differ only in fields"), L("一个地址，或一把密钥。原型里只画了前两种。", "One address, or one key. The prototype draws the first two."))}</div>`}</form></dialog>`;
      }
    }
    return settingsPage(doc(body, `<header class="settings-heading">${btn("ghost", L("服务连接", "Service connections"), 'data-act="noop"', { icon: "back", cls: "settings-connector-back" })}${subj}</header>`));
  }
  function advSave() {
    const id = A.custom ? (A.kind === "model" ? "minimax" : "github") : A.subj || "github";
    A.state = "checking";
    later(1200, () => {
      if (A.state !== "checking") return;
      if (S.fault === "keyrej" && !A.rejOnce) { A.state = "rejected"; A.rejOnce = true; return; }
      if (S.fault === "ratelimit" && !A.limOnce) { A.state = "limited"; A.limOnce = true; countdown(() => { A.state = "saved"; }); return; }
      A.state = "saved"; toast(L(`${T(svc(id).name)} 的设置已保存`, `${T(svc(id).name)} settings saved`), "done");
    });
  }

  // ---------- ③ back to where you were ----------
  const ORIGIN = {
    assistant: { svc: "github", tab: () => L("助理", "Assistant"), icon: "sparkles", draft: () => L("顺便按仓库分一下要我回的", "and group the ones I need to answer by repo") },
    feed: { svc: "github", tab: () => "Feed", icon: "inbox", draft: () => "" },
    coding: { svc: "github", tab: () => L("官网改版 · Coding", "Website redesign · Coding"), icon: "code", draft: () => L("PR 描述里写上改了哪几页", "list the pages changed in the PR description") },
    images: { svc: "image", tab: () => "Images", icon: "image", draft: () => "" },
  };
  function originName() { return T(D.origins.find((o) => o[0] === S.origin)[1]).split(/：|: /)[0]; }
  function returnDone(id) {
    if (S.plan.return === "B") { later(1300, () => { R.away = false; R.phase = "after"; toast(L(`${T(svc(id).name)} 已连上，接着做刚才的事`, `${T(svc(id).name)} connected — carrying on`), "done"); }); }
    else if (S.plan.return === "C") { R.ready = true; }
    else later(700, () => after());
  }
  function after() {
    R.phase = "after"; R.away = false; R.overlay = false;
    if (S.fault === "ratelimit") { R.wait = true; countdown(() => { R.wait = false; }); }
  }
  function back(cancelled) {
    R.overlay = false; R.away = false;
    if (cancelled) { R.phase = "cancelled"; delete F[ORIGIN[S.origin].svc]; } else after();
  }
  // The in-place card: a board mw-card with the connection flow as its panel.
  function needCard() {
    const o = ORIGIN[S.origin], id = o.svc, s = svc(id), name = T(s.name), plan = S.plan.return, p = st(id);
    const head = (title, sub) => `<div class="proto-need__head">${mark(s)}<div><h2 class="mw-card__title">${title}</h2>${sub ? `<p class="mw-card__description">${sub}</p>` : ""}</div></div>`;
    if (R.phase === "after") return `<div class="proto-need-done">${status("done", "done", S.origin === "coding" ? L("已允许推送和开 PR · yijunw0212", "Push and PRs allowed · yijunw0212") : L(`已连上 ${name} · ${R.pick || acct(id)}`, `${name} connected · ${R.pick || acct(id)}`), true)}</div>`;
    if (S.fault === "switch" && S.origin !== "images") {
      return card(head(L("这件事用哪个 GitHub 账号？", "Which GitHub account for this?"), L("两个都连着；它们能看到的仓库不一样", "Both are connected; they see different repositories")),
        `<div class="mw-choice-group" role="group" aria-label="${L("账号", "Account")}">${[["yijunw0212", L("个人 · 能看 12 个仓库", "Personal · sees 12 repos")], ["molis-bot", L("团队 · 能看 molis-ai 的 40 个仓库", "Team · sees 40 molis-ai repos")]].map(([a, n]) => choice(`${a} · ${n}`, false, `data-act="pick" data-v="${a}"`, "user")).join("")}</div>
        <label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" checked><span>${L("这个项目以后都用它", "Use it for this project from now on")}</span></label>`, "", `${isNew("原处的连接卡")} data-need`);
    }
    if (R.phase === "cancelled") return card(head(S.origin === "coding" ? L("没允许推送", "Push not allowed") : L(`没连上 ${name}`, `${name} not connected`), S.origin === "coding" ? L("改好的代码还在本地，测试也过了；要推送时再允许。", "The changes stay local and tests passed; allow it when you want to push.") : L("这件事先停在这里，你写的还在。", "This waits here; what you wrote is kept.")),
      "", primary(S.origin === "coding" ? L("允许推送", "Allow push") : L("再连一次", "Connect again"), "ret-start"), `${isNew("原处的连接卡")} data-need`);
    const expired = S.fault === "expired";
    const title = S.origin === "coding" ? L("推送要再允许一项：改仓库内容", "Pushing needs one more permission: change repository contents")
      : S.origin === "images" ? L("生成封面要一个图像模型", "A cover needs an image model")
      : expired ? L(`${name} 的登录过期了，读到第 2 页停下了`, `${name} sign-in expired; stopped after page 2`)
      : S.origin === "feed" ? L(`加 GitHub 通知，要先连上 ${name}`, `To add GitHub notifications, connect ${name}`) : L(`要读你的 GitHub 通知，先连上 ${name}`, `To read your GitHub notifications, connect ${name} first`);
    const sub = S.origin === "coding" ? L("账号还是 yijunw0212；只多要这一项（GitHub 叫 repo），别的不变。", "Same account yijunw0212; only this one is added (GitHub calls it repo).")
      : S.origin === "images" ? L("只要一把密钥。生成完就回到这里，提示词还在。", "Just one key. You come back here with your prompt kept.")
      : expired ? L("重新登录后从第 3 页接着读，不从头来。", "After signing in it carries on from page 3, not from the start.") : L("连好以后接着做这件事。", "It carries on once connected.");
    // Before the person starts, the card offers one action; once started (plan A), the flow runs inside the card.
    const inPlace = plan === "A" && R.started;
    const label = S.origin === "coding" ? L("允许推送", "Allow push") : S.origin === "images" ? L("填密钥", "Add key") : expired ? L("重新登录", "Sign in again") : L(`连接 ${name}`, `Connect ${name}`);
    return card(head(title, sub), inPlace ? flowView(id) : "", inPlace ? "" : primary(plan === "B" ? (S.origin === "images" ? L("去模型设置", "Open model settings") : L("去服务连接", "Open Service connections")) : label, "ret-start"), `${isNew("原处的连接卡")} data-need${expired ? ' data-tone="attention"' : ""}`);
  }
  function originBody() {
    const o = S.origin, aft = R.phase === "after", wait = R.wait;
    const waitLn = wait ? alert("warning", L("GitHub 限流", "GitHub is rate limiting"), L(`${left()} 秒后自动接着做；你可以先做别的。`, `Carries on in ${left()}s — do something else meanwhile.`)) : "";
    const list = (rows) => `<div class="mw-dir__list proto-origin__list">${rows.map(([t, st0, tone, ringS]) => `<div class="mw-dir-row mw-dir-row--meta" data-slot="directory-row"><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${t}</strong>${st0 ? `<span class="mw-status mw-status--${tone} mw-status--plain mw-dir-row__status" data-slot="status">${ring(ringS)}<span>${st0}</span></span>` : ""}</span></span></div>`).join("")}</div>`;
    if (o === "assistant") {
      return `<div class="proto-origin__flow"><p class="proto-msg proto-msg--me">${L("看看今天 GitHub 上有什么要我处理的", "What on GitHub needs me today?")}</p>
        ${S.fault === "expired" ? `<p class="proto-msg">${L("读了前 2 页，40 条通知…", "Read the first 2 pages, 40 notifications…")}</p>` : ""}
        ${needCard()}${waitLn}
        ${aft && !wait ? `<p class="proto-msg">${L("今天 6 条通知，3 条要你回：", "6 notifications today; 3 need you:")}</p>${list([["molis-work #1763", L("请你评审", "Review requested"), "attention", "answer"], ["molis-work #1759", L("被提到", "Mentioned"), "idle", "idle"], ["prologue #61", L("CI 失败", "CI failed"), "blocked", "failed"]])}` : ""}</div>`;
    }
    if (o === "feed") {
      return `<div class="proto-origin__flow"><h2 class="proto-origin__title">${L("添加来源", "Add a source")}</h2>
        ${list([["RSS", L("已有 4 个", "4 added"), "quiet", "connected"], [L("GitHub 通知", "GitHub notifications"), aft ? L("已加入", "Added") : L("在加", "Adding"), aft ? "done" : "progress", aft ? "done" : "running"], ["YouTube", "", "", ""]])}
        ${needCard()}${waitLn}
        ${aft && !wait ? list([[L("GitHub 通知 · 最新 6 条 · 刚刚", "GitHub notifications · latest 6 · just now"), "", "", ""], [`molis-work #1763 ${L("请你评审", "review requested")}`, "", "", ""], [`prologue #61 ${L("CI 失败", "CI failed")}`, "", "", ""]]) : ""}</div>`;
    }
    if (o === "coding") {
      return `<div class="proto-origin__flow"><h2 class="proto-origin__title">${L("修好登录页样式，推送并开 PR", "Fix the sign-in page style, push and open a PR")}</h2>
        ${list([[L("改了 3 个文件", "Changed 3 files"), L("完成", "Done"), "done", "done"], [L("测试通过（42 项）", "Tests passed (42)"), L("完成", "Done"), "done", "done"], aft && !wait ? [L("已推送 · PR #42 已开", "Pushed · PR #42 opened"), L("完成", "Done"), "done", "done"] : [L("推送并开 PR", "Push and open a PR"), L("等你允许", "Needs you"), "attention", "approval"]])}
        ${needCard()}${waitLn}</div>`;
    }
    return `<div class="proto-origin__flow"><label class="mw-field" data-slot="field"><span class="mw-field__label">${L("提示词", "Prompt")}</span><textarea class="mw-textarea" data-slot="textarea" rows="2">${L("第 13 批封面：一根线连到一扇门，门里是原来的桌面", "Batch 13 cover: a line leading to a door, the old desk behind it")}</textarea><small class="mw-field__hint">1280×720</small></label>
      ${needCard()}
      ${aft ? `<div class="mw-empty" data-slot="empty"><span class="mw-empty__mark">${ic("image")}</span><h2>${L("（示例）生成的封面", "(sample) the generated cover")}</h2><p>${L("原型里不真的生成图片。", "The prototype doesn’t really generate images.")}</p></div>` : ""}</div>`;
  }
  function originComposer() {
    const d = ORIGIN[S.origin].draft();
    if (!d) return "";
    return `<label class="mw-field proto-composer" data-slot="field"><span class="mw-field__label">${L("你写的，还在", "Yours, kept")}</span><span class="mw-input-group" data-slot="input-group"><input class="mw-input" data-slot="input" value="${d}" aria-label="${L("输入", "Message")}">${btn(R.phase === "after" ? "primary" : "ghost", L("发送", "Send"), 'data-act="noop"', { icon: "send", iconOnly: true })}</span></label>`;
  }
  // The place the person came from is drawn only far enough to read (data-board-new="示意外框"): the decision is the card.
  function originFrame(main) {
    const o = ORIGIN[S.origin];
    return `<div class="proto-origin" ${isNew("示意外框")}><div class="proto-origin__tab">${ic(o.icon)}<span>${o.tab()}</span></div><section class="proto-origin__sheet">${main}${originComposer()}</section></div>`;
  }
  function returnView() {
    const o = ORIGIN[S.origin], plan = S.plan.return, id = o.svc, s = svc(id);
    if (plan === "B" && R.away) {
      const banner = alert("info", L(`从「${originName()}」来`, `From “${originName()}”`), L("连好后自动回去，你写的都还在。", "Goes back once connected; what you wrote is kept."), `<div class="settings-connection-row__actions">${btn("secondary", L("现在回去", "Go back now"), 'data-act="ret-back"', { icon: "back" })}</div>`);
      return { body: "settings", html: settingsPage(doc(`<div class="proto-split has-sel" ${isNew("连接页的列表＋详情分栏")}>${listCol()}<section class="settings-connector-detail">${detailHead(s)}${flowView(id)}</section></div>`, heading(banner))) };
    }
    let sheet = "";
    if (plan === "C" && R.overlay) {
      const p = st(id), ready = R.ready;
      sheet = `<dialog class="mw-sheet" data-slot="sheet" data-modal aria-labelledby="ov-h"><form method="dialog" class="mw-form mw-sheet__shell" onsubmit="return false">
        <header class="mw-form__header"><div><h2 id="ov-h">${S.origin === "coding" ? L("允许推送，接着开 PR", "Allow pushing, then open the PR") : S.origin === "images" ? L("接上图像模型，接着生成", "Add an image model, then generate") : L(`连上 ${T(s.name)}，接着看今天的通知`, `Connect ${T(s.name)}, then read today’s notifications`)}</h2><p>${L(`回到${o.tab()}后接着做`, `Carries on back in ${o.tab()}`)}</p></div>${btn("ghost", L("关闭", "Close"), 'data-act="ov-exit"', { icon: "x", iconOnly: true, cls: "mw-btn--icon mw-dialog__close" })}</header>
        <div class="mw-form__body">${flowView(id)}
          ${card("", settingRow(S.origin === "coding" ? L("推送并开 PR", "Push and open a PR") : S.origin === "images" ? L("第 13 批封面 · 1280×720", "Batch 13 cover · 1280×720") : L("读今天的 GitHub 通知", "Read today’s GitHub notifications"), o.draft() ? L(`你写的还在：${o.draft()}`, `Kept: ${o.draft()}`) : "", ready ? status("done", "ready", L("可以了", "Ready"), true) : status("hold", "waiting", L("在等", "Waiting"), true)))}</div>
        <footer class="mw-form__footer">${ready || p === "done" ? btn("primary", L(`回到${o.tab()}接着做`, `Back to ${o.tab()} and carry on`), 'data-act="ov-back" data-primary', { key: "↵" }) : btn("ghost", L("先回去，进度留着", "Back for now — progress kept"), 'data-act="ov-exit"')}</footer></form></dialog>`;
    }
    return { body: "origin", html: originFrame(`${originBody()}`) + sheet };
  }
  function retStart() {
    const id = ORIGIN[S.origin].svc, plan = S.plan.return;
    R.started = true; R.phase = null; R.ready = false;
    if (plan === "B") R.away = true;
    if (plan === "C") R.overlay = true;
    if (svc(id).way === "key") { setF(id, { phase: "form" }); focusAfter = `#key-${id}`; return; }
    if (S.fault === "expired") connect(id, { relogin: true }); else connect(id);
  }

  // ---------- prototype strip & render ----------
  function proto() {
    const opt = (list, v) => list.map(([k, n]) => `<option value="${k}"${k === v ? " selected" : ""}>${T(n)}</option>`).join("");
    document.getElementById("p-title").textContent = L("13 · 服务与模型连接定样（原型）", "13 · Service & model connections (prototype)");
    document.getElementById("p-block").textContent = L("块", "Block");
    document.getElementById("p-plan").textContent = L("方案", "Option");
    document.getElementById("p-fault").textContent = L("状态", "State");
    document.getElementById("p-origin").textContent = L("从哪里来", "Came from");
    document.getElementById("block").innerHTML = opt(D.blocks, S.block);
    document.getElementById("plan").innerHTML = opt(D.plans[S.block], S.plan[S.block]);
    document.getElementById("fault").innerHTML = opt(D.faults, S.fault);
    document.getElementById("origin").innerHTML = opt(D.origins, S.origin);
    document.getElementById("origin-wrap").hidden = S.block !== "return";
    const seg = (el, items) => { document.getElementById(el).innerHTML = items.map(([v, n, cur, a]) => `<button type="button" class="mw-toggle${cur ? " is-current" : ""}" aria-pressed="${cur}" ${a}="${v}">${n}</button>`).join(""); };
    seg("lang", [["zh", "中文", S.lang === "zh", "data-lang"], ["en", "English", S.lang === "en", "data-lang"]]);
    seg("theme", [["light", L("浅色", "Light"), S.theme === "light", "data-theme-set"], ["dark", L("深色", "Dark"), S.theme === "dark", "data-theme-set"]]);
    seg("notes", [["1", L("标出组件板新增", "Mark board additions"), S.notes, "data-notes"]]);
    document.getElementById("reset").querySelector("span").textContent = L("重来", "Restart");
  }
  function render() {
    const root = document.documentElement;
    root.lang = S.lang === "zh" ? "zh-CN" : "en";
    root.dataset.theme = S.theme; root.dataset.resolvedTheme = S.theme; root.dataset.skin = "soft"; root.dataset.density = "standard";
    root.toggleAttribute("data-show-new", S.notes);
    proto();
    const app = document.getElementById("app");
    let html, kind = "settings";
    if (S.block === "direct") {
      if (!S._open && S.plan.direct === "A") S._open = S.fault === "keyrej" ? "minimax" : "github";
      if (!S._sel) S._sel = S.fault === "keyrej" ? "minimax" : "github";
      html = S.plan.direct === "A" ? directA() : S.plan.direct === "B" ? directB() : directC();
    } else if (S.block === "advanced") {
      if (S.fault === "keyrej" && !A.subjSet) A.subj = A.subj || "minimax";
      html = advanced();
    } else {
      if (S.fault === "keyrej") S.origin = "images";
      const r = returnView(); html = r.html; kind = r.body;
    }
    // The real settings page's body classes, only while a settings page is shown.
    document.body.className = kind === "settings" ? "settings-page project-preferences-page global-preferences-page proto-body" : "proto-body proto-body--origin";
    // innerHTML replaces the scroll containers: keep where the reader was across timer re-renders.
    const SCROLLERS = [".settings-content", ".proto-origin__sheet", "dialog .mw-form__body", ".mw-sheet .mw-form__body"];
    const kept = keepScroll ? SCROLLERS.map((sel) => document.querySelector(sel)?.scrollTop || 0) : [];
    app.innerHTML = html;
    app.querySelectorAll("dialog[data-modal]").forEach((d) => { if (!d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } } });
    if (keepScroll) SCROLLERS.forEach((sel, i) => { const el = document.querySelector(sel); if (el) el.scrollTop = kept[i]; });
    keepScroll = true;
    if (focusAfter) { const el = document.querySelector(focusAfter); if (el) el.focus(); focusAfter = null; }
    // Re-renders (timers, countdowns) must not replay the opening motion of dialogs and sheets.
    clearTimeout(settleTimer); settleTimer = setTimeout(() => document.body.classList.add("settled"), 450);
    if (settled) document.body.classList.add("settled");
  }
  let settleTimer = null, settled = false, keepScroll = false;
  function resetAll() { clearTimers(); F = {}; R = {}; A = {}; delete S._open; delete S._sel; delete S._dlg; delete S._selMobile; }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-lang],[data-theme-set],[data-notes]");
    if (!t) return;
    if (t.matches("a")) e.preventDefault();
    if (t.dataset.lang) { S.lang = t.dataset.lang; save(); render(); return; }
    if (t.dataset.themeSet) { S.theme = t.dataset.themeSet; save(); render(); return; }
    if (t.dataset.notes) { S.notes = !S.notes; save(); render(); return; }
    const act = t.dataset.act, id = t.dataset.id;
    if (act === "open" && e.target.closest(".proto-row__body")) return;
    settled = !["dlg", "custom", "ret-start", "to-advanced"].includes(act) && settled;
    if (["dlg", "custom", "ret-start", "to-advanced"].includes(act)) document.body.classList.remove("settled");
    switch (act) {
      case "open": e.stopPropagation(); S._open = S._open === id ? null : id; break;
      case "sel": S._sel = id; S._selMobile = true; break;
      case "unsel": S._selMobile = false; break;
      case "dlg": S._dlg = id; focusAfter = "dialog [data-primary], dialog .mw-btn"; break;
      case "dlg-close": S._dlg = null; break;
      case "connect": connect(id); break;
      case "relogin": connect(id, { relogin: true }); break;
      case "reopen": toast(L("（原型）又打开了一次登录页", "(prototype) sign-in opened again")); break;
      case "cancel": clearTimers(); setF(id, { phase: "cancelled", retried: true }); if (S.block === "return") later(500, () => back(true)); break;
      case "reset-one": clearTimers(); delete F[id]; if (S.block === "return") back(true); break;
      case "submit-key": check(id); break;
      case "limit-stop": clearTimers(); setF(id, { phase: "done" }); onDone(id); break;
      case "check": setF(id, { phase: "checking" }); later(900, () => setF(id, { phase: base(id) === "expired" ? "expired" : "ok" })); break;
      case "switch": setF(id, { phase: "switchask", how: "replace" }); break;
      case "how": setF(Object.keys(F).find((k) => F[k].phase === "switchask") || "github", { how: t.dataset.v }); break;
      case "switch-go": connect(id, { target: "molis-bot", how: (F[id] || {}).how || "replace" }); break;
      case "to-advanced": keepScroll = false; resetAll(); S.block = "advanced"; A.subj = id === "minimax" || S._sel === "minimax" || S._open === "minimax" ? "minimax" : "github"; break;
      case "adv-subj": A = { subj: t.dataset.v, subjSet: true }; break;
      case "adv-own": A.own = t.dataset.v === "1"; A.open = true; break;
      case "adv-tab": A.tab = t.dataset.v; break;
      case "adv-save": advSave(); break;
      case "adv-leave": A.state = "confirm-leave"; break;
      case "adv-keep": A.state = "edit"; break;
      case "adv-drop": A = { subj: A.subj, subjSet: true, dropped: true, own: false }; toast(L("改动已放弃，回到上次保存的设置", "Changes dropped; back to the last saved setup")); break;
      case "fmt": A.fmt = t.dataset.v; break;
      case "custom": A.custom = true; A.forceClosed = false; break;
      case "custom-close": A.custom = false; A.forceClosed = true; break;
      case "kind": A.kind = t.dataset.v; break;
      case "copied": toast(L("已复制", "Copied"), "done"); return;
      case "ret-start": retStart(); break;
      case "ret-back": back(st(ORIGIN[S.origin].svc) !== "done"); break;
      case "ov-exit": R.overlay = false; toast(L("进度留着，回来接着走", "Progress kept; pick it up later")); break;
      case "ov-back": back(false); break;
      case "pick": R.pick = t.dataset.v; R.phase = "after"; break;
      case "noop": toast(L("（原型）这里只演示入口", "(prototype) entry point only")); break;
      default:
        if (act && act.startsWith("use-")) { A.use = A.use || []; A.use[Number(act.slice(4))] = t.dataset.v; break; }
        return;
    }
    settled = act !== "dlg" && act !== "custom" && act !== "ret-start";
    render();
  });
  document.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("details[data-adv]")) A.open = e.target.open; }, true);
  document.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "block") { resetAll(); S.block = e.target.value; }
    else if (id === "plan") { resetAll(); S.plan[S.block] = e.target.value; }
    else if (id === "fault") { resetAll(); S.fault = e.target.value; if (S.fault !== "keyrej" && S.origin === "images" && S.block === "return") S.origin = "assistant"; }
    else if (id === "origin") { resetAll(); S.origin = e.target.value; if (S.fault === "keyrej" && S.origin !== "images") S.fault = "none"; }
    else return;
    settled = false; keepScroll = false; document.body.classList.remove("settled");
    save(); render();
  });
  document.addEventListener("input", (e) => { if (e.target.matches("[data-dirty]") && A.state === "saved") A.state = "edit"; });
  document.addEventListener("cancel", (e) => {
    // Esc on a modal: close it through the prototype's own state, so a re-render doesn't reopen it.
    if (!e.target.matches || !e.target.matches("dialog[data-modal]")) return;
    e.preventDefault();
    if (S._dlg) S._dlg = null; else if (A.custom || S.block === "advanced") { A.custom = false; A.forceClosed = true; } else if (R.overlay) R.overlay = false;
    render();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const tag = e.target.tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA" || tag === "SUMMARY" || e.target.type === "checkbox" || e.target.type === "radio") return;
    if (e.target.closest(".proto")) return;
    const scope = document.querySelector("dialog[open]") || document;
    const b = scope.querySelector("[data-primary]");
    if (b) { e.preventDefault(); b.click(); }
  });
  document.getElementById("reset").addEventListener("click", () => { resetAll(); S = { ...fresh(), lang: S.lang, theme: S.theme, notes: S.notes }; save(); render(); });
  window.protoJump = (s) => { resetAll(); Object.assign(S, s); render(); };
  render();
})();
