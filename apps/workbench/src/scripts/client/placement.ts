/**
 * Where things are (specs/archive/work-placement §4, §7.3): the placement bar beside an open object, its panel (location, who can
 * see it, linked work; use in a project, move, copy), the “存到…” labels on create entries, and the completion card a
 * plugin asks for when it made, imported, converted or exported something. Everything is read from the placement service;
 * a plugin only declares its current object (`data-assistant-context`) and leaves a `data-placement-slot`.
 */
import { SEARCH_ITEM_TAB_SURFACES } from "./global-search.js";
import { pluginSearchRows } from "../../plugin-workbench.js";

export const PLACEMENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, route, headers, openItem, openPluginRecord } = host;
  /* The same rule as search: some plugins open an object as a tab, others by its row in their own list. */
  const ITEM_TABS = ${JSON.stringify([...SEARCH_ITEM_TAB_SURFACES])};
  const RECORD_ROWS = ${JSON.stringify(pluginSearchRows().map(([plugin]) => plugin))};
  const here = () => document.body.dataset.projectId || null;
  const hereTitle = () => here() === "personal" ? L("个人空间") : (host.projectTitle ? L("项目「{name}」", { name: host.projectTitle }) : L("当前项目"));
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined && text !== null) value.textContent = text; if (className) value.className = className; return value; };
  const api = async (path, body) => {
    const response = await fetch(route("/api/placement/" + path), body === undefined ? { headers: headers() } : { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || L("暂时处理不了，请稍后重试"));
    return value;
  };
  let spaces = null;
  const loadSpaces = async () => { if (!spaces) spaces = (await api("spaces")).spaces || []; return spaces; };
  const cache = new Map();
  const keyOf = (object) => object.kind + ":" + object.id + ":" + (object.project_id || "");
  const describe = async (object, fresh) => {
    const key = keyOf(object), held = cache.get(key);
    if (!fresh && held && Date.now() - held.at < 15000) return held.value;
    const value = await api("describe", { object });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
  let relatedAt = 0;
  const invalidate = () => { cache.clear(); relatedAt = 0; document.querySelectorAll("[data-placement-slot]").forEach((slot) => { delete slot.dataset.placementPainted; }); };

  /* ---- The personal space is not a project: its home says so ---- */
  if (here() === "personal") {
    const homeLabel = L("个人首页");
    document.querySelectorAll('[data-work-surface="home"]').forEach((surface) => { surface.dataset.workSurfaceLabel = homeLabel; surface.setAttribute("aria-label", L("个人空间") + " · " + homeLabel); });
    document.querySelectorAll('[data-plugin-id="home"]').forEach((link) => {
      if (link.getAttribute("aria-label")) link.setAttribute("aria-label", homeLabel);
      if (link.getAttribute("title")) link.setAttribute("title", homeLabel);
      link.querySelectorAll("span").forEach((span) => { if (span.textContent.trim() === L("项目首页")) span.textContent = homeLabel; });
    });
    document.title = document.title.replace(L("项目首页"), homeLabel);
  }

  /* ---- Opening an object wherever it lives ---- */
  const openObject = (open, title) => {
    if (!open) return;
    const byRow = !ITEM_TABS.includes(open.surface) && RECORD_ROWS.includes(open.surface);
    if ((open.project_id || null) === here() || open.project_id === null) {
      if (byRow && openPluginRecord) openPluginRecord(open.surface, open.id); else openItem(open.surface, open.id, title || "");
      return;
    }
    const url = new URL("/projects/" + encodeURIComponent(open.project_id) + "/", location.origin);
    url.searchParams.set("openPlugin", open.surface);
    if (byRow) url.searchParams.set("openRecord", open.id);
    else { url.searchParams.set("openItem", open.id); if (title) url.searchParams.set("openTitle", title); }
    const desktop = new URLSearchParams(location.search).get("desktop"); if (desktop) url.searchParams.set("desktop", desktop);
    location.assign(url.pathname + url.search);
  };

  /* ---- Completion card ---- */
  const region = node("div", undefined, "placement-toasts"); region.setAttribute("role", "status"); region.setAttribute("aria-live", "polite");
  document.body.append(region);
  // Cards sit over the bottom of the stage, where plugins keep their composers: once the person moves on (types somewhere,
  // or presses outside a card) the informational ones step aside. Errors stay until closed. A plugin focusing a field does not count.
  const settle = (event) => {
    if (event.target && event.target.closest && event.target.closest(".placement-toasts")) return;
    region.querySelectorAll(".placement-toast:not(.placement-toast--error)").forEach((item) => item.remove());
  };
  document.addEventListener("input", settle, true);
  document.addEventListener("pointerdown", settle, true);
  // A card's buttons never sit on the stage's own controls (a composer's send button on a phone): when one would cover a
  // button or field underneath, the cards rise above it; with no room left they go to the top. When neither keeps every
  // control clear (a phone whose text field fills the stage under its toolbar), the cards may cover the field but still
  // never a button: covering part of a field is a nuisance, covering a button takes its press.
  const INTERACTIVE = "button, a[href], input, textarea, select, [contenteditable=true], [role=button]";
  const PRESSABLE = "button, a[href], select, [role=button], input:is([type=button], [type=submit], [type=checkbox], [type=radio])";
  const coveredLift = (selector) => {
    let lift = 0;
    region.querySelectorAll("button").forEach((button) => {
      const rect = button.getBoundingClientRect();
      if (!rect.width) return;
      for (const [x, y] of [[rect.left + 2, rect.top + 2], [rect.right - 2, rect.top + 2], [rect.left + 2, rect.bottom - 2], [rect.right - 2, rect.bottom - 2]]) {
        const under = document.elementsFromPoint(x, y).find((element) => !region.contains(element));
        const control = under && under.closest ? under.closest(selector) : null;
        if (control) lift = Math.max(lift, innerHeight - control.getBoundingClientRect().top + 8);
      }
    });
    return lift;
  };
  const place = (selector) => {
    region.style.bottom = ""; region.classList.remove("is-top");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const lift = coveredLift(selector);
      if (!lift) return true;
      if (lift > innerHeight - 160) { region.style.bottom = ""; region.classList.add("is-top"); return !coveredLift(selector); }
      region.style.bottom = lift + "px";
    }
    return !coveredLift(selector);
  };
  const clearControls = () => {
    if (!region.children.length) { region.style.bottom = ""; region.classList.remove("is-top"); return; }
    if (!place(INTERACTIVE) && !place(PRESSABLE)) { region.style.bottom = ""; region.classList.remove("is-top"); }
  };
  new MutationObserver(() => clearControls()).observe(region, { childList: true });
  window.addEventListener("resize", () => clearControls());
  const card = (title, detail, actions, tone) => {
    const item = node("div", undefined, "placement-toast" + (tone ? " placement-toast--" + tone : ""));
    const text = node("div", undefined, "placement-toast-text");
    text.append(node("strong", title)); if (detail) text.append(node("small", detail));
    item.append(text);
    for (const action of actions || []) {
      const button = node("button", action.label, "mw-btn mw-btn--sm " + (action.primary ? "mw-btn--primary" : "mw-btn--secondary"));
      button.type = "button"; button.addEventListener("click", () => { item.remove(); action.run(); }); item.append(button);
    }
    const close = node("button", "×", "mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only placement-toast-close"); close.type = "button"; close.setAttribute("aria-label", L("关闭提示"));
    close.addEventListener("click", () => item.remove()); item.append(close);
    region.append(item);
    while (region.children.length > 3) region.firstElementChild.remove();
    const timer = setTimeout(() => item.remove(), actions && actions.length ? 14000 : 7000);
    // Reaching for one of its buttons keeps the card (its text lets clicks through, so it gets no pointer events itself).
    item.querySelectorAll("button").forEach((button) => button.addEventListener("pointerenter", () => clearTimeout(timer), { once: true }));
    return item;
  };
  const followUps = (description) => {
    const list = [];
    if (!description || description.state !== "ok") return list;
    if (description.location && description.location.kind === "personal") {
      if (description.can.use_in_project) list.push({ label: L("用于项目…"), run: () => useInProject(description) });
      if (description.can.move) list.push({ label: L("移到…"), run: () => moveOrCopy(description, "move") });
    } else if (description.can.move) list.push({ label: L("移到…"), run: () => moveOrCopy(description, "move") });
    return list;
  };
  const named = (verb, title) => title ? L("{verb}《{title}》", { verb, title }) : verb;
  const VERB = { created: "已新建", imported: "已导入", generated: "已生成", converted: "已转成", versioned: "已存为固定版本", received: "已放进 Shelf" };
  window.addEventListener("molis:placement-result", async (event) => {
    const detail = event.detail || {};
    if (detail.verb === "exported") {
      const file = detail.file || {};
      card(L("已导出") + " " + (file.name || detail.title || ""), (file.format ? file.format + " · " : "") + L("文件在浏览器的下载位置"), [], "done");
      return;
    }
    if (detail.verb === "printed") { card(L("已打开打印"), L("在打印窗口里选“存储为 PDF”即可得到 PDF 文件"), [], "done"); return; }
    if (detail.verb === "failed") { card(named(L("没有完成"), detail.title || ""), detail.note || "", [], "error"); return; }
    const object = detail.object ? { kind: detail.object.kind, id: detail.object.id, project_id: detail.object.project_id === undefined ? here() : detail.object.project_id } : null;
    let description = null;
    try { if (object) description = await describe(object, true); } catch { description = null; }
    const where = description && description.location ? description.location.title : hereTitle();
    const title = (detail.title || (description && description.title) || "");
    const head = named(L(VERB[detail.verb] || "已保存"), title);
    const lines = [detail.verb === "versioned" ? (detail.note || "") : L("存到 {place}", { place: where }) + (description && description.location ? " · " + L(description.location.access_label) : "")];
    if (detail.note && detail.verb !== "versioned") lines.push(detail.note);
    const actions = [];
    // A version just pinned opens in the 成果库, not the object it was pinned from (artifact-positioning walkthrough).
    const open = detail.open || (detail.verb === "versioned" && detail.artifact ? { surface: "artifacts", id: "/artifacts/" + encodeURIComponent(detail.artifact.artifact_id) + "/versions/" + detail.artifact.version, project_id: null } : null);
    if (open) actions.push({ label: L("打开"), primary: true, run: () => openObject(open, title) });
    else if (description && description.open && detail.verb !== "created") actions.push({ label: L("打开"), primary: true, run: () => openObject(description.open, title) });
    if (detail.verb !== "versioned") actions.push(...followUps(description));
    card(head, lines.filter(Boolean).join(" · "), actions.slice(0, 3), "done");
  });

  /* ---- A plugin asks for one of the shared dialogs about its object ---- */
  window.addEventListener("molis:placement-request", async (event) => {
    const detail = event.detail || {};
    if (!detail.object || !detail.object.id) return;
    const object = { kind: detail.object.kind, id: detail.object.id, project_id: detail.object.project_id === undefined ? here() : detail.object.project_id };
    try {
      const description = await describe(object, true);
      if (description.state !== "ok") { card(L("暂时读不到它"), description.reason || "", [], "error"); return; }
      if (detail.action === "use-in-project") await useInProject(description);
      else if (detail.action === "move" || detail.action === "copy") await moveOrCopy(description, detail.action);
    } catch (error) { card(L("暂时处理不了"), error.message, [], "error"); }
  });

  /* ---- Converting: a plugin hands content over, the placement service makes the new object and records where it came from ---- */
  window.addEventListener("molis:placement-convert", async (event) => {
    const detail = event.detail || {};
    if (!detail.source || !detail.source.id || !(detail.station || detail.goal)) return;
    const source = { kind: detail.source.kind, id: detail.source.id, project_id: detail.source.project_id === undefined ? here() : detail.source.project_id };
    const to = detail.to_project_id || source.project_id || here();
    if (!to) { card(L("没有可以存放的位置"), L("请在个人空间或项目里操作。"), [], "error"); return; }
    try {
      const result = await api("convert", { source, to: detail.goal ? { goal: true } : { station: detail.station }, to_project_id: to, request_id: detail.request_id || crypto.randomUUID(),
        ...(detail.payload ? { payload: detail.payload } : {}) });
      invalidate(); repaint();
      card(named(detail.goal ? L("已建成 Goal") : L("已转成"), result.title), [L("存到 {place}", { place: result.location.title }), detail.note || L("原来的内容不变，新内容里记着它从哪里来")].filter(Boolean).join(" · "),
        result.open ? [{ label: L("打开"), primary: true, run: () => openObject(result.open, result.title) }] : [], "done");
      window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode: "convert", from: source, to: result.object } }));
    } catch (error) { card(L("没能转成"), error.message, [], "error"); }
  });

  /* ---- “存到…” labels ---- */
  const paintTargets = (root) => {
    (root || document).querySelectorAll("[data-placement-target]").forEach((target) => {
      const home = target.dataset.placementTarget === "home";
      target.textContent = "";
      target.classList.add("placement-target");
      if (home) { target.append(node("span", L("放在")), node("b", L("个人空间")), node("span", " · " + L("只有你"))); return; }
      target.append(node("span", L("新建内容存到")), node("b", hereTitle()));
    });
  };

  /* ---- Bar and panel ---- */
  const contextOf = (slot) => {
    const surface = slot.closest("[data-assistant-context]");
    if (!surface) return null;
    try { return JSON.parse(surface.getAttribute("data-assistant-context") || "null"); } catch { return null; }
  };
  const objectOf = (slot, context) => context && context.object && context.object.id ? { kind: context.object.kind, id: context.object.id,
    project_id: slot.dataset.placementScope === "home" ? null : here() } : null;
  const paintBar = async (slot) => {
    const context = contextOf(slot), object = objectOf(slot, context);
    const signature = object ? keyOf(object) + ":" + (context.object.version || "") + ":" + (context.unsaved ? 1 : 0) : "";
    if (slot.dataset.placementPainted === signature) return;
    slot.dataset.placementPainted = signature;
    slot.textContent = "";
    if (!object) return;
    const bar = node("button", undefined, "placement-bar"); bar.type = "button";
    const where = node("span", L("…"), "placement-bar-where");
    const access = node("span", "", "placement-bar-access");
    const links = node("span", "", "placement-bar-links");
    // A plugin that shows its own save state leaves it out here (data-placement-saved="off").
    const saved = node("span", slot.dataset.placementSaved === "off" ? "" : context.unsaved ? L("尚未保存") : L("已保存"), "placement-bar-saved" + (context.unsaved ? " is-unsaved" : ""));
    bar.append(where, access, links, saved);
    slot.append(bar);
    let description = null;
    try { description = await describe(object, false); } catch (error) { where.textContent = L("位置读不到"); bar.title = error.message; return; }
    if (slot.dataset.placementPainted !== signature) return;
    const location = description.location;
    where.textContent = location ? location.title : L("位置读不到");
    access.textContent = location ? L(location.access_label) : "";
    const count = description.associations.length;
    links.textContent = count ? L("关联 {count}", { count }) : "";
    links.hidden = !count;
    bar.dataset.kind = location ? location.kind : "unknown";
    bar.setAttribute("aria-label", L("位置与关联") + "：" + where.textContent + "，" + access.textContent + (count ? "，" + L("关联") + " " + count : "") + (saved.textContent ? "，" + saved.textContent : ""));
    bar.onclick = (event) => { event.stopPropagation(); openPanel(bar, object); };
  };
  let panel = null;
  const closePanel = () => { if (panel) { panel.remove(); panel = null; } };
  document.addEventListener("pointerdown", (event) => { if (panel && !panel.contains(event.target) && !event.target.closest(".placement-bar")) closePanel(); }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && panel) { closePanel(); } });
  const openPanel = async (anchor, object) => {
    closePanel();
    // Measured now: the bar may be repainted (and this node replaced) while the description loads.
    const rect = anchor.getBoundingClientRect();
    const description = await describe(object, true);
    panel = node("section", undefined, "placement-panel mw-menu");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", L("放在哪里"));
    panel.style.left = Math.max(8, Math.min(rect.left, innerWidth - 400)) + "px";
    panel.style.top = Math.min(rect.bottom + 8, innerHeight - 120) + "px";
    panel.append(node("h2", description.title, "placement-panel-title"));
    if (description.state !== "ok") panel.append(node("p", description.reason || L("暂时读不到"), "placement-panel-warning"));
    const facts = node("dl", undefined, "placement-panel-facts");
    const fact = (label, value) => { facts.append(node("dt", label), node("dd", value)); };
    if (description.location) {
      fact(L("存放位置"), description.location.title);
      fact(L("谁能看到"), description.location.access === "home"
        ? L("只有你能打开和修改。各项目里获授权使用这个插件的助理、工作流和客户端可以读取它，授权在设置里管理。")
        : description.location.kind === "personal"
          ? L("只有你。项目里的助理、Runtime 和工作流读不到它，除非你把它移到项目或存一份到项目。")
          : L("这个项目里的助理、Runtime、工作流和已授权的客户端。"));
    }
    if (description.moved_from) fact(L("原来在"), description.moved_from.title);
    panel.append(facts);
    panel.append(node("h3", L("关联的工作")));
    const list = node("div", undefined, "placement-panel-links");
    if (!description.associations.length) list.append(node("p", L("还没有。放着也没关系，之后再整理。"), "placement-panel-empty"));
    for (const link of description.associations) {
      const row = node("div", undefined, "placement-panel-link");
      row.append(node("span", link.label));
      const target = link.target;
      if (target.kind === "object" && target.state === "ok" && target.location) {
        const open = node("button", L("打开"), "mw-btn mw-btn--ghost mw-btn--sm"); open.type = "button";
        open.onclick = async () => { closePanel(); const other = await describe(target.object, true); openObject(other.open, other.title); };
        row.append(open);
      } else if (target.kind === "project") {
        const go = node("button", L("去项目"), "mw-btn mw-btn--ghost mw-btn--sm"); go.type = "button";
        go.onclick = () => { location.assign("/projects/" + encodeURIComponent(target.project_id) + "/"); };
        row.append(go);
      } else if (target.kind === "goal" && target.goal_id && (target.project_id || null) === here()) {
        const open = node("button", L("打开"), "mw-btn mw-btn--ghost mw-btn--sm"); open.type = "button";
        open.onclick = () => { closePanel(); openItem("goals", target.goal_id, target.title); };
        row.append(open);
      }
      if (link.removable && link.key) {
        const remove = node("button", L("移除关联"), "mw-btn mw-btn--ghost mw-btn--sm"); remove.type = "button";
        remove.onclick = async () => {
          try {
            await api("unlink", { key: link.key }); invalidate(); closePanel(); repaint();
            card(L("已移除关联"), L("只去掉了关系；对象本身、复制品和固定版本都不变。"), [], "done");
          } catch (error) { card(L("没能移除关联"), error.message, [], "error"); }
        };
        row.append(remove);
      }
      list.append(row);
    }
    panel.append(list);
    const actions = node("div", undefined, "placement-panel-actions");
    const action = (name, label, run, enabled, why) => { const button = node("button", label, "mw-btn mw-btn--secondary mw-btn--sm"); button.type = "button"; button.dataset.placementAction = name; button.disabled = !enabled; if (why) button.title = why; button.onclick = () => { closePanel(); run(); }; actions.append(button); };
    if (description.state === "ok") {
      action("use-in-project", L("用于项目…"), () => useInProject(description), description.can.use_in_project, L("还没有其他项目"));
      action("move", L("移到…"), () => moveOrCopy(description, "move"), description.can.move, description.object.project_id === null ? L("这类内容只放在个人空间") : L("这个插件的内容还不能移动"));
      action("copy", L("复制到…"), () => moveOrCopy(description, "copy"), description.can.copy, description.object.project_id === null ? L("这类内容只放在个人空间") : L("这个插件的内容还不能复制到别处"));
      action("goal", L("关联到 Goal…"), () => bindToGoal(description), Boolean(description.object.project_id || here()), L("先打开一个项目或个人空间"));
    }
    panel.append(actions);
    document.body.append(panel);
    panel.querySelector("button")?.focus();
  };

  /* ---- Dialogs ---- */
  const dialog = (title, lede, body, confirm, run) => {
    const shell = node("dialog", undefined, "mw-dialog placement-dialog");
    const form = node("form", undefined, "placement-dialog-form"); form.method = "dialog";
    const header = node("header", undefined, "placement-dialog-head"); header.append(node("h2", title)); if (lede) header.append(node("p", lede));
    const content = node("div", undefined, "placement-dialog-body"); content.append(...body);
    const error = node("p", "", "placement-dialog-error"); error.setAttribute("role", "alert");
    const footer = node("footer", undefined, "placement-dialog-foot");
    const cancel = node("button", L("取消"), "mw-btn mw-btn--secondary"); cancel.type = "button"; cancel.onclick = () => shell.close();
    const ok = node("button", confirm, "mw-btn mw-btn--primary"); ok.type = "submit"; ok.dataset.placementConfirm = "";
    footer.append(cancel, ok);
    form.append(header, content, error, footer);
    shell.append(form); document.body.append(shell);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); ok.disabled = true; error.textContent = "";
      try { await run(new FormData(form)); shell.close(); }
      catch (failure) { error.textContent = failure.message; ok.disabled = false; }
    });
    shell.addEventListener("close", () => shell.remove());
    shell.showModal();
    return shell;
  };
  // A place that went away while the dialog was open leaves the choices, so it cannot be picked again; the error still shows.
  const dropGone = async (name, error) => {
    spaces = null;
    try {
      const now = new Set((await loadSpaces()).map((space) => space.project_id));
      const inputs = [...document.querySelectorAll('dialog.placement-dialog input[name="' + name + '"]')];
      inputs.forEach((input) => { if (!now.has(input.value)) input.closest(".placement-choice")?.remove(); });
      const left = inputs.filter((input) => input.isConnected);
      if (left.length && !left.some((input) => input.checked)) left[0].checked = true;
    } catch {}
    throw error;
  };
  const choice = (name, value, title, detail, checked) => {
    const label = node("label", undefined, "placement-choice");
    const input = node("input"); input.type = "radio"; input.name = name; input.value = value; input.checked = !!checked;
    const text = node("span"); text.append(node("strong", title), node("small", detail));
    label.append(input, text); return label;
  };
  const useInProject = async (description) => {
    const all = await loadSpaces();
    const used = new Set(description.associations.filter(link => link.type === "used_in").map(link => link.target.project_id));
    const projects = all.filter(space => space.kind === "project" && space.project_id !== description.object.project_id);
    if (!projects.length) { card(L("还没有项目"), L("建好项目后就能把它用于项目。"), [], "error"); return; }
    const preferred = projects.find(space => space.project_id === here()) || projects[0];
    const rows = projects.map(space => choice("project", space.project_id, L("项目「{name}」", { name: space.title }),
      used.has(space.project_id) ? L("已经用于这个项目") : (space.project_id === here() ? L("你正在这个项目里") : ""), space.project_id === preferred.project_id));
    const note = node("p", description.location && description.location.access === "home"
      ? L("用于项目只是建立关联：项目首页的“关联资料”会列出它，你在项目里能直接打开，看到的总是最新内容。它仍在你的个人空间，项目里的助理按你给这个插件的授权读取。")
      : L("用于项目只是建立关联：项目首页的“关联资料”会列出它，你在项目里能直接打开，看到的总是最新内容。它仍在原位置，项目里的助理和 Runtime 读不到正文；需要它们读到时，用“移到…”把它放进项目。"), "placement-dialog-note");
    dialog(L("把《{title}》用于项目", { title: description.title }), L("它仍然放在 {place}，只是和项目建立关联。", { place: description.location ? description.location.title : L("原来的位置") }), [...rows, note], L("用于项目"), async (data) => {
      const projectId = String(data.get("project") || "");
      await api("link", { object: description.object, project_id: projectId }).catch((error) => dropGone("project", error));
      invalidate(); repaint();
      const space = projects.find(entry => entry.project_id === projectId);
      card(L("已用于项目「{project}」", { project: space ? space.title : "" }), L("《{title}》仍在 {place}", { title: description.title, place: description.location ? description.location.title : "" }) + " · " + L("项目首页的“关联资料”可以打开"),
        projectId === here() ? [] : [{ label: L("去项目看看"), primary: true, run: () => location.assign("/projects/" + encodeURIComponent(projectId) + "/") }], "done");
    });
  };
  const moveOrCopy = async (description, mode) => {
    const all = await loadSpaces();
    // Not where it is now: its partition, or where a Home-kept object belongs (the personal space when it belongs nowhere).
    const current = description.location ? description.location.project_id || "personal" : description.object.project_id;
    const kept = description.location && description.location.access === "home";
    const targets = all.filter(space => space.project_id !== current);
    if (!targets.length) { card(L("没有别的位置"), L("建好项目后再移动或复制。"), [], "error"); return; }
    const links = description.associations.length;
    const rows = targets.map((space, index) => choice("to", space.project_id, space.kind === "personal" ? L("个人空间") : L("项目「{name}」", { name: space.title }),
      mode === "copy" ? L("新的一份会写上“复制自 {place}”。", { place: description.location ? description.location.title : "" })
        : kept ? (space.kind === "personal" ? L("算作你个人的，不再属于哪个项目；谁能读取它仍按你给这个插件的授权。") : L("算作这个项目的，在这个项目里列出；谁能读取它仍按你给这个插件的授权。"))
        : space.kind === "personal" ? L("移到个人空间后，原项目里的助理、Runtime 和工作流将读不到它。") : L("移到项目后，这个项目里的助理、Runtime 和工作流能读取它。"), index === 0));
    const body = [...rows];
    if (mode === "move" && links) body.push(node("p", L("它现在有 {count} 项关联，移动后都保留。", { count: links }), "placement-dialog-note"));
    dialog(mode === "move" ? L("移动《{title}》", { title: description.title }) : L("复制《{title}》", { title: description.title }),
      mode === "move" ? L("移动只改存放位置：还是同一份内容，关联和引用继续有效。") : L("得到一份新的、独立的内容；之后改哪一份都不影响另一份。"),
      body, mode === "move" ? L("移动") : L("复制"), async (data) => {
        const to = String(data.get("to") || "");
        const result = await api(mode, mode === "move" ? { object: description.object, to_project_id: to } : { object: description.object, to_project_id: to, request_id: crypto.randomUUID() })
          .catch((error) => dropGone("to", error));
        invalidate();
        const where = result.location ? result.location.title : "";
        window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode, from: description.object, to: result.object } }));
        if (mode === "move" && description.open && host.closeItem && result.object.project_id !== here()) host.closeItem(description.open.surface, description.open.id);
        card(mode === "move" ? L("已移到 {place}", { place: where }) : L("已复制到 {place}", { place: where }), named("", description.title).trim() + " · " + (mode === "move" ? L("原位置不再列出它；关联都还在") : L("复制自 {place}", { place: description.location ? description.location.title : "" })),
          result.open ? [{ label: L("在新位置打开"), primary: true, run: () => openObject(result.open, description.title) }] : [], "done");
        repaint();
      });
  };

  /* ---- Goals: bind an object to a Goal, create straight into a Goal ---- */
  const bindToGoal = async (description) => {
    const home = description.object.project_id || here();
    // Goals where it lives first, then in projects it is used in, then in the one open now: a personal note used in a project can serve that project's Goal.
    const places = [home, ...description.associations.filter((link) => link.type === "used_in").map((link) => link.target.project_id), here()]
      .filter((id, index, all) => id && all.indexOf(id) === index);
    let spaces = [];
    try { spaces = (await api("spaces")).spaces || []; } catch { spaces = []; }
    const nameOf = (projectId) => {
      const space = spaces.find((entry) => entry.project_id === projectId);
      return !space ? "" : space.kind === "personal" ? L("个人空间") : L("项目「{name}」", { name: space.title });
    };
    const found = [];
    for (const projectId of places) {
      try { for (const goal of (await api("goals?project_id=" + encodeURIComponent(projectId))).goals || []) found.push({ goal_id: goal.goal_id, title: goal.title, project_id: projectId }); }
      catch (error) { if (projectId === home) { card(L("读不到目标"), error.message, [], "error"); return; } }
    }
    if (!found.length) { card(L("这里还没有目标"), L("先在 Goals 里建一个目标，再把资料关联过去。"), [], "error"); return; }
    const bound = new Set(description.associations.filter((link) => link.type === "goal").map((link) => link.target.project_id + "|" + link.target.goal_id));
    const several = new Set(found.map((goal) => goal.project_id)).size > 1;
    const rows = found.slice(0, 60).map((goal, index) => choice("goal", goal.project_id + "|" + goal.goal_id, goal.title,
      [several ? nameOf(goal.project_id) : "", bound.has(goal.project_id + "|" + goal.goal_id) ? L("已经关联") : ""].filter(Boolean).join(" · "), index === 0));
    const where = home === "personal" ? L("个人空间") : L("本项目");
    dialog(L("把《{title}》关联到 Goal", { title: description.title }), L("目标的“资料”里会记下它；它仍放在 {place}，不会复制或移动。", { place: description.location ? description.location.title : where }), rows, L("关联"), async (data) => {
      const [projectId, goalId] = String(data.get("goal") || "").split("|");
      await api("bind-goal", { object: description.object, project_id: projectId, goal_id: goalId });
      invalidate(); repaint();
      const goal = found.find((entry) => entry.project_id === projectId && entry.goal_id === goalId);
      // The Goal's materials are in its work view, not on the Frame canvas.
      const openGoal = () => {
        if (projectId === here()) { openItem("goals", goalId, goal ? goal.title : ""); if (host.openGoalWork) host.openGoalWork(); return; }
        const url = new URL("/projects/" + encodeURIComponent(projectId) + "/", location.origin);
        url.searchParams.set("openPlugin", "goals"); url.searchParams.set("openItem", goalId); url.searchParams.set("openGoalView", "work");
        if (goal) url.searchParams.set("openTitle", goal.title);
        location.assign(url.pathname + url.search);
      };
      card(L("已关联到 Goal「{goal}」", { goal: goal ? goal.title : "" }), L("目标的“资料”里能打开它；它的存放位置不变"),
        [{ label: L("打开 Goal"), primary: true, run: openGoal }], "done");
    });
  };
  const paintMaterials = () => {
    document.querySelectorAll("[data-placement-material]:not([data-placement-filled])").forEach((row) => {
      row.dataset.placementFilled = "1";
      const state = row.querySelector("[data-placement-material-state]"), actions = row.querySelector(".placement-goal-material-actions");
      const object = { kind: row.dataset.placementKind, id: row.dataset.placementId, project_id: here() };
      void describe(object, false).then((description) => {
        const where = description.location ? description.location.title : "";
        state.textContent = description.state === "ok"
          ? (description.plugin ? description.plugin.title + " · " : "") + L("放在 {place}", { place: where }) + (description.moved_from ? " · " + L("从 {place} 移来", { place: description.moved_from.title }) : "")
          : description.state === "missing" ? L("原对象已删除") : (description.reason || L("暂时读不到"));
        row.classList.toggle("is-gone", description.state !== "ok");
        if (description.state === "ok" && description.open) {
          const open = node("button", L("打开"), "mw-btn mw-btn--ghost mw-btn--sm"); open.type = "button";
          open.onclick = () => openObject(description.open, description.title); actions.append(open);
        }
        const remove = node("button", description.state === "ok" ? L("移除关联") : L("清理"), "mw-btn mw-btn--ghost mw-btn--sm"); remove.type = "button";
        remove.onclick = async () => {
          try {
            await api("unlink", { key: JSON.stringify(["goal", here(), row.dataset.goalId, row.dataset.placementBinding]) });
            row.remove(); invalidate();
            card(L("已移除关联"), L("只去掉了目标上的这条资料记录；资料本身不变。"), [], "done");
          } catch (error) { card(L("没能移除关联"), error.message, [], "error"); }
        };
        actions.append(remove);
      }).catch((error) => { state.textContent = error.message; });
    });
  };
  document.addEventListener("click", async (event) => {
    const button = event.target.closest && event.target.closest("[data-placement-create]");
    if (!button || !here()) return;
    event.preventDefault();
    button.disabled = true;
    const station = button.dataset.placementCreate, goalId = button.dataset.goalId || null;
    const names = { pages: L("文档"), ppt: L("演示稿"), form: L("问卷"), dataset: L("数据表") };
    try {
      const result = await api("create", { station, project_id: here(), goal_id: goalId, request_id: crypto.randomUUID(), title: L("未命名") + (names[station] || "") });
      invalidate();
      const section = button.closest("[data-placement-goal-materials]");
      if (section && result.goal_key) {
        const parts = JSON.parse(result.goal_key);
        const row = node("article", undefined, "placement-goal-material");
        row.dataset.placementMaterial = ""; row.dataset.placementKind = result.object.kind; row.dataset.placementId = result.object.id;
        row.dataset.placementBinding = parts[3]; row.dataset.goalId = parts[2];
        const text = node("div"); text.append(node("strong", result.title)); const state = node("small", L("正在读取…")); state.dataset.placementMaterialState = ""; text.append(state);
        row.append(text, node("span", undefined, "placement-goal-material-actions"));
        let list = section.querySelector(".bound-list");
        if (!list) { list = node("div", undefined, "bound-list"); section.querySelector(".empty-row")?.replaceWith(list); }
        list.prepend(row); paintMaterials();
      }
      card(L("已新建{kind}《{title}》", { kind: names[station] || "", title: result.title }), L("存到 {place}", { place: result.location.title }) + (goalId ? " · " + L("已关联到这个 Goal") : ""),
        result.open ? [{ label: L("打开"), primary: true, run: () => openObject(result.open, result.title) }] : [], "done");
    } catch (error) { card(L("没能新建"), error.message, [], "error"); }
    finally { button.disabled = false; }
  });

  /* ---- Project home: what from elsewhere is used here ---- */
  const paintRelated = async (attempt = 0) => {
    const box = document.querySelector("[data-placement-related]");
    if (!box || !here() || here() === "personal") return;
    relatedAt = Date.now();
    let items = [];
    try { items = (await api("related?project_id=" + encodeURIComponent(here()))).items || []; }
    catch {
      // The project may still be starting up; one later read settles it.
      if (attempt < 2) setTimeout(() => { void paintRelated(attempt + 1); }, 1500);
      return;
    }
    box.textContent = "";
    box.hidden = !items.length;
    if (!items.length) return;
    box.append(node("h3", L("关联资料 · 用于本项目，仍放在原来的位置")));
    for (const item of items) {
      const row = node("div", undefined, "placement-related-row" + (item.state === "ok" ? "" : " is-gone"));
      const text = node("div");
      text.append(node("strong", item.title));
      const where = item.location ? item.location.title : "";
      const source = (item.plugin ? item.plugin.title + " · " : "") + (item.state === "ok"
        ? (where ? L("放在 {place}", { place: where }) : "") + (item.location && item.location.kind === "personal" ? " · " + L("只有你能打开") : "")
        : item.reason || L("暂时读不到"));
      text.append(node("small", source));
      const actions = node("span", undefined, "placement-related-actions");
      if (item.state === "ok" && item.open) {
        const open = node("button", L("打开"), "mw-btn mw-btn--ghost mw-btn--sm"); open.type = "button"; open.dataset.placementOpen = item.object.id;
        open.onclick = () => openObject(item.open, item.title); actions.append(open);
      } else {
        actions.append(node("span", item.state === "missing" ? L("原对象已删除") : L("暂时读不到"), "mw-status mw-status--" + (item.state === "missing" ? "blocked" : "attention")));
      }
      const remove = node("button", item.state === "ok" ? L("移除关联") : L("清理"), "mw-btn mw-btn--ghost mw-btn--sm"); remove.type = "button";
      remove.onclick = async () => {
        try { await api("unlink", { key: item.key }); row.remove(); if (!box.querySelector(".placement-related-row")) box.hidden = true;
          card(item.state === "ok" ? L("已移除关联") : L("已清理这条关联"), L("只去掉了关系记录；对象本身不受影响。"), [], "done"); }
        catch (error) { card(L("没能移除关联"), error.message, [], "error"); }
      };
      actions.append(remove);
      row.append(text, actions);
      box.append(row);
    }
  };
  void paintRelated();
  window.addEventListener("focus", () => { void paintRelated(); });

  /* ---- Keep bars and labels current ---- */
  let queued = false;
  const repaint = () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.querySelectorAll("[data-placement-slot]").forEach((slot) => { if (!slot.closest("[hidden]")) void paintBar(slot); });
      paintTargets();
      paintMaterials();
      // The stage changed under the cards (a toolbar shown once its record exists): keep their buttons off its controls.
      if (region.children.length) clearControls();
      const home = document.querySelector('[data-work-surface="home"]');
      if (home && !home.hidden && Date.now() - relatedAt > 10000) void paintRelated();
    });
  };
  // One repaint per frame, whatever woke it: a plugin naming its object, a stage showing its detail (hidden, data-expanded), new slots.
  let repaintQueued = false;
  const scheduleRepaint = () => {
    if (repaintQueued) return;
    repaintQueued = true;
    requestAnimationFrame(() => { repaintQueued = false; repaint(); });
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" || [...record.addedNodes].some(added => added.nodeType === 1 && (added.matches?.("[data-placement-slot],[data-placement-target],[data-placement-material]") || added.querySelector?.("[data-placement-slot],[data-placement-target],[data-placement-material]")))) { scheduleRepaint(); return; }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-assistant-context", "hidden", "data-expanded"] });
  // The workbench selects an item on a plugin's surface when a tab is applied; the plugin shows it a moment later.
  document.addEventListener("molis-work:select-item", () => { scheduleRepaint(); setTimeout(scheduleRepaint, 300); }, true);
  window.addEventListener("molis:assistant-effect", () => { invalidate(); repaint(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { invalidate(); repaint(); } });
  repaint();
  return { describe, openObject, repaint, card };
}`;
