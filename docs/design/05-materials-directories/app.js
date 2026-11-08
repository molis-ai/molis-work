// Batch 05 directory samples: the strip that switches group, option, state, data, language and theme, and the page events.
// Group A (delete.js) and group B (folders.js) each draw their own views; everything they show happening is simulated.
//   #g=a|b  &o=<option>  &st=<state>  &d=<data>  &l=zh|en  &t=light|dark   any view can be opened straight from the address.
(() => {
  const app = document.getElementById("app");
  const G = window.Groups;
  const S = { g: "a", o: "", st: "", d: "", l: "zh", t: "light" };
  const fromHash = () => Object.fromEntries([...new URLSearchParams(location.hash.slice(1))].filter(([key, value]) => key in S && value));
  Object.assign(S, fromHash());
  const toHash = () => history.replaceState(null, "", `#g=${S.g}&o=${S.o}&st=${S.st}&d=${S.d}&l=${S.l}&t=${S.t}`);
  const group = () => G[S.g] ?? G.a;
  const T = (pair) => (S.l === "zh" ? pair[0] : pair[1]);
  const L = (zh, en) => (S.l === "zh" ? zh : en);

  // ---------- The strip ----------
  function strip() {
    const g = group();
    document.getElementById("p-title").textContent = L("第 05 批 · 目录定样", "Batch 05 · directory samples");
    document.getElementById("p-group").textContent = L("组", "Group");
    document.getElementById("p-option").textContent = L("方案", "Option");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("p-data").textContent = L("数据", "Data");
    document.getElementById("p-lang").textContent = L("语言", "Language");
    document.getElementById("p-theme").textContent = L("外观", "Theme");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("从头再来", "Start over");
    document.querySelectorAll("#group [data-group]").forEach((b) => { b.textContent = T(G[b.dataset.group].title); b.setAttribute("aria-pressed", String(b.dataset.group === S.g)); });
    document.getElementById("option").innerHTML = g.options.map(([id, label, recommended]) => `<button type="button" class="mw-toggle" data-option="${id}" aria-pressed="${id === S.o}"${recommended ? ` data-recommended title="${L("推荐", "Recommended")}"` : ""}>${T(label)}</button>`).join("");
    const fill = (id, items, value) => { const sel = document.getElementById(id); sel.innerHTML = items.map(([v, label]) => `<option value="${v}">${T(label)}</option>`).join(""); sel.value = value; };
    fill("state", g.states, S.st);
    fill("data", g.data, S.d);
    document.querySelectorAll("#lang [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.l)));
    document.querySelectorAll("#theme [data-theme-set]").forEach((b) => { b.textContent = b.dataset.themeSet === "light" ? L("浅", "Light") : L("深", "Dark"); b.setAttribute("aria-pressed", String(b.dataset.themeSet === S.t)); });
    document.querySelector(".proto").setAttribute("aria-label", L("原型控制（不是产品界面）", "Prototype controls (not product UI)"));
  }
  function note() {
    const text = group().note?.(S.st);
    document.getElementById("note").textContent = `${L("原型", "Prototype")} · ${text ? T(text) : ""}`;
  }

  // ---------- Start a view, and draw it ----------
  function start() {
    document.querySelectorAll(".proto-toast, .proto-scrim, body > dialog, .b-pop").forEach((node) => node.remove());
    Object.values(G).forEach((g) => g.teardown?.());
    if (!G[S.g]) S.g = "a";
    const g = group();
    if (!g.options.some(([id]) => id === S.o)) S.o = (g.options.find((o) => o[2]) ?? g.options[0])[0];
    if (!g.states.some(([id]) => id === S.st)) S.st = g.states[0][0];
    if (!g.data.some(([id]) => id === S.d)) S.d = g.data[0][0];
    if (!["zh", "en"].includes(S.l)) S.l = "zh";
    if (!["light", "dark"].includes(S.t)) S.t = "light";
    P.S.lang = S.l;
    document.documentElement.lang = S.l === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.t;
    document.documentElement.dataset.resolvedTheme = S.t;
    try { localStorage.setItem("molis-work:theme", S.t); } catch { /* the page draws the same without it */ }
    document.body.className = `proto-on ${g.bodyClass}`;
    document.getElementById("css-settings").disabled = !g.settingsCss;
    toHash();
    strip();
    note();
    g.preset(S.st, S.d, S.o);
    paint();
  }
  function paint() {
    const g = group();
    const scroll = [...app.querySelectorAll(".b-scroll, .b-mbody, .b-vbody, .settings-content")].map((node) => node.scrollTop);
    app.innerHTML = g.render();
    [...app.querySelectorAll(".b-scroll, .b-mbody, .b-vbody, .settings-content")].forEach((node, i) => { if (scroll[i]) node.scrollTop = scroll[i]; });
    g.place();
  }
  P.rerender = paint;

  // ---------- Page events ----------
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".proto")) return;
    const g = group();
    const closed = g.outside?.(target);
    if (g.click?.(target)) return;
    const el = target.closest("[data-act]");
    if (!el) { if (closed) paint(); return; }
    if (el.tagName === "A") event.preventDefault();
    if (el.matches(":disabled, [aria-disabled=true]")) return;
    if (g.act(el.dataset.act, el) || closed) paint();
  });
  document.addEventListener("change", (event) => { if (event.target.closest?.(".proto")) return; group().input?.(event.target); });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest?.(".proto")) return;
    if (group().key?.(event)) { event.preventDefault(); paint(); }
  });
  document.getElementById("group").addEventListener("click", (e) => { const v = e.target.closest("[data-group]")?.dataset.group; if (v && v !== S.g) { S.g = v; S.o = S.st = S.d = ""; start(); } });
  document.getElementById("option").addEventListener("click", (e) => { const v = e.target.closest("[data-option]")?.dataset.option; if (v) { S.o = v; start(); } });
  for (const id of ["state", "data"]) document.getElementById(id).addEventListener("change", (e) => { S[id === "state" ? "st" : "d"] = e.target.value; start(); });
  document.getElementById("lang").addEventListener("click", (e) => { const v = e.target.closest("[data-lang]")?.dataset.lang; if (v) { S.l = v; start(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const v = e.target.closest("[data-theme-set]")?.dataset.themeSet; if (v) { S.t = v; start(); } });
  document.getElementById("reset").addEventListener("click", () => start());
  window.addEventListener("hashchange", () => { const h = fromHash(); if (Object.entries(h).some(([k, v]) => S[k] !== v)) { Object.assign(S, h); start(); } });
  start();
})();
