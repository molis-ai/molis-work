// 13 · service & model connections — clickable review prototype. Sample data only: no sign-in, no key is stored,
// no model is called, no Home is touched. Timers stand in for the browser sign-in and the checks.
(() => {
  const D = window.protoData;
  const KEY = "molis-proto.service-connections.v1";
  const WAIT = 8; // the prototype shortens “about a minute” to 8 seconds
  document.getElementById("icons").innerHTML = window.protoIcons;

  const fresh = () => ({ block: "direct", plan: { direct: "A", advanced: "A", return: "A" }, fault: "none", origin: "assistant", lang: "zh", theme: "light" });
  let S = load() || fresh();
  let F = {}; // per-service flow state, not persisted
  let R = {}; // return-block state
  let A = {}; // advanced-block state
  let timers = [], ticker = null, focusAfter = null;

  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 1 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* preview without storage */ } }
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (p) => (p ? p[S.lang === "zh" ? 0 : 1] : "");
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const svc = (id) => D.services.find((s) => s.id === id);
  const grp = (id) => D.groups.find((g) => g.id === id);
  const hue = (s) => grp(s.group).hue;
  const mark = (s, size = "") => `<span class="mk ${size}" style="--hue:${hue(s)}" aria-hidden="true">${s.mark}</span>`;
  const kbd = `<span class="kbd" aria-hidden="true">↵</span>`;
  const later = (ms, fn) => { timers.push(setTimeout(() => { fn(); render(); }, ms)); };
  function clearTimers() { timers.forEach(clearTimeout); timers = []; if (ticker) { clearInterval(ticker); ticker = null; } }
  function countdown(onEnd) {
    if (ticker) clearInterval(ticker);
    S._left = WAIT;
    ticker = setInterval(() => { S._left -= 1; if (S._left <= 0) { clearInterval(ticker); ticker = null; onEnd(); } render(); }, 1000);
  }
  const left = () => `<span class="count">${String(Math.max(S._left || 0, 0)).padStart(2, "0")}</span>`;
  function announce(m) { document.getElementById("live").textContent = m; }
  function toast(m) { document.querySelectorAll(".toast").forEach((x) => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = m; document.body.append(el); setTimeout(() => el.remove(), 3400); }

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

  function chip(id) {
    const p = st(id);
    const m = {
      off: ["off", L("未连接", "Not connected")], later: ["off", L("还不能一键连接", "Not one-click yet")],
      ok: ["ok", L(`已连接 · ${acct(id)}`, `Connected · ${acct(id)}`)], done: ["ok", L(`已连接 · ${acct(id)}`, `Connected · ${acct(id)}`)],
      expired: ["warn", L("要重新登录", "Sign in again")], limited: ["warn", L("暂时限流", "Rate limited")],
      login: ["run", L("连接中", "Connecting")], checking: ["run", L("检查中", "Checking")], form: ["run", L("填写中", "Filling in")],
      switchask: ["run", L("换账号", "Switching")], rejected: ["err", L("密钥被拒", "Key refused")], cancelled: ["off", L("没连上", "Not connected")],
    }[p] || ["off", p];
    return `<span class="chip ${m[0]}">${m[1]}</span>`;
  }

  // ---------- connection flow (shared by every plan) ----------
  function stepsBar(id) {
    const s = svc(id), p = st(id);
    const names = s.way === "key" ? [L("填密钥", "Key"), L("检查", "Check"), L("能用了", "Ready")] : [L("在浏览器登录", "Sign in"), L("看能做什么", "Check"), L("能用了", "Ready")];
    const at = { login: 0, form: 0, switchask: 0, cancelled: 0, rejected: 0, checking: 1, limited: 1, done: 2 }[p];
    if (at === undefined) return "";
    const failAt = p === "cancelled" || p === "rejected" ? at : -1;
    return `<div class="steps" aria-label="${L("进度", "Progress")}">${names.map((n, i) => `${i ? '<span class="sep"></span>' : ""}<span class="s ${i === failAt ? "fail" : i < at || p === "done" ? "done" : i === at ? "on" : ""}"><b>${i < at || p === "done" ? "✓" : i + 1}</b>${n}</span>`).join("")}</div>`;
  }
  function canList(s, withNot = true) {
    const rows = (s.can || []).map((c) => `<div class="ln"><span class="st done">${ic("check", "sm")}${L("能", "Can")}</span><span class="nm">${T(c)}</span></div>`);
    if (withNot && s.not) rows.push(`<div class="ln"><span class="st todo">${ic("dot", "sm")}${L("不包括", "Not")}</span><span class="nm">${T(s.not[0])}<small>${T(s.not[1])}</small></span></div>`);
    return `<div class="can">${rows.join("")}</div>`;
  }
  function usesOf(id) {
    const u = D.usesOf[id];
    if (!u) return `<span class="fact">${L("还没有地方在用", "Nothing uses it yet")}</span>`;
    return `<div class="uses">${u.map(([i, n]) => `<span class="use">${ic(i, "sm")}${T(n)}</span>`).join("")}</div>`;
  }
  function facts(id) {
    const s = svc(id), p = st(id), exp = p === "expired", lim = p === "limited";
    const reach = exp ? `<span class="st fail">${ic("circle-alert", "sm")}${L("登录过期了", "Sign-in expired")}</span><span class="fact">${L("11-03 21:40 起", "since 11-03 21:40")}</span>`
      : lim ? `<span class="st wait">${ic("clock", "sm")}${L("限流中", "Rate limited")}</span><span class="fact">${L(`${left()} 秒后自动再查`, `checking again in ${left()}s`)}</span>`
      : `<span class="st done">${ic("check", "sm")}${L("连得上", "Reachable")}</span><span class="fact">${L("刚刚检查", "checked just now")}</span>`;
    const allowed = s.way === "key" ? L(`用 ${s.id === "minimax" ? "MiniMax-M3" : "wanx2.1"}，每次调用按 MiniMax 账户计费`, `Uses ${s.id === "minimax" ? "MiniMax-M3" : "wanx2.1"}; each call is billed to your account`)
      : (s.can || []).map(T).join(L("、", ", ")) + (s.not ? L(`；${T(s.not[0])}没允许`, `; ${T(s.not[0])} not allowed`) : "");
    return `<dl class="facts">
      <div><dt>${s.way === "key" ? L("密钥", "Key") : L("账号", "Account")}</dt><dd><strong>${acct(id)}</strong>${s.way === "key" ? `<span class="lock">${ic("lock", "sm")}${L("只存在钥匙串", "Kept in Keychain only")}</span>` : ""}</dd></div>
      <div><dt>${L("连得上吗", "Reachable")}</dt><dd>${reach}</dd></div>
      <div><dt>${L("允许做", "Allowed")}</dt><dd>${allowed}</dd></div>
      <div><dt>${exp ? L("在等它的", "Waiting on it") : L("在用它的", "Used by")}</dt><dd>${exp ? `<span class="st wait">${ic("waiting", "sm")}${L("2 件工作", "2 pieces of work")}</span><span class="fact">${L("Feed 的通知更新、Coding 的推送", "Feed updates, a Coding push")}</span>` : usesOf(id)}</dd></div>
    </dl>`;
  }
  function primary(label, act, extra = "") { return `<button class="btn primary" type="button" data-act="${act}" data-primary ${extra}>${label}${kbd}</button>`; }

  function flowView(id) {
    const s = svc(id), p = st(id), name = T(s.name);
    if (p === "later") return `<div class="panel"><p>${T(s.later)}</p><div class="acts">${s.id === "gmail" ? `<button class="btn sec" type="button" data-act="to-advanced">${L("用自己的 Google 应用（高级）", "Use your own Google app (Advanced)")}</button>` : `<button class="btn sec" type="button" data-act="noop">${L("给管理员发一份说明", "Send your admin a note")}</button>`}</div></div>`;
    if (p === "off" && s.way === "browser") return `<div class="flow">${canList(s)}<div class="acts">${primary(L(`连接 ${name}`, `Connect ${name}`), "connect", `data-id="${id}"`)}<span class="fact">${L(`会打开浏览器，在 ${name} 登录并同意`, `Opens your browser to sign in to ${name} and agree`)}</span></div></div>`;
    if ((p === "off" || p === "form" || p === "rejected") && s.way === "key") {
      const bad = p === "rejected";
      return `<div class="flow">${p !== "off" ? stepsBar(id) : ""}${canList(s, false)}
        <div class="field"><label for="key-${id}">${L(`${name} 的 API 密钥`, `${name} API key`)}<span class="lock">${ic("lock", "sm")}${L("只存在钥匙串", "Kept in Keychain only")}</span></label>
          <input class="fld${bad ? " bad" : ""}" id="key-${id}" type="password" autocomplete="off" value="${bad ? "sk-cp-0d1e7f…" : ""}" placeholder="sk-…" data-key="${id}">
          ${bad ? `<span class="err-t">${ic("circle-alert", "sm")}${L(`${name} 拒绝了这把密钥（401）。可能过期了，或复制时少了字符。还没保存，换一把再试。`, `${name} refused this key (401). It may have expired or been copied short. Nothing was saved; try another.`)}</span>` : `<span class="hint">${T(s.keyWhere)}</span>`}
        </div>
        <div class="acts">${primary(bad ? L("再试一次", "Try again") : L("连接", "Connect"), "submit-key", `data-id="${id}"`)}${bad ? `<button class="btn sec" type="button" data-act="noop">${L("换个提供方", "Another provider")}</button>` : ""}</div></div>`;
    }
    if (p === "login") {
      const f = F[id] || {};
      return `<div class="flow">${stepsBar(id)}<div class="panel"><div class="hd"><span class="spin"></span>${f.relogin ? L(`已在浏览器打开 ${name}，用 ${acct(id)} 重新登录`, `${name} is open in your browser — sign in again as ${acct(id)}`) : f.target ? L(`已在浏览器打开 ${name}，选 ${f.target} 登录`, `${name} is open in your browser — sign in as ${f.target}`) : L(`已在浏览器打开 ${name} 登录页`, `${name} sign-in is open in your browser`)}</div>
        <p>${L("登录、点同意后会自动回到这里。关掉这个页面也没关系，回来时接着走。", "Sign in and agree; you come back here by yourself. Closing this page is fine — it picks up when you return.")}</p>
        <div class="acts"><button class="btn sec" type="button" data-act="reopen">${ic("external", "sm")}${L("再打开一次登录页", "Open sign-in again")}</button><button class="btn ghost" type="button" data-act="cancel" data-id="${id}">${L("取消", "Cancel")}</button></div></div></div>`;
    }
    if (p === "checking") return `<div class="flow">${stepsBar(id)}<div class="panel"><div class="hd"><span class="spin"></span>${s.way === "key" ? L(`正在让 ${name} 回一句话…`, `Asking ${name} for a one-line reply…`) : L(`正在看 ${acct(id)} 能做什么…`, `Seeing what ${acct(id)} can do…`)}</div></div></div>`;
    if (p === "limited") return `<div class="flow">${stepsBar(id)}<div class="panel warn"><div class="hd">${ic("clock")}${L(`${name} 暂时限流`, `${name} is rate limiting`)}</div>
      <p>${s.way === "key" ? L(`密钥已经存好，但还没验证过，验证前不会拿它干活。${left()} 秒后自动再查一次。`, `The key is stored but not verified yet; nothing uses it until it is. Checking again in ${left()}s.`) : L(`已经连上了，能做什么还没查完。${left()} 秒后自动再查一次，不用你做什么。`, `You’re connected; the check isn’t finished. It runs again in ${left()}s — nothing for you to do.`)}</p>
      <div class="acts"><button class="btn sec" type="button" data-act="limit-stop" data-id="${id}">${L("不等了，先这样", "Don’t wait")}</button></div></div></div>`;
    if (p === "cancelled") {
      const was = base(id) === "expired";
      return `<div class="flow">${stepsBar(id)}<div class="panel"><div class="hd">${ic("circle-alert")}${L("没有连上", "Not connected")}</div>
      <p>${was ? L(`登录页关了，或在 ${name} 那边点了取消。原来的连接还停在「要重新登录」，在等的 2 件工作也还在等。`, `The sign-in page was closed or cancelled on ${name}. The old connection still needs signing in again, and the 2 waiting pieces of work still wait.`) : L(`登录页关了，或在 ${name} 那边点了取消。这里什么都没改。`, `The sign-in page was closed or cancelled on ${name}. Nothing changed here.`)}</p>
      <div class="acts">${primary(was ? L("重新登录", "Sign in again") : L("重新连接", "Connect again"), was ? "relogin" : "connect", `data-id="${id}"`)}<button class="btn ghost" type="button" data-act="reset-one" data-id="${id}">${L("先不连", "Not now")}</button></div></div></div>`;
    }
    if (p === "switchask") {
      const f = F[id] || {};
      return `<div class="flow"><div class="panel"><div class="hd">${ic("user")}${L(`换一个 ${name} 账号`, `Use another ${name} account`)}</div>
        <div class="radio" role="radiogroup">
          <button type="button" role="radio" aria-checked="${f.how !== "add"}" data-act="how" data-v="replace"><span class="o"></span><span><strong>${L(`换掉 ${acct(id)}`, `Replace ${acct(id)}`)}</strong><span class="fact">${L("用到它的 3 处跟着换成新账号。正在推送的 1 件会先停下，换好后问你要不要接着做。", "The 3 places that use it switch to the new account. The push in progress pauses; you’re asked whether to carry on after.")}</span></span></button>
          <button type="button" role="radio" aria-checked="${f.how === "add"}" data-act="how" data-v="add"><span class="o"></span><span><strong>${L("再加一个账号", "Add another account")}</strong><span class="fact">${L("两个都留着。以后哪件事要分清用哪个，再问你。", "Keep both. You’re asked which one only where it matters.")}</span></span></button>
        </div>${usesOf(id)}
        <div class="acts">${primary(L("去登录新账号", "Sign in to the new account"), "switch-go", `data-id="${id}"`)}<button class="btn ghost" type="button" data-act="reset-one" data-id="${id}">${L("算了", "Never mind")}</button></div></div></div>`;
    }
    if (p === "done" && S.block === "return" && S.plan.return !== "B") {
      // Coming from somewhere else: one line of result, then back to the work — no management actions here.
      return `<div class="flow">${stepsBar(id)}<div class="panel ok"><div class="hd">${ic("status-done")}${S.origin === "coding" ? L("推送和开 PR 已允许", "Push and PRs allowed") : L(`${name} 能用了 · ${acct(id)}`, `${name} is ready · ${acct(id)}`)}</div>${s.can ? canList(s, S.origin !== "coding") : ""}</div></div>`;
    }
    if (p === "done" || p === "ok" || p === "expired") {
      const f = F[id] || {};
      const head = p === "done" ? `<div class="panel ok"><div class="hd">${ic("status-done")}${f.switched ? L(`现在用 ${acct(id)}`, `Now using ${acct(id)}`) : f.relogin ? L("恢复了", "Back again") : L(`${name} 能用了`, `${name} is ready`)}</div><p>${f.switched === "replace" ? L(`用到它的 3 处已跟着换过来，yijunw0212 已断开。${name} 那边给旧账号的授权，要撤销就去 ${name} 设置。`, `The 3 places now use it; yijunw0212 is disconnected. To revoke the old grant on ${name}, use ${name}’s settings.`) : f.switched === "add" ? L("两个账号都在。用到 GitHub 的地方，默认还用原来的；要分清时会问你。", "Both accounts are kept. Places keep using the old one by default and ask when it matters.") : f.relogin ? L("在等的 2 件工作已经接着做了，没有从头来。", "The 2 waiting pieces of work carried on — nothing restarted.") : L("下面是这个账号现在能做的事。", "Here is what this account can do now.")}</p>${f.switched === "replace" ? `<div class="acts"><button class="btn sec sm" type="button" data-act="noop">${ic("external", "sm")}${L(`打开 ${name} 授权设置`, `Open ${name} grants`)}</button></div>` : ""}</div>` : "";
      const acts = p === "expired"
        ? `${primary(L(`用 ${acct(id)} 重新登录`, `Sign in again as ${acct(id)}`), "relogin", `data-id="${id}"`)}<button class="btn sec" type="button" data-act="switch" data-id="${id}">${L("换账号", "Switch account")}</button>`
        : `<button class="btn sec" type="button" data-act="check" data-id="${id}">${ic("refresh", "sm")}${L("检查一次", "Check now")}</button>${s.way === "browser" ? `<button class="btn sec" type="button" data-act="switch" data-id="${id}"${S.fault === "switch" ? " data-primary" : ""}>${L("换账号", "Switch account")}</button>` : `<button class="btn sec" type="button" data-act="to-advanced">${L("换密钥", "Replace key")}</button>`}<button class="btn ghost" type="button" data-act="noop">${L("断开", "Disconnect")}</button>`;
      return `<div class="flow">${p === "done" ? stepsBar(id) : ""}${head}${facts(id)}<div class="acts">${acts}</div></div>`;
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

  // ---------- frame ----------
  function frame(main, { tab, tabIcon = "settings", composer = "" } = {}) {
    return `<div class="app"><header class="titlebar solo"><div class="strip"><span class="brand"><i></i>Molis Work</span><div class="tabs"><button class="tab" type="button" aria-selected="true">${ic(tabIcon, "sm")}<span>${tab}</span></button></div></div></header>
      <div class="desk solo"><section class="pane">${main}</section></div>
      <footer class="bar"><div class="tray"><button class="pin" type="button" aria-label="${L("首页", "Home")}">${ic("home")}</button><button class="pin" type="button" aria-label="${L("助理", "Assistant")}"${S.block === "return" && S.origin === "assistant" ? " aria-current" : ""}>${ic("sparkles")}</button><button class="pin" type="button" aria-label="Coding"${S.block === "return" && S.origin === "coding" ? " aria-current" : ""}>${ic("code")}</button></div>${composer || `<div class="composer"><span class="ph">${L("问助理，或输入 / 找动作", "Ask the assistant, or type / for actions")}</span><button class="send" type="button" aria-label="${L("发送", "Send")}">${ic("send", "sm")}</button></div>`}<button class="mono" type="button" aria-label="${L("项目", "Project")}">Y</button></footer></div>`;
  }
  function settings(body, { head = "", narrow = false } = {}) {
    const nav = [["settings", L("常规", "General")], ["sparkles", L("模型", "Models")], ["link", L("连接", "Connections"), true], ["package", L("插件", "Plugins")], ["lock", L("权限", "Permissions")]];
    return `<div class="settings"><nav class="snav" aria-label="${L("设置", "Settings")}"><span class="cap">${L("设置", "Settings")}</span>${nav.map(([i, n, on]) => `<button type="button"${on ? ' aria-current="page"' : ""}>${ic(i, "sm")}${n}</button>`).join("")}</nav>
      <div class="smain scroll">${head}${body}</div></div>`;
  }
  const shead = (extra = "") => `<div class="shead"><h1>${L("连接", "Connections")}</h1><span class="grow"></span>${extra}<label class="search">${ic("search", "sm")}<input type="search" placeholder="${L("找一个服务", "Find a service")}" aria-label="${L("找一个服务", "Find a service")}"></label></div>`;

  // ---------- ① direct connect ----------
  function directA() {
    const groups = D.groups.map((g) => {
      const rows = D.services.filter((s) => s.group === g.id).map((s) => {
        const open = S._open === s.id;
        return `<button class="svc${open ? " sel" : ""}" type="button" data-act="open" data-id="${s.id}" aria-expanded="${open}">${mark(s)}<span class="bd"><strong>${T(s.name)}</strong><span class="fact">${T(s.use)}</span></span><span class="side">${chip(s.id)}${ic("chevron-down", "chev")}</span></button>${open ? `<div class="svc-x">${flowView(s.id)}</div>` : ""}`;
      }).join("");
      return `<section class="grp"><h2><span class="dot" style="--hue:${g.hue}"></span>${T(g.name)}</h2><div class="svc-list">${rows}</div></section>`;
    }).join("");
    return settings(`<div class="sbody narrow">${groups}</div>`, { head: shead() });
  }
  function listCol() {
    return `<div class="listcol">${D.groups.map((g) => `<section class="grp"><h2><span class="dot" style="--hue:${g.hue}"></span>${T(g.name)}</h2><div class="svc-list">${D.services.filter((s) => s.group === g.id).map((s) => `<button class="svc${S._sel === s.id ? " sel" : ""}" type="button" data-act="sel" data-id="${s.id}">${mark(s, "sm")}<span class="bd"><strong>${T(s.name)}</strong></span><span class="side">${chip(s.id)}</span></button>`).join("")}</div></section>`).join('<div style="height:12px"></div>')}</div>`;
  }
  function detailHead(s) { return `<button class="btn ghost sm back-only" type="button" data-act="unsel">${ic("chevron-left", "sm")}${L("全部连接", "All connections")}</button><div class="dhead">${mark(s, "lg")}<span class="bd"><h2>${T(s.name)}</h2><span class="fact">${T(s.use)}</span></span>${chip(s.id)}</div>`; }
  function directB() {
    const s = svc(S._sel || "github");
    return settings(`<div class="md${S._selMobile ? " has-sel" : ""}">${listCol()}<div class="detail">${detailHead(s)}${flowView(s.id)}</div></div>`, { head: shead() });
  }
  function directC() {
    const cards = `<div class="cards">${D.services.map((s) => {
      const g = grp(s.group);
      const p = st(s.id);
      const btn = p === "later" ? `<button class="btn sec sm" type="button" data-act="dlg" data-id="${s.id}">${L("看看为什么", "Why not")}</button>`
        : p === "off" || p === "cancelled" ? `<button class="btn primary sm" type="button" data-act="dlg" data-id="${s.id}">${L("连接", "Connect")}</button>`
        : p === "expired" ? `<button class="btn primary sm" type="button" data-act="dlg" data-id="${s.id}">${L("重新登录", "Sign in again")}</button>`
        : `<button class="btn sec sm" type="button" data-act="dlg" data-id="${s.id}">${L("查看", "Open")}</button>`;
      return `<div class="card"><div class="top">${mark(s)}<span class="bd"><strong>${T(s.name)}</strong><span class="gtag" style="--hue:${g.hue}">${T(g.name)}</span></span></div><p>${T(s.use)}</p><div class="acts">${chip(s.id)}<span class="grow"></span>${btn}</div></div>`;
    }).join("")}</div>`;
    let dlg = "";
    if (S._dlg) {
      const s = svc(S._dlg);
      dlg = `<div class="scrim" data-act="dlg-close-bg"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
        <div class="l"><div class="top">${mark(s)}<h2 id="dlg-h" class="grow">${st(s.id) === "off" ? L(`连接 ${T(s.name)}`, `Connect ${T(s.name)}`) : T(s.name)}</h2><button class="btn icon sm ghost" type="button" data-act="dlg-close" aria-label="${L("关闭", "Close")}">${ic("x", "sm")}</button></div>${flowView(s.id)}</div>
        <div class="r"><h3>${L("连上以后", "Once connected")}</h3>${s.can ? canList(s) : `<p class="fact">${T(s.later || s.use)}</p>`}<h3>${L("会用到它的", "Will be used by")}</h3>${usesOf(s.id)}<h3>${L("存在哪里", "Where it’s kept")}</h3><p class="fact">${s.way === "key" ? L("密钥只存在本机钥匙串，界面和助理都看不到原文。", "The key stays in this Mac’s Keychain; neither the page nor the assistant sees it.") : L("登录凭据只存在本机钥匙串；Molis Work 的服务器只转一下，不留存。", "Sign-in credentials stay in this Mac’s Keychain; Molis Work’s server only relays them and keeps nothing.")}</p></div></div></div>`;
    }
    return settings(`<div class="sbody">${cards}</div>${dlg}`, { head: shead() });
  }

  // ---------- ② advanced ----------
  function advSubjectSeg() {
    return `<span class="seg" role="group" aria-label="${L("看哪个", "Which one")}">${[["github", "GitHub"], ["minimax", "MiniMax"]].map(([v, n]) => `<button type="button" data-act="adv-subj" data-v="${v}" aria-pressed="${(A.subj || "github") === v}">${n}</button>`).join("")}</span>`;
  }
  function advInner(id) {
    const s = svc(id), own = A.own === true || S.fault === "expired" && id === "github" || S.fault === "cancel" && A.own !== false;
    const fault = S.fault;
    const st0 = A.state || "edit"; // edit | checking | limited | rejected | saved | confirm-leave
    let top = "";
    if (fault === "cancel" && !A.dropped && st0 === "edit") top = `<div class="panel warn"><div class="hd">${ic("note")}${L("上次的改动还没保存", "Last time’s changes weren’t saved")}</div><p>${L("草稿留着，原来的连接照常在用。接着改，或者放弃改动。", "The draft is kept and the old connection keeps working. Carry on, or drop the changes.")}</p></div>`;
    if (fault === "expired" && id === "github" && st0 === "edit") top = `<div class="panel err"><div class="hd">${ic("circle-alert")}${L("你自己的 GitHub 应用的 Client Secret 过期了", "Your own GitHub app’s Client Secret expired")}</div><p>${L("连接要重新登录才能用。换一把新的 Secret；或者改回 Molis Work 的应用，什么都不用填。", "The connection needs signing in again. Paste a new Secret — or switch back to the Molis Work app, nothing to fill in.")}</p></div>`;
    if (st0 === "confirm-leave") top = `<div class="panel warn"><div class="hd">${ic("alert")}${L("有改动还没保存", "Unsaved changes")}</div><p>${L("放弃的话，回到上次保存的设置；原来的连接一直照常在用。", "Dropping them returns to the last saved setup; the connection kept working throughout.")}</p><div class="acts"><button class="btn sec" type="button" data-act="adv-keep">${L("接着改", "Keep editing")}</button><button class="btn danger" type="button" data-act="adv-drop">${L("放弃改动", "Drop changes")}</button></div></div>`;
    const status = st0 === "checking" ? `<span class="st run"><span class="spin"></span>${L("保存前先检查…", "Checking before saving…")}</span>`
      : st0 === "limited" ? `<span class="st wait">${ic("clock", "sm")}${L(`${T(s.name)} 限流（429），${left()} 秒后自动再查；检查过了才换上`, `${T(s.name)} rate limited (429); checks again in ${left()}s, switches only once it passes`)}</span>`
      : st0 === "saved" ? `<span class="st done">${ic("check", "sm")}${L("已保存，检查通过", "Saved and checked")}</span>`
      : `<span class="fact">${L("保存前会先检查；检查不过不保存，原来的连接照常在用。", "It checks before saving; if the check fails nothing is saved and the old connection keeps working.")}</span>`;
    const rej = st0 === "rejected";
    if (id === "github") {
      const sec = `<div class="frm2">
        <div class="field"><label for="cid">Client ID</label><input class="fld" id="cid" value="${own ? "Iv23liQ8xW2mPa71" : ""}" data-dirty></div>
        <div class="field"><label for="csec">Client Secret<span class="lock">${ic("lock", "sm")}${L("只存在钥匙串", "Kept in Keychain only")}</span></label><input class="fld${rej ? " bad" : ""}" id="csec" type="password" value="${own ? "xxxxxxxxxxxxxxxx" : ""}" data-dirty>${rej ? `<span class="err-t">${ic("circle-alert", "sm")}${L("GitHub 不认这个 Client Secret（invalid_client）。没有保存；原来的连接照常在用。", "GitHub doesn’t accept this Client Secret (invalid_client). Nothing saved; the old connection keeps working.")}</span>` : ""}</div>
        <div class="field"><label>${L("回调地址（填进你的 GitHub 应用）", "Callback URL (add it to your GitHub app)")}</label><div class="copy"><span>http://127.0.0.1:4207/api/settings/connectors/methods/oauth/callback</span><button class="btn sm ghost" type="button" data-act="noop">${ic("clipboard", "sm")}${L("复制", "Copy")}</button></div></div></div>`;
      return `${top}
        <div class="field"><label>${L("用哪个 GitHub 应用登录", "Which GitHub app signs you in")}</label><div class="radio" role="radiogroup">
          <button type="button" role="radio" aria-checked="${!own}" data-act="adv-own" data-v="0"><span class="o"></span><span><strong>${L("Molis Work 的应用", "The Molis Work app")}</strong><span class="fact">${L("什么都不用填", "Nothing to fill in")}</span></span></button>
          <button type="button" role="radio" aria-checked="${own}" data-act="adv-own" data-v="1"><span class="o"></span><span><strong>${L("我自己的 GitHub 应用", "My own GitHub app")}</strong><span class="fact">${L("公司要求用自己注册的应用时选这个", "When your company requires its own registered app")}</span></span></button>
        </div></div>${own ? sec : ""}
        ${S.fault === "switch" ? `<div class="field"><label>${L("哪件事用哪个账号", "Which account for what")}</label><div class="svc-list">${[["Feed · GitHub 通知", "Feed · GitHub notifications", "yijunw0212"], ["Coding · molis-work 仓库", "Coding · molis-work repo", "molis-bot"], ["助理", "Assistant", "yijunw0212"]].map(([z, e, a]) => `<div class="svc">${ic("link", "sm")}<span class="bd"><strong>${L(z, e)}</strong></span><span class="side"><select class="fld" style="width:auto" aria-label="${L("账号", "Account")}"><option${a === "yijunw0212" ? " selected" : ""}>yijunw0212</option><option${a === "molis-bot" ? " selected" : ""}>molis-bot</option></select></span></div>`).join("")}</div><span class="hint">${L("改了只影响以后的调用；正在做的那件用原来的账号做完。", "Changes apply to later calls; work already running finishes with its account.")}</span></div>` : ""}
        <div class="field"><label>${L("权限原值", "Raw permissions")}</label><div class="scopes"><span class="scope">${ic("check", "sm")}notifications</span><span class="scope">${ic("check", "sm")}read:user</span><span class="scope no">repo · ${L("没申请", "not requested")}</span></div></div>
        <details class="tech"><summary>${L("诊断", "Diagnostics")}</summary><code>${diag(id)}</code></details>
        <div class="savebar"><span class="grow">${status}</span><button class="btn sec" type="button" data-act="adv-leave">${L("放弃改动", "Drop changes")}</button><button class="btn primary" type="button" data-act="adv-save" data-primary>${L("保存并检查", "Save and check")}${kbd}</button></div>`;
    }
    // MiniMax
    return `${top}
      <div class="frm2">
        <div class="field"><label for="m-url">${L("地址", "Address")}</label><input class="fld" id="m-url" value="https://api.minimaxi.com/anthropic" data-dirty><span class="hint">${L("模板已经填好；只有用代理或自己部署的服务才改。", "Filled in by the template; change it only for a proxy or your own deployment.")}</span></div>
        <div class="field"><label for="m-fmt">${L("接口格式", "API format")}</label><select class="fld" id="m-fmt"><option>Anthropic Messages</option><option>OpenAI Chat Completions</option></select></div>
        <div class="field"><label for="m-id">${L("模型名", "Model name")}</label><input class="fld" id="m-id" value="MiniMax-M3" data-dirty></div>
        <div class="field"><label for="m-key">${L("换一把密钥", "Replace the key")}<span class="lock">${ic("lock", "sm")}${L("现在用 ••••7f3a", "Now ••••7f3a")}</span></label><input class="fld${rej ? " bad" : ""}" id="m-key" type="password" placeholder="sk-…" value="${rej ? "sk-cp-9a…" : ""}" data-dirty>${rej ? `<span class="err-t">${ic("circle-alert", "sm")}${L("MiniMax 拒绝了新密钥（401）。旧密钥 ••••7f3a 照常在用；新密钥没保存，填的还在。", "MiniMax refused the new key (401). The old key ••••7f3a keeps working; the new one isn’t saved and stays filled in.")}</span>` : ""}</div>
      </div>
      <details class="tech"><summary>${L("诊断", "Diagnostics")}</summary><code>${diag(id)}</code></details>
      <div class="savebar"><span class="grow">${status}</span><button class="btn sec" type="button" data-act="adv-leave">${L("放弃改动", "Drop changes")}</button><button class="btn primary" type="button" data-act="adv-save" data-primary>${L("保存并检查", "Save and check")}${kbd}</button></div>`;
  }
  function diag(id) {
    return id === "github" ? `${L("最近检查", "Last check")}  11-04 10:12  200 OK\n${L("授予的权限", "Granted")}  notifications read:user\n${L("剩余请求", "Remaining")}  4,812 / 5,000  (${L("重置", "resets")} 10:59)\n${L("连接", "Connection")}  conn_gh_8f2a · r14`
      : `${L("最近检查", "Last check")}  11-04 10:08  200 OK  1.4s\nPOST /anthropic/v1/messages  model=MiniMax-M3\n${L("连接", "Connection")}  model-api · conn_mm_31c0 · r6`;
  }
  function advanced() {
    const id = A.subj || "github", s = svc(id), plan = S.plan.advanced;
    const overview = `${facts(id)}<div class="acts"><button class="btn sec" type="button" data-act="noop">${ic("refresh", "sm")}${L("检查一次", "Check now")}</button>${s.way === "browser" ? `<button class="btn sec" type="button" data-act="noop">${L("换账号", "Switch account")}</button>` : ""}</div>`;
    const crumb = `<div class="shead"><button class="btn ghost sm" type="button" data-act="noop">${ic("chevron-left", "sm")}${L("连接", "Connections")}</button><span class="grow"></span>${advSubjectSeg()}</div>`;
    let body;
    if (plan === "A") {
      const open = A.open || ["cancel", "expired", "keyrej"].includes(S.fault) || S.fault === "switch";
      body = `<div class="detail">${detailHead(s)}${overview}<details class="adv"${open ? " open" : ""} data-adv><summary>${ic("chevron-right", "sm chev")}${L("高级", "Advanced")}<span class="fact">${id === "github" ? L("自己的应用、权限原值、诊断", "Own app, raw permissions, diagnostics") : L("地址、接口格式、模型名、诊断", "Address, API format, model, diagnostics")}</span></summary><div class="in">${advInner(id)}</div></details></div>`;
    } else if (plan === "B") {
      const tab = A.tab || (["cancel", "expired", "keyrej", "switch"].includes(S.fault) ? "adv" : "over");
      body = `<div class="detail">${detailHead(s)}<div class="tabsx" role="tablist">${[["over", L("概览", "Overview")], ["adv", L("高级", "Advanced")]].map(([v, n]) => `<button type="button" role="tab" aria-selected="${tab === v}" data-act="adv-tab" data-v="${v}">${n}</button>`).join("")}</div>${tab === "over" ? overview : advInner(id)}</div>`;
    } else {
      body = `<div class="detail">${detailHead(s)}${overview}<button class="svc" type="button" data-act="custom" style="border-radius:var(--r-row);box-shadow:inset 0 0 0 1px var(--line)">${ic("settings")}<span class="bd"><strong>${id === "github" ? L("用自己的 GitHub 应用连接", "Connect with your own GitHub app") : L("用别的地址或格式", "Use another address or format")}</strong><span class="fact">${L("在「自定义连接」里填", "Filled in under Custom connection")}</span></span><span class="side">${ic("chevron-right", "sm")}</span></button></div>
        <button class="btn sec" type="button" data-act="custom" style="align-self:flex-start">${ic("plus", "sm")}${L("自定义连接", "Custom connection")}</button>`;
      if (A.custom || (["cancel", "expired", "keyrej"].includes(S.fault) && !A.forceClosed)) {
        const kinds = [["oauth", "user", L("自己的登录应用", "Your own sign-in app"), L("GitHub、Google 等用你注册的应用", "GitHub, Google… with an app you registered")], ["mcp", "globe", L("远程工具地址", "Remote tool address"), L("填一个 MCP 地址", "One MCP address")], ["model", "sparkles", L("模型地址", "Model address"), L("兼容 OpenAI 或 Anthropic 的服务", "OpenAI- or Anthropic-compatible")], ["key", "lock", L("只要一把密钥的服务", "A service that needs only a key"), L("Typesafe、图像 API…", "Typesafe, image APIs…")]];
        const kind = A.kind || (id === "github" ? "oauth" : "model");
        body += `<div class="scrim" data-act="custom-close-bg"><div class="dlg one" role="dialog" aria-modal="true" aria-labelledby="cu-h"><div class="l"><div class="top"><h2 id="cu-h" class="grow">${L("自定义连接", "Custom connection")}</h2><button class="btn icon sm ghost" type="button" data-act="custom-close" aria-label="${L("关闭", "Close")}">${ic("x", "sm")}</button></div>
          <div class="kinds">${kinds.map(([v, i, n, f]) => `<button class="choice" type="button" aria-pressed="${kind === v}" data-act="kind" data-v="${v}">${ic(i)}<span><strong>${n}</strong><span class="fact">${f}</span></span></button>`).join("")}</div>
          ${kind === "oauth" ? advInner("github") : kind === "model" ? advInner("minimax") : `<div class="placeholder">${ic("info")}<span>${L("这两种只差字段：一个地址，或一把密钥。原型里只画了左边两种。", "These two differ only in fields: an address, or a key. The prototype draws the first two.")}</span></div>`}</div></div></div>`;
      }
    }
    return settings(`<div class="sbody narrow">${body}</div>`, { head: crumb });
  }
  function advSave() {
    const id = A.custom ? (A.kind === "model" ? "minimax" : "github") : A.subj || "github";
    A.state = "checking";
    later(1200, () => {
      if (A.state !== "checking") return;
      if (S.fault === "keyrej" && !A.rejOnce) { A.state = "rejected"; A.rejOnce = true; return; }
      if (S.fault === "ratelimit" && !A.limOnce) { A.state = "limited"; A.limOnce = true; countdown(() => { A.state = "saved"; }); return; }
      A.state = "saved"; toast(L(`${T(svc(id).name)} 的设置已保存`, `${T(svc(id).name)} settings saved`));
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
    if (S.plan.return === "B") { later(1300, () => { R.away = false; R.phase = "after"; toast(L(`${T(svc(id).name)} 已连上，接着做刚才的事`, `${T(svc(id).name)} connected — carrying on`)); }); }
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
  function needCard() {
    const o = ORIGIN[S.origin], id = o.svc, s = svc(id), name = T(s.name), plan = S.plan.return, p = st(id);
    if (R.phase === "after") return `<div class="need done"><span class="st done">${ic("status-done", "sm")}${S.origin === "coding" ? L("已允许推送和开 PR · yijunw0212", "Push and PRs allowed · yijunw0212") : L(`已连上 ${name} · ${R.pick || acct(id)}`, `${name} connected · ${R.pick || acct(id)}`)}</span></div>`;
    if (S.fault === "switch" && S.origin !== "images" && R.phase !== "after") {
      return `<div class="need"><div class="hd">${mark(s, "sm")}<span class="bd"><strong>${L("这件事用哪个 GitHub 账号？", "Which GitHub account for this?")}</strong><span class="fact">${L("两个都连着；它们能看到的仓库不一样", "Both are connected; they see different repositories")}</span></span></div>
        <div class="choices">${[["yijunw0212", L("个人", "Personal"), L("能看 12 个仓库", "Sees 12 repos")], ["molis-bot", L("团队", "Team"), L("能看 molis-ai 的 40 个仓库", "Sees 40 molis-ai repos")]].map(([a, k, f]) => `<button class="choice" type="button" data-act="pick" data-v="${a}">${ic("user")}<span><strong>${a} · ${k}</strong><span class="fact">${f}</span></span></button>`).join("")}</div>
        <label class="fact" style="display:flex;gap:6px;align-items:center"><input type="checkbox" checked>${L("这个项目以后都用它", "Use it for this project from now on")}</label></div>`;
    }
    if (R.phase === "cancelled") return `<div class="need wait"><div class="hd">${mark(s, "sm")}<span class="bd"><strong>${S.origin === "coding" ? L("没允许推送", "Push not allowed") : L(`没连上 ${name}`, `${name} not connected`)}</strong><span class="fact">${S.origin === "coding" ? L("改好的代码还在本地，测试也过了；要推送时再允许。", "The changes stay local and tests passed; allow it when you want to push.") : L("这件事先停在这里，你写的还在。", "This waits here; what you wrote is kept.")}</span></span></div><div class="acts">${primary(S.origin === "coding" ? L("允许推送", "Allow push") : L("再连一次", "Connect again"), "ret-start")}</div></div>`;
    const expired = S.fault === "expired";
    const title = S.origin === "coding" ? L("推送要再允许一项：改仓库内容", "Pushing needs one more permission: change repository contents")
      : S.origin === "images" ? L("生成封面要一个图像模型", "A cover needs an image model")
      : expired ? L(`${name} 的登录过期了，读到第 2 页停下了`, `${name} sign-in expired; stopped after page 2`)
      : S.origin === "feed" ? L(`加 GitHub 通知，要先连上 ${name}`, `To add GitHub notifications, connect ${name}`) : L(`要读你的 GitHub 通知，先连上 ${name}`, `To read your GitHub notifications, connect ${name} first`);
    const sub = S.origin === "coding" ? L("账号还是 yijunw0212；只多要这一项（GitHub 叫 repo），别的不变。", "Same account yijunw0212; only this one is added (GitHub calls it repo).")
      : S.origin === "images" ? L("只要一把密钥。生成完就回到这里，提示词还在。", "Just one key. You come back here with your prompt kept.")
      : expired ? L("重新登录后从第 3 页接着读，不从头来。", "After signing in it carries on from page 3, not from the start.") : L("连好以后接着做这件事。", "It carries on once connected.");
    const inPlace = plan === "A" && (p !== "off" || R.started) && !(s.way === "key" && p === "off" && !R.started);
    const label = S.origin === "coding" ? L("允许推送", "Allow push") : S.origin === "images" ? L("填密钥", "Add key") : expired ? L("重新登录", "Sign in again") : L(`连接 ${name}`, `Connect ${name}`);
    return `<div class="need${expired ? " wait" : ""}"><div class="hd">${mark(s, "sm")}<span class="bd"><strong>${title}</strong><span class="fact">${sub}</span></span></div>
      ${inPlace ? flowView(id) : `<div class="acts">${primary(plan === "B" ? (S.origin === "images" ? L("去模型设置", "Open model settings") : L("去连接页", "Open Connections")) : label, "ret-start")}</div>`}</div>`;
  }
  function originBody() {
    const o = S.origin, aft = R.phase === "after", wait = R.wait;
    const waitLn = wait ? `<div class="need wait"><span class="st wait">${ic("clock", "sm")}${L(`GitHub 限流，${left()} 秒后自动接着做；你可以先做别的`, `GitHub is rate limiting; carries on in ${left()}s — do something else meanwhile`)}</span></div>` : "";
    if (o === "assistant") {
      return `<div class="obody center"><div class="msg me"><span class="av">Y</span><div class="bubble">${L("看看今天 GitHub 上有什么要我处理的", "What on GitHub needs me today?")}</div></div>
        ${S.fault === "expired" ? `<div class="msg"><span class="av">${ic("sparkles", "sm")}</span><div class="bubble">${L("读了前 2 页，40 条通知…", "Read the first 2 pages, 40 notifications…")}</div></div>` : ""}
        <div class="msg"><span class="av">${ic("sparkles", "sm")}</span><div class="bubble" style="background:transparent;padding:0">${needCard()}</div></div>
        ${waitLn}
        ${aft && !wait ? `<div class="msg"><span class="av">${ic("sparkles", "sm")}</span><div class="bubble">${L("今天 6 条通知，3 条要你回：", "6 notifications today; 3 need you:")}<div class="task" style="margin-top:8px">${[["molis-work #1763", L("请你评审", "Review requested")], ["molis-work #1759", L("被提到", "Mentioned")], ["prologue #61", L("CI 失败", "CI failed")]].map(([a, b]) => `<div class="ln"><span class="nm">${a}</span><span class="fact">${b}</span></div>`).join("")}</div></div></div>` : ""}</div>`;
    }
    if (o === "feed") {
      return `<div class="obody center"><h2 style="margin:0;font-size:16px">${L("添加来源", "Add a source")}</h2>
        <div class="task">${[["globe", "RSS", L("已有 4 个", "4 added")], ["inbox", L("GitHub 通知", "GitHub notifications"), ""], ["play", "YouTube", ""]].map(([i, n, f], k) => `<div class="ln">${ic(i, "sm")}<span class="nm">${n}</span>${k === 1 ? (aft ? `<span class="chip ok">${L("已加入", "Added")}</span>` : `<span class="chip run">${L("在加", "Adding")}</span>`) : `<span class="fact">${f}</span>`}</div>`).join("")}</div>
        ${needCard()}${waitLn}
        ${aft && !wait ? `<div class="task feedlist"><div class="ln"><span class="nm"><strong>${L("GitHub 通知 · 最新 6 条", "GitHub notifications · latest 6")}</strong></span><span class="fact">${L("刚刚", "just now")}</span></div><div class="ln"><span class="nm">molis-work #1763 ${L("请你评审", "review requested")}</span></div><div class="ln"><span class="nm">prologue #61 ${L("CI 失败", "CI failed")}</span></div></div>` : ""}</div>`;
    }
    if (o === "coding") {
      return `<div class="obody center"><div class="task"><div class="ln"><span class="nm"><strong>${L("修好登录页样式，推送并开 PR", "Fix the sign-in page style, push and open a PR")}</strong></span></div>
        <div class="ln"><span class="st done">${ic("check", "sm")}</span><span class="nm">${L("改了 3 个文件", "Changed 3 files")}</span></div><div class="ln"><span class="st done">${ic("check", "sm")}</span><span class="nm">${L("测试通过（42 项）", "Tests passed (42)")}</span></div>
        <div class="ln">${aft && !wait ? `<span class="st done">${ic("check", "sm")}</span><span class="nm">${L("已推送 · PR #42 已开", "Pushed · PR #42 opened")}</span>` : `<span class="st wait">${ic("waiting", "sm")}</span><span class="nm">${L("推送并开 PR", "Push and open a PR")}</span>`}</div></div>${needCard()}${waitLn}</div>`;
    }
    return `<div class="obody center"><div class="field"><label>${L("提示词", "Prompt")}</label><textarea class="ask" aria-label="${L("提示词", "Prompt")}">${L("第 13 批封面：一根线连到一扇门，门里是原来的桌面", "Batch 13 cover: a line leading to a door, the old desk behind it")}</textarea></div>
      <div class="acts"><span class="tag">1280×720</span></div>${needCard()}
      ${aft ? `<div class="placeholder" style="height:160px;align-items:center;justify-content:center">${ic("image")}${L("（示例）生成的封面", "(sample) the generated cover")}</div>` : ""}</div>`;
  }
  function originComposer() {
    const d = ORIGIN[S.origin].draft();
    if (!d) return "";
    return `<div class="composer kept"><span class="typed">${d}<small>${L("你写的，还在", "yours, kept")}</small></span><button class="send${R.phase === "after" ? " ready" : ""}" type="button" aria-label="${L("发送", "Send")}">${ic("send", "sm")}</button></div>`;
  }
  function returnView() {
    const o = ORIGIN[S.origin], plan = S.plan.return, id = o.svc, s = svc(id);
    if (plan === "B" && R.away) {
      const head = `<div class="banner">${ic("back", "sm")}<span class="grow">${L(`从「${originName()}」来 · 连好后自动回去`, `From “${originName()}” · goes back once connected`)}</span><button class="btn sm sec" type="button" data-act="ret-back">${L("现在回去", "Go back now")}</button></div>${shead()}`;
      const page = settings(`<div class="md has-sel">${listCol()}<div class="detail">${detailHead(s)}${flowView(id)}</div></div>`, { head });
      return frame(page, { tab: L("设置", "Settings"), composer: originComposer() });
    }
    let overlay = "";
    if (plan === "C" && R.overlay) {
      const p = st(id), ready = R.ready;
      overlay = `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="ov-h"><div class="sheetx"><div class="ct">
        <div><div class="q"><span class="assist-mark">${ic("sparkles", "sm")}</span><h2 id="ov-h">${S.origin === "coding" ? L("允许推送，接着开 PR", "Allow pushing, then open the PR") : S.origin === "images" ? L("接上图像模型，接着生成", "Add an image model, then generate") : L(`连上 ${T(s.name)}，接着看今天的通知`, `Connect ${T(s.name)}, then read today’s notifications`)}</h2></div>${flowView(id)}</div>
        <div><h3 style="margin:0;font-size:12px;color:var(--muted)">${L("回去以后接着做", "Carries on when you’re back")}</h3><div class="task">${S.origin === "images" ? `<div class="ln"><span class="nm">${L("第 13 批封面 · 1280×720", "Batch 13 cover · 1280×720")}</span></div>` : `<div class="ln"><span class="nm">${S.origin === "coding" ? L("推送并开 PR", "Push and open a PR") : L("读今天的 GitHub 通知", "Read today’s GitHub notifications")}</span>${ready ? `<span class="chip ok">${L("可以了", "Ready")}</span>` : `<span class="chip warn">${L("在等", "Waiting")}</span>`}</div>`}</div>
          ${o.draft() ? `<div class="task"><span class="fact">${L("你写的，还在", "What you wrote, kept")}</span><span>${o.draft()}</span></div>` : ""}</div></div>
        <div class="obar"><button class="btn ghost exit" type="button" data-act="ov-exit">${ic("chevron-left", "sm")}${o.tab()}</button><span class="grow"></span>${stepsBar(id)}<span class="grow"></span>${ready || p === "done" ? `<button class="btn primary big" type="button" data-act="ov-back" data-primary>${L(`回到${o.tab()}`, `Back to ${o.tab()}`)}${kbd}</button>` : ""}</div></div></div>`;
    }
    const main = `<div class="origin" style="position:relative">${originBody()}${overlay}</div>`;
    return frame(main, { tab: o.tab(), tabIcon: o.icon, composer: originComposer() });
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
    document.getElementById("p-lang").textContent = L("语言", "Language");
    document.getElementById("p-theme").textContent = L("外观", "Look");
    document.getElementById("block").innerHTML = opt(D.blocks, S.block);
    document.getElementById("plan").innerHTML = opt(D.plans[S.block], S.plan[S.block]);
    document.getElementById("fault").innerHTML = opt(D.faults, S.fault);
    document.getElementById("origin").innerHTML = opt(D.origins, S.origin);
    document.getElementById("origin-wrap").hidden = S.block !== "return";
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    document.querySelectorAll("#theme button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.themeSet === S.theme)); b.textContent = b.dataset.themeSet === "light" ? L("浅", "Light") : L("深", "Dark"); });
    document.getElementById("reset").textContent = L("重来", "Restart");
  }
  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.theme;
    proto();
    const app = document.getElementById("app");
    if (S.block === "direct") {
      if (!S._open && S.plan.direct === "A") S._open = S.fault === "keyrej" ? "minimax" : "github";
      if (!S._sel) S._sel = S.fault === "keyrej" ? "minimax" : "github";
      app.innerHTML = frame(S.plan.direct === "A" ? directA() : S.plan.direct === "B" ? directB() : directC(), { tab: L("设置", "Settings") });
    } else if (S.block === "advanced") {
      if (S.fault === "keyrej" && !A.subjSet) A.subj = A.subj || "minimax";
      app.innerHTML = frame(advanced(), { tab: L("设置", "Settings") });
    } else {
      if (S.fault === "keyrej") S.origin = "images";
      app.innerHTML = returnView();
    }
    if (focusAfter) { const el = document.querySelector(focusAfter); if (el) el.focus(); focusAfter = null; }
    // Re-renders (timers, countdowns) must not replay the opening motion of dialogs and sheets.
    clearTimeout(settleTimer); settleTimer = setTimeout(() => document.body.classList.add("settled"), 450);
  }
  let settleTimer = null;
  function resetAll() { clearTimers(); F = {}; R = {}; A = {}; delete S._open; delete S._sel; delete S._dlg; delete S._selMobile; }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-lang],[data-theme-set]");
    if (!t) return;
    if (t.dataset.lang) { S.lang = t.dataset.lang; save(); render(); return; }
    if (t.dataset.themeSet) { S.theme = t.dataset.themeSet; save(); render(); return; }
    const act = t.dataset.act, id = t.dataset.id;
    if (["dlg", "custom", "ret-start", "to-advanced"].includes(act)) document.body.classList.remove("settled");
    if ((act === "dlg-close-bg" || act === "custom-close-bg") && e.target !== t) return;
    switch (act) {
      case "open": S._open = S._open === id ? null : id; break;
      case "sel": S._sel = id; S._selMobile = true; break;
      case "unsel": S._selMobile = false; break;
      case "dlg": S._dlg = id; focusAfter = ".dlg [data-primary], .dlg button"; break;
      case "dlg-close": case "dlg-close-bg": S._dlg = null; break;
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
      case "to-advanced": resetAll(); S.block = "advanced"; A.subj = id === "minimax" || S._sel === "minimax" || S._open === "minimax" ? "minimax" : "github"; break;
      case "adv-subj": A = { subj: t.dataset.v, subjSet: true }; break;
      case "adv-own": A.own = t.dataset.v === "1"; break;
      case "adv-tab": A.tab = t.dataset.v; break;
      case "adv-save": advSave(); break;
      case "adv-leave": A.state = "confirm-leave"; break;
      case "adv-keep": A.state = "edit"; break;
      case "adv-drop": A = { subj: A.subj, subjSet: true, dropped: true, own: false }; toast(L("改动已放弃，回到上次保存的设置", "Changes dropped; back to the last saved setup")); break;
      case "custom": A.custom = true; A.forceClosed = false; break;
      case "custom-close": case "custom-close-bg": A.custom = false; A.forceClosed = true; break;
      case "kind": A.kind = t.dataset.v; break;
      case "ret-start": retStart(); break;
      case "ret-back": back(st(ORIGIN[S.origin].svc) !== "done"); break;
      case "ov-exit": R.overlay = false; toast(L("进度留着，回来接着走", "Progress kept; pick it up later")); break;
      case "ov-back": back(false); break;
      case "pick": R.pick = t.dataset.v; R.phase = "after"; break;
      case "noop": toast(L("（原型）这里只演示入口", "(prototype) entry point only")); break;
      default: return;
    }
    render();
  });
  document.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "block") { resetAll(); S.block = e.target.value; }
    else if (id === "plan") { resetAll(); S.plan[S.block] = e.target.value; }
    else if (id === "fault") { resetAll(); S.fault = e.target.value; if (S.fault !== "keyrej" && S.origin === "images" && S.block === "return") S.origin = "assistant"; }
    else if (id === "origin") { resetAll(); S.origin = e.target.value; if (S.fault === "keyrej" && S.origin !== "images") S.fault = "none"; }
    else return;
    save(); render();
  });
  document.addEventListener("input", (e) => { if (e.target.matches("[data-dirty]") && A.state === "saved") A.state = "edit"; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (S._dlg) { S._dlg = null; render(); return; }
      if (A.custom) { A.custom = false; A.forceClosed = true; render(); return; }
      if (R.overlay) { R.overlay = false; render(); return; }
    }
    if (e.key !== "Enter" || e.isComposing) return;
    const tag = e.target.tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA" || tag === "SUMMARY" || e.target.type === "checkbox") return;
    if (e.target.closest(".proto")) return;
    const scope = document.querySelector(".scrim .dlg, .overlay") || document;
    const btn = scope.querySelector("[data-primary]");
    if (btn) { e.preventDefault(); btn.click(); }
  });
  document.getElementById("reset").addEventListener("click", () => { resetAll(); S = { ...fresh(), lang: S.lang, theme: S.theme }; save(); render(); });
  window.protoJump = (s) => { resetAll(); Object.assign(S, s); render(); };
  render();
})();
