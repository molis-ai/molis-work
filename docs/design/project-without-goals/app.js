/* Static design specimen for batch 44. All interactions stay in this tab's memory; reloading resets the demo. */
(() => {
  const kit = window.mwKit;
  const escape = kit.escapeHtml;
  const params = new URLSearchParams(location.search);
  const choose = (key, values, fallback) => values.includes(params.get(key)) ? params.get(key) : fallback;
  const surface = choose("surface", ["first", "remove"], "first");
  const state = {
    surface,
    scheme: surface === "first" ? choose("scheme", ["A", "B", "C"], "A") : choose("scheme", ["A", "B"], "A"),
    scene: choose("scene", surface === "first" ? ["normal", "menu", "error", "loading"] : ["idle", "asking", "removed", "readded", "error"], surface === "first" ? "normal" : "idle"),
    lang: choose("lang", ["zh", "en"], "zh"),
    theme: choose("theme", ["light", "dark"], "light"),
    added: new Set(),
    toast: null,
  };
  const t = (zh, en) => state.lang === "zh" ? zh : en;
  const glyph = (name) => `<svg class="glyph" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const button = (act, zh, en, variant = "secondary", extra = {}) => kit.renderButton({ label: t(zh, en), variant, attrs: { "data-act": act, ...(extra.attrs ?? {}) }, ...extra });
  const iconButton = (act, icon, zh, en, attrs = {}) => kit.renderButton({ label: t(zh, en), icon, iconOnly: true, variant: "ghost", attrs: { "data-act": act, title: t(zh, en), ...attrs } });
  const badge = (zh, en) => kit.renderBadge({ label: t(zh, en) });

  // The plugins of the menu, as the + shows them today; hue is the plugin's identity colour.
  const plugins = () => [
    { id: "goals", group: "advance", icon: "target", hue: "indigo", name: "Goals", note: t("定目标、推进工作、留下依据", "Set goals, move work forward, keep evidence") },
    { id: "inbox", group: "advance", icon: "inbox", hue: "cyan", name: t("收件箱", "Inbox"), note: t("只看需要你处理的", "See only what needs your attention") },
    { id: "schedule", group: "advance", icon: "calendar", hue: "green", name: t("日程", "Schedule"), note: t("定时对话、接收插件提醒", "Scheduled chats and plugin reminders") },
    { id: "pages", group: "make", icon: "file", hue: "orange", name: "Pages", note: t("写文档，导出成 Markdown", "Write documents and export to Markdown") },
    { id: "todo", group: "make", icon: "list", hue: "pink", name: t("待办", "Todo"), note: t("记下要做的事", "Write down what needs doing") },
    { id: "coding", group: "make", icon: "code", hue: "steel", name: "Coding", note: t("让 Agent 写代码并留下记录", "Write code with an agent and keep a record") },
  ];
  const groups = () => [["advance", t("推进", "Advance")], ["make", t("写作与制作", "Write and make")]];

  // What the project has: a new project has Schedule (and the always-on Shelf, which has no tab); the remove surface starts with Goals.
  const has = (id) => {
    if (id === "schedule") return true;
    if (state.added.has(id)) return true;
    if (id === "goals" && state.surface === "remove") return ["idle", "asking", "readded", "error"].includes(state.scene);
    if (id === "todo" && state.surface === "remove") return true;
    return false;
  };
  const projectName = () => state.surface === "first" ? t("新品发布筹备", "Launch prep") : t("官网改版", "Website refresh");

  function controls() {
    const toggle = (key, label, entries) => kit.renderToggleGroup({ label, items: entries.map(([value, text]) => ({ value, label: text, current: state[key] === value, attrs: { "data-control": key } })) });
    const surfaces = toggle("surface", t("界面", "Surface"), [["first", t("新项目首屏", "New project")], ["remove", t("移除与加回", "Remove and add back")]]);
    const schemes = state.surface === "first"
      ? toggle("scheme", t("方案", "Scheme"), [["A", t("A · 一个入口", "A · One entry")], ["B", t("B · 加起步组合", "B · Starter sets")], ["C", t("C · 落到首个插件", "C · First plugin")]])
      : toggle("scheme", t("方案", "Scheme"), [["A", t("A · 就地再点一次", "A · Press again")], ["B", t("B · 确认气泡", "B · Confirm popover")]]);
    const scenes = state.surface === "first"
      ? [["normal", "正常", "Normal"], ["menu", "打开添加", "Menu open"], ["error", "添加失败", "Add failed"], ["loading", "加载中", "Loading"]]
      : [["idle", "移除前", "Before"], ["asking", "确认中", "Confirming"], ["removed", "已移除", "Removed"], ["readded", "已加回", "Added back"], ["error", "移除失败", "Remove failed"]];
    return `<div class="demo-controls"><span class="demo-label">${t("第 44 批 · 静态定样，数据只在当前页面演示", "Batch 44 · Static specimen with local demo data")}</span><div class="demo-options">
      ${surfaces}${schemes}
      ${toggle("scene", t("状态", "State"), scenes.map(([value, zh, en]) => [value, t(zh, en)]))}
      ${toggle("lang", "Language", [["zh", "中"], ["en", "EN"]])}
      ${button("theme", state.theme === "light" ? "深色" : "浅色", state.theme === "light" ? "Dark" : "Light", "ghost")}
    </div></div>`;
  }

  function tabs() {
    const items = [`<button class="wb-tab" type="button" ${current("home")}>${glyph("home")}<span class="label">${t("项目首页", "Project home")}</span></button>`];
    for (const plugin of plugins()) if (has(plugin.id)) items.push(`<button class="wb-tab icon-only" type="button" ${current(plugin.id)} aria-label="${escape(plugin.name)}" title="${escape(plugin.name)}">${glyph(plugin.icon)}</button>`);
    const open = menuOpen();
    return `<header class="wb-top"><nav class="wb-tabs" aria-label="${t("项目里的面", "Project surfaces")}">${items.join("")}</nav>
      <button class="wb-add" type="button" data-act="menu" aria-expanded="${open}" aria-label="${t("添加插件", "Add plugins")}" title="${t("添加插件", "Add plugins")}">${glyph(open ? "x" : "plus")}</button>
      ${open ? menu() : ""}<span class="wb-me" aria-hidden="true">Y</span></header>`;
  }
  const current = (id) => (state.surface === "first" && state.scheme === "C" && state.scene !== "menu" && !state.added.size ? id === "schedule" : id === "home") ? 'aria-current="page"' : "";
  const menuOpen = () => (state.surface === "first" && state.scene === "menu") || (state.surface === "remove" && state.scene !== "readded");

  function tile(plugin) {
    const inProject = has(plugin.id);
    const asking = state.surface === "remove" && plugin.id === "goals" && state.scene === "asking";
    const kept = state.surface === "remove" && plugin.id === "goals" && state.scene === "removed";
    const hot = state.surface === "remove" && plugin.id === "goals" && ["idle", "error"].includes(state.scene);
    const confirmingA = asking && state.scheme === "A";
    const note = confirmingA ? t("再点一次移除 · 数据保留，加回即恢复", "Press again to remove · its data stays and comes back") : plugin.note;
    const ops = inProject
      ? `${iconButton("pin", "pin", "固定到底栏", "Keep in the Dock")}${plugin.id === "schedule" ? "" : iconButton(plugin.id === "goals" ? "remove" : "noop", "trash", `移除：${plugin.name}`, `Remove: ${plugin.name}`, { title: confirmingA ? note : t("在本项目停用；数据保留，加回即恢复", "Turn off in this project; its data stays and comes back when you add it again"), ...(confirmingA ? { "aria-pressed": "true" } : {}) })}`
      : iconButton(`add:${plugin.id}`, "plus", `添加：${plugin.name}`, `Add: ${plugin.name}`, { title: t("添加到本项目", "Add to this project") });
    const ask = asking && state.scheme === "B" ? `<div class="ask" role="dialog" aria-label="${t("移除 Goals", "Remove Goals")}">
        <strong>${t("从这个项目移除 Goals？", "Remove Goals from this project?")}</strong>
        <dl><dt>${t("会保留", "Stays")}</dt><dd>${t("Goal、关系、工作历史和要求认可。重新添加后都在。", "Goals, relations, work history and requirement sign-offs. All back when you add it again.")}</dd>
        <dt>${t("先收起", "Put away")}</dt><dd>${t("Goals 页面和首页上的 Goals 卡片。", "The Goals page and its card on the project home.")}</dd></dl>
        <div class="buttons">${button("cancel", "取消", "Cancel", "ghost")}${button("remove", "移除", "Remove", "primary")}</div></div>` : "";
    const keptBadge = kept ? `<span class="kept">${badge("数据已保留", "Data kept")}</span>` : "";
    return `<div class="tile${inProject ? "" : " is-available"}${confirmingA ? " is-confirming" : ""}${hot ? " is-hot" : ""}" data-plugin="${plugin.id}">
      <span class="ident hue-${plugin.hue}">${glyph(plugin.icon)}</span><b>${escape(plugin.name)}</b><small>${escape(note)}</small>${keptBadge}<span class="ops">${ops}</span>${ask}</div>`;
  }

  function menu() {
    return `<div class="menu" role="dialog" aria-label="${t("添加插件", "Add plugins")}"><div class="menu-search">${kit.renderInput({ placeholder: t("搜索", "Search") })}${button("noop", "插件市场", "Plugin market", "ghost", { icon: "package" })}</div>
      ${groups().map(([id, label]) => `<h3>${escape(label)}</h3><div class="tiles">${plugins().filter((p) => p.group === id).map(tile).join("")}</div>`).join("")}</div>`;
  }

  /* Surface 1: the first screen of a new project without Goals. */
  function firstScreen() {
    if (state.scene === "loading") return `<div class="home">${kit.renderSkeleton({ className: "sk-line" })}<div style="height:12px"></div>${kit.renderSkeleton()}<div style="height:12px"></div>${kit.renderSkeleton()}</div>`;
    if (state.scheme === "C" && !state.added.size && state.scene !== "menu") return schedulePage();
    const added = plugins().filter((p) => state.added.has(p.id));
    const error = state.scene === "error" ? `<div class="inline-feedback">${kit.renderAlert({ title: t("没能添加 Pages", "Could not add Pages"), body: t("项目没有变化。可以再试一次。", "Nothing in the project changed. You can try again."), tone: "danger", actions: [{ label: t("重试", "Try again"), attrs: { "data-act": "add:pages" } }] })}</div>` : "";
    const lede = added.length
      ? t("新加的插件已经在上面的标签里，它们的内容会出现在下面。", "The plugins you added are in the tabs above; what they hold shows below.")
      : t("这个项目里还没有内容。添加插件后，它们的内容会出现在这里。", "Nothing here yet. Add plugins, and what they hold shows up here.");
    const start = `<div class="start">${button("menu", "添加插件", "Add plugins", "primary", { icon: "plus", size: "md" })}${state.scheme === "A" ? `<span class="quiet">${t("也可以直接在下面问助理。", "Or ask the assistant below.")}</span>` : ""}</div>`;
    const packs = state.scheme === "B" && !added.length ? `<section class="packs"><h2>${t("或者从一组开始", "Or start with a set")}</h2><div class="pack-list">${[
      ["write", t("写作与资料", "Writing and materials"), t("写文档、收集资料，整理成稿。", "Write, gather materials and pull them together."), ["Pages", t("待办", "Todo")]],
      ["goal", t("推进目标", "Moving goals forward"), t("定目标、分步骤，每步留下依据。", "Set goals, break them down, keep evidence at each step."), ["Goals", t("待办", "Todo")]],
      ["code", t("写代码", "Coding"), t("让 Agent 改代码，看改动与记录。", "Let an agent change code; review changes and records."), ["Coding", "Pages"]],
    ].map(([id, name, note, tags]) => `<div class="pack"><strong>${escape(name)}</strong><p>${escape(note)}</p><div class="tags">${tags.map((tag) => kit.renderBadge({ label: tag })).join("")}</div>${button(`pack:${id}`, "添加这一组", "Add this set")}</div>`).join("")}</div></section>` : "";
    const cards = added.length ? `<section class="cards"><h2>${t("项目插件", "Project plugins")}</h2><div class="card-grid">${added.map(card).join("")}</div></section>` : "";
    return `<div class="home"><p class="eyebrow">${t("项目首页", "Project home")}</p><h1>${escape(projectName())}</h1><p class="lede">${lede}</p>${added.length ? "" : start}${error}${packs}${cards}</div>`;
  }
  function schedulePage() {
    return `<div class="plugin-page">${kit.renderAlert({ title: t("这个项目目前只有日程", "This project only has Schedule so far"), body: t("要写文档、推进目标或写代码，先添加对应的插件。", "To write, move goals forward or code, add the plugin for it first."), tone: "info", actions: [{ label: t("添加插件", "Add plugins"), variant: "primary", icon: "plus", attrs: { "data-act": "menu" } }] })}
      ${state.scene === "error" ? kit.renderAlert({ title: t("没能添加 Pages", "Could not add Pages"), body: t("项目没有变化。可以再试一次。", "Nothing in the project changed. You can try again."), tone: "danger", actions: [{ label: t("重试", "Try again"), attrs: { "data-act": "add:pages" } }] }) : ""}
      ${kit.renderEmpty({ icon: "calendar", title: t("还没有定时任务", "No scheduled tasks yet"), body: t("定时让助理做一件事，到点后结果会出现在这里。", "Have the assistant do something on a schedule; results show up here.") })}</div>`;
  }
  function card(plugin) {
    const rows = plugin.id === "goals"
      ? [[t("首页改成三栏", "Three-column home page"), t("进行中", "In progress")], [t("定价页上线", "Pricing page live"), t("已完成", "Done")]]
      : [[t("还没有内容", "Nothing yet"), ""]];
    return `<article class="plugin-card${state.surface === "remove" && state.scene === "readded" && plugin.id === "goals" ? " is-arriving" : ""}"><header><span class="ident hue-${plugin.hue}">${glyph(plugin.icon)}</span>${escape(plugin.name)}</header>
      <div class="rows">${rows.map(([title, mark]) => `<div class="row"><span>${escape(title)}</span>${mark ? kit.renderStatusMark({ label: mark, tone: "quiet" }) : ""}</div>`).join("")}</div></article>`;
  }

  /* Surface 2: removing Goals and adding it back, from the + menu. */
  function removeScreen() {
    const inProject = plugins().filter((p) => has(p.id) && p.id !== "schedule");
    return `<div class="home${menuOpen() ? " dim" : ""}"><p class="eyebrow">${t("项目首页", "Project home")}</p><h1>${escape(projectName())}</h1>
      <section class="cards"><h2>${t("项目插件", "Project plugins")}</h2><div class="card-grid">${inProject.map(card).join("")}</div></section></div>`;
  }

  function toast() {
    const s = state.surface === "remove" ? state.scene : null;
    if (s === "removed") return kit.renderToast({ message: t("已移除 Goals。数据保留，重新添加后恢复。", "Goals removed. Its data stays and comes back when you add it again."), action: state.scheme === "A" ? { label: t("撤销", "Undo"), attrs: { "data-act": "readd" } } : undefined });
    if (s === "readded") return kit.renderToast({ tone: "success", message: t("Goals 已加回，原来的 2 个 Goal 和认可记录都在。", "Goals is back, with its 2 goals and sign-offs as they were.") });
    if (s === "error") return kit.renderToast({ tone: "danger", message: t("无法移除插件。项目没有变化。", "Could not remove the plugin. Nothing in the project changed.") });
    return state.toast ? kit.renderToast(state.toast) : "";
  }

  function render() {
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.resolvedTheme = state.theme;
    document.getElementById("prototype-controls").innerHTML = controls();
    const canvas = state.surface === "first" ? firstScreen() : removeScreen();
    document.getElementById("prototype").innerHTML = `<div class="wb">${tabs()}<section class="wb-canvas">${canvas}</section>
      <footer class="wb-bottom"><span class="wb-chip">${glyph("folder")}<span class="label">${escape(projectName())}</span></span><span class="wb-input">${t("问助理，或按 ⌘K 搜索", "Ask the assistant, or press ⌘K to search")}</span></footer></div>`;
    document.getElementById("toasts").innerHTML = toast();
    const query = new URLSearchParams({ surface: state.surface, scheme: state.scheme, scene: state.scene, lang: state.lang, theme: state.theme });
    history.replaceState(null, "", `?${query}`);
  }

  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-control]");
    if (control) {
      const key = control.dataset.control, value = control.value || control.dataset.value || control.getAttribute("value");
      state[key] = value;
      if (key === "surface") { state.scheme = "A"; state.scene = value === "first" ? "normal" : "idle"; state.added.clear(); }
      if (key === "scheme" || key === "scene") state.added.clear();
      render(); return;
    }
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "theme") state.theme = state.theme === "light" ? "dark" : "light";
    if (act === "menu" && state.surface === "first") state.scene = state.scene === "menu" ? "normal" : "menu";
    if (act.startsWith("add:")) {
      const id = act.slice(4);
      if (state.surface === "remove" && id === "goals") state.scene = "readded";
      else { state.added.add(id); state.scene = "normal"; }
    }
    if (act.startsWith("pack:")) {
      ({ write: ["pages", "todo"], goal: ["goals", "todo"], code: ["coding", "pages"] })[act.slice(5)].forEach((id) => state.added.add(id));
      state.scene = "normal";
    }
    if (act === "remove") state.scene = state.scene === "asking" ? "removed" : "asking";
    if (act === "cancel") state.scene = "idle";
    if (act === "readd") state.scene = "readded";
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.surface === "remove" && state.scene === "asking") { state.scene = "idle"; render(); }
  });

  document.getElementById("icons").innerHTML = window.mwKitSprite;
  render();
  const client = document.createElement("script");
  client.textContent = window.mwKitClient;
  document.body.appendChild(client);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.resolvedTheme = state.theme;
})();
