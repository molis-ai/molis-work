/**
 * Where things are (specs/archive/work-placement §4, §7.3): the placement bar beside an open object, its panel (location, who can
 * see it, linked work; use in a project, move, copy), the “存到…” labels on create entries, and the completion card a
 * plugin asks for when it made, imported, converted or exported something. Everything is read from the placement service;
 * a plugin only declares its current object (`data-assistant-context`) and leaves a `data-placement-slot`.
 */
import { pluginSearchRows } from "../../plugin-workbench.js";
import { SIDE_FILE_SOURCES_CLIENT_SCRIPT } from "../../side-file-sources-client.js";

export const PLACEMENT_FACTORY_SCRIPT = `(host) => {
  const { translate: readText, route, headers, openItem, openPluginRecord, itemTabs: ITEM_TABS } = host;
  /* The same rule as search: some plugins open an object as a tab, others by its row in their own list. */
  const RECORD_ROWS = ${JSON.stringify(pluginSearchRows().map(([plugin]) => plugin))};
  const here = () => document.body.dataset.projectId || null;
  const hereTitle = () => here() === "personal" ? globalThis.t.text("workbench.placement.personal-space") : (host.projectTitle ? globalThis.t.text("workbench.placement.project-name", { name: host.projectTitle }) : globalThis.t.text("workbench.placement.current-project"));
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined && text !== null) value.textContent = text; if (className) value.className = className; return value; };
  const ghost = (text) => { const value = node("button", text, "mw-btn mw-btn--ghost mw-btn--sm"); value.type = "button"; return value; };
  ${SIDE_FILE_SOURCES_CLIENT_SCRIPT}
  const api=(path,body,page)=>molisWorkRequest(route("/api/placement/"+path),{body,...(page?{headers:{"x-molis-context-page":page}}:{}),fallback:globalThis.t.text("workbench.placement.couldn-t-do-that-right-now-try-again")});
  let spaces = null;
  const loadSpaces = async () => { if (!spaces) spaces = (await api("spaces")).spaces || []; return spaces; };
  const cache = new Map();
  const keyOf = (object) => object.kind + ":" + object.id + ":" + (object.project_id || "");
  const describe = async (object, fresh, page) => {
    const key = (page || "") + keyOf(object), held = cache.get(key);
    if (!fresh && held && Date.now() - held.at < 15000) return held.value;
    const value = page ? await molisWorkRequest(route("/api/placement/describe"), {body:{object},headers:{"x-molis-plugin-page":page}}) : await api("describe", { object });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
  let relatedAt = 0, relatedShown;
  const invalidate = () => { cache.clear(); relatedAt = 0; document.querySelectorAll("[data-placement-slot]").forEach((slot) => { delete slot.dataset.placementPainted; }); };

  /* ---- The personal space is not a project: its home says so ---- */
  if (here() === "personal") {
    const homeLabel = globalThis.t.text("workbench.placement.personal-home");
    document.querySelectorAll('[data-work-surface="home"]').forEach((surface) => { surface.dataset.workSurfaceLabel = homeLabel; surface.setAttribute("aria-label", globalThis.t.text("workbench.placement.personal-space") + " · " + homeLabel); });
    let previousHomeLabel = "";
    document.querySelectorAll('[data-plugin-id="home"]').forEach((link) => {
      if (link.getAttribute("aria-label")) link.setAttribute("aria-label", homeLabel);
      if (link.getAttribute("title")) link.setAttribute("title", homeLabel);
      // The label span is the link's own direct span (immersive-shell marks it up as icon + span + hint); its text is the
      // value shown now, read before it is replaced, so nothing compares against a translation.
      const labelSpan = link.querySelector(":scope > span");
      if (labelSpan) { previousHomeLabel = labelSpan.textContent.trim(); labelSpan.textContent = homeLabel; }
    });
    if (previousHomeLabel) document.title = document.title.replace(previousHomeLabel, homeLabel);
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
  window.addEventListener("molis:surface-interaction", settle);
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
    // The one toast (.mw-toast), here with a title, a line and its follow-ups; done and failed carry their mark.
    const item = node("div", undefined, "mw-toast placement-toast" + (tone ? " placement-toast--" + tone : "") + (tone === "error" ? " is-error" : ""));
    if (tone) item.dataset.mwState = tone === "error" ? "failed" : "done";
    const text = node("div", undefined, "placement-toast-text");
    text.append(node("strong",title));if(detail){const line=node("small");if(typeof detail==="string")line.textContent=detail;else molisWorkRequest.show(line,detail);text.append(line);}
    item.append(text);
    for (const action of actions || []) {
      const button = node("button", action.label, "mw-toast__action" + (action.primary ? " mw-toast__action--primary" : ""));
      button.type = "button"; button.addEventListener("click", () => { item.remove(); action.run(); }); item.append(button);
    }
    const close = node("button", "×", "mw-toast__action placement-toast-close"); close.type = "button"; close.setAttribute("aria-label", globalThis.t.text("workbench.placement.dismiss"));
    close.addEventListener("click", () => item.remove()); item.append(close);
    region.append(item);
    while (region.children.length > 3) region.firstElementChild.remove();
    const timer = setTimeout(() => item.remove(), actions && actions.length ? 14000 : 7000);
    // Reaching for one of its buttons keeps the card (its text lets clicks through, so it gets no pointer events itself).
    item.querySelectorAll("button").forEach((button) => button.addEventListener("pointerenter", () => clearTimeout(timer), { once: true }));
    return item;
  };
  const followUps = (view) => {
    const list = [];
    if (!view || view.state !== "ok") return list;
    if (view.location && view.location.kind === "personal") {
      if (view.can.use_in_project) list.push({ label: globalThis.t.text("workbench.placement.use-project"), run: () => useInProject(view) });
      if (view.can.move) list.push({ label: globalThis.t.text("workbench.placement.move"), run: () => moveOrCopy(view, "move") });
    } else if (view.can.move) list.push({ label: globalThis.t.text("workbench.placement.move"), run: () => moveOrCopy(view, "move") });
    return list;
  };
  const named = (verb, title) => title ? readText("workbench.placement.verb-title", { verb, title }) : verb;
  const VERB = { created: "workbench.placement.created", imported: "workbench.placement.imported", generated: "workbench.placement.generated", converted: "workbench.placement.turned-into", versioned: "workbench.placement.saved-fixed-version", received: "workbench.placement.added-shelf" };
  window.addEventListener("molis:placement-result", async (event) => {
    const detail = event.detail || {};
    if (detail.verb === "exported") {
      const file = detail.file || {};
      card(globalThis.t.text("workbench.placement.exported-named", { name: file.name || detail.title || "" }), (file.format ? file.format + " · " : "") + globalThis.t.text("workbench.placement.file-browser-s-downloads"), [], "done");
      return;
    }
    if (detail.verb === "printed") { card(globalThis.t.text("workbench.placement.print-dialog-opened"), globalThis.t.text("workbench.placement.choose-save-pdf-print-dialog-get-pdf-file"), [], "done"); return; }
    if (detail.verb === "failed") { card(named(globalThis.t.text("workbench.placement.not-finished"), detail.title || ""), detail.note || "", [], "error"); return; }
    const object = detail.object ? { kind: detail.object.kind, id: detail.object.id, project_id: detail.object.project_id === undefined ? here() : detail.object.project_id } : null;
    let view = null;
    try { if (object) view = await describe(object, true); } catch { view = null; }
    const where = view && view.location ? view.location.title : hereTitle();
    const title = (detail.title || (view && view.title) || "");
    const head = named(globalThis.t.text(VERB[detail.verb] || "workbench.placement.saved"), title);
    const lines = [detail.verb === "versioned" ? (detail.note || "") : globalThis.t.text("workbench.placement.saved-place", { place: where }) + (view && view.location ? " · " + view.location.access_label : "")];
    if (detail.note && detail.verb !== "versioned") lines.push(detail.note);
    const actions = [];
    // A version just pinned opens in the 成果库, not the object it was pinned from (artifact-positioning walkthrough).
    const open = detail.open || (detail.verb === "versioned" && detail.artifact ? { surface: "artifacts", id: "/artifacts/" + encodeURIComponent(detail.artifact.artifact_id) + "/versions/" + detail.artifact.version, project_id: null } : null);
    if (open) actions.push({ label: globalThis.t.text("common.control.open"), primary: true, run: () => openObject(open, title) });
    else if (view && view.open && detail.verb !== "created") actions.push({ label: globalThis.t.text("common.control.open"), primary: true, run: () => openObject(view.open, title) });
    if (detail.verb !== "versioned") actions.push(...followUps(view));
    card(head, lines.filter(Boolean).join(" · "), actions.slice(0, 3), "done");
  });

  /* ---- A plugin asks for one of the shared dialogs about its object ---- */
  window.addEventListener("molis:placement-request", async (event) => {
    const detail = event.detail || {};
    if (!detail.object || !detail.object.id) return;
    const object = { kind: detail.object.kind, id: detail.object.id, project_id: detail.object.project_id === undefined ? here() : detail.object.project_id };
    try {
      const view = await describe(object, true);
      if (view.state !== "ok") { card(globalThis.t.text("workbench.placement.can-t-read-right-now"), view.reason || "", [], "error"); return; }
      if (detail.action === "use-in-project") await useInProject(view);
      else if (detail.action === "move" || detail.action === "copy") await moveOrCopy(view, detail.action);
    } catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-do-that-right-now"), error, [], "error"); }
  });

  /* ---- Converting: a plugin hands content over, the placement service makes the new object and records where it came from ---- */
  window.addEventListener("molis:placement-convert", async (event) => {
    const detail = event.detail || {};
    if (!detail.source || !detail.source.id || !(detail.station || detail.goal)) return;
    const source = { kind: detail.source.kind, id: detail.source.id, project_id: detail.source.project_id === undefined ? here() : detail.source.project_id };
    const to = detail.to_project_id || source.project_id || here();
    if (!to) { card(globalThis.t.text("workbench.placement.nowhere-save"), globalThis.t.text("workbench.placement.do-personal-space-project"), [], "error"); return; }
    try {
      const result = await api("convert", { source, to: detail.goal ? { goal: true } : { station: detail.station }, to_project_id: to, request_id: detail.request_id || crypto.randomUUID(),
        ...(detail.payload ? { payload: detail.payload } : {}) }, detail.page_id);
      invalidate(); repaint();
      card(named(detail.goal ? globalThis.t.text("workbench.placement.made-into-goal") : globalThis.t.text("workbench.placement.turned-into"), result.title), [globalThis.t.text("workbench.placement.saved-place", { place: result.location.title }), detail.note || globalThis.t.text("workbench.placement.original-stays-new-item-records-where-came")].filter(Boolean).join(" · "),
        result.open ? [{ label: globalThis.t.text("common.control.open"), primary: true, run: () => openObject(result.open, result.title) }] : [], "done");
      window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode: "convert", from: source, to: result.object } }));
    } catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-convert"), error, [], "error"); }
  });

  /* ---- “存到…” labels ---- */
  const paintTargets = (root) => {
    (root || document).querySelectorAll("[data-placement-target]").forEach((target) => {
      const home = target.dataset.placementTarget === "home";
      target.textContent = "";
      target.classList.add("placement-target");
      if (home) { target.append(node("span", globalThis.t.text("workbench.placement.put")), node("b", globalThis.t.text("workbench.placement.personal-space")), node("span", " · " + globalThis.t.text("workbench.placement.only"))); return; }
      target.append(node("span", globalThis.t.text("workbench.placement.new-items-saved")), node("b", hereTitle()));
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
    const where = node("span", "…", "placement-bar-where");
    const access = node("span", "", "placement-bar-access");
    const links = node("span", "", "placement-bar-links");
    // A plugin that shows its own save state leaves it out here (data-placement-saved="off").
    const saved = node("span", slot.dataset.placementSaved === "off" ? "" : context.unsaved ? globalThis.t.text("workbench.placement.unsaved") : globalThis.t.text("workbench.placement.saved"), "placement-bar-saved" + (context.unsaved ? " is-unsaved" : ""));
    if (saved.textContent) saved.dataset.mwState = context.unsaved ? "unsaved" : "saved";
    bar.append(where, access, links, saved);
    slot.append(bar);
    let view = null;
    try { view = await describe(object, false, slot.closest("[data-plugin-page]")?.dataset.pluginPage); } catch (error) { if(slot.isConnected&&slot.dataset.placementPainted===signature){where.textContent=globalThis.t.text("workbench.placement.location-unavailable");const note=node("p",undefined,"placement-read-error");molisWorkRequest.show(note,error);slot.append(note);}return; }
    if (slot.dataset.placementPainted !== signature) return;
    const location = view.location;
    where.textContent = location ? location.title : globalThis.t.text("workbench.placement.location-unavailable");
    access.textContent = location ? location.access_label : "";
    const count = view.associations.length;
    links.textContent = count ? globalThis.t.text("workbench.placement.count-linked", { count }) : "";
    links.hidden = !count;
    bar.dataset.kind = location ? location.kind : "unknown";
    bar.setAttribute("aria-label", globalThis.t.text("workbench.placement.location-links-named", { where: where.textContent, access: access.textContent }) + (count ? " · " + globalThis.t.text("workbench.placement.link-count", { n: count }) : "") + (saved.textContent ? " · " + saved.textContent : ""));
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
    let left = rect.left, bottom = rect.bottom, owner = anchor.ownerDocument.defaultView;
    while (owner && owner !== window) {
      const frame = owner.frameElement; if (!frame) break;
      const box = frame.getBoundingClientRect(); left += box.left; bottom += box.top;
      owner = frame.ownerDocument.defaultView;
    }
    const view = await describe(object, true);
    panel = node("section", undefined, "placement-panel mw-menu");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", globalThis.t.text("workbench.placement.where-lives"));
    panel.style.left = Math.max(8, Math.min(left, innerWidth - 400)) + "px";
    // In a short window the panel ends at the window's edge and scrolls, so its last actions stay reachable.
    const top = Math.min(bottom + 8, innerHeight - 120);
    panel.style.top = top + "px"; panel.style.maxHeight = innerHeight - Math.max(top + 8, 80) + "px";
    panel.append(node("h2", view.title, "placement-panel-title"));
    if (view.state !== "ok") panel.append(node("p", view.reason || globalThis.t.text("workbench.placement.can-t-read-right-now-2"), "placement-panel-warning"));
    const facts = node("dl", undefined, "placement-panel-facts");
    const fact = (label, value) => { facts.append(node("dt", label), node("dd", value)); };
    if (view.location) {
      fact(globalThis.t.text("workbench.placement.where-lives-2"), view.location.title);
      fact(globalThis.t.text("workbench.placement.who-can-see"), view.location.access === "home"
        ? globalThis.t.text("workbench.placement.only-can-open-change-assistants-workflows-clients-projects")
        : view.location.kind === "personal"
          ? globalThis.t.text("workbench.placement.only-assistants-runtimes-workflows-projects-can-t-read")
          : globalThis.t.text("workbench.placement.assistants-runtimes-workflows-authorized-clients-project"));
    }
    if (view.moved_from) fact(globalThis.t.text("workbench.placement.previously"), view.moved_from.title);
    panel.append(facts);
    panel.append(node("h3", globalThis.t.text("workbench.placement.linked-work")));
    const list = node("div", undefined, "placement-panel-links");
    if (!view.associations.length) list.append(node("p", globalThis.t.text("workbench.placement.none-yet-that-s-fine-can-organize-later"), "placement-panel-empty"));
    for (const link of view.associations) {
      const row = node("div", undefined, "placement-panel-link");
      row.append(node("span", link.label));
      const target = link.target;
      if (target.kind === "object" && target.state === "ok" && target.location) {
        const open = ghost(globalThis.t.text("common.control.open"));
        open.onclick = async () => { closePanel(); const other = await describe(target.object, true); openObject(other.open, other.title); };
        row.append(open);
      } else if (target.kind === "project") {
        const go = ghost(globalThis.t.text("workbench.placement.go-project"));
        go.onclick = () => { location.assign("/projects/" + encodeURIComponent(target.project_id) + "/"); };
        row.append(go);
      } else if (target.kind === "goal" && target.goal_id && (target.project_id || null) === here()) {
        const open = ghost(globalThis.t.text("common.control.open"));
        open.onclick = () => { closePanel(); openItem("goals", target.goal_id, target.title); };
        row.append(open);
      }
      if (link.removable && link.key) {
        const remove = ghost(globalThis.t.text("workbench.placement.remove-link"));
        remove.onclick = async () => {
          try {
            await api("unlink", { key: link.key }); invalidate(); closePanel(); repaint();
            card(globalThis.t.text("workbench.placement.link-removed"), globalThis.t.text("workbench.placement.only-link-was-removed-item-itself-its-copies"), [], "done");
          } catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-remove-link"), error, [], "error"); }
        };
        row.append(remove);
      }
      list.append(row);
    }
    panel.append(list);
    const actions = node("div", undefined, "placement-panel-actions");
    const action = (name, label, run, enabled, why) => { const button = node("button", label, "mw-btn mw-btn--secondary mw-btn--sm"); button.type = "button"; button.dataset.placementAction = name; button.disabled = !enabled; if (why) button.title = why; button.onclick = () => { closePanel(); run(); }; actions.append(button); };
    if (view.state === "ok") {
      action("use-in-project", globalThis.t.text("workbench.placement.use-project"), () => useInProject(view), view.can.use_in_project, globalThis.t.text("workbench.placement.no-other-projects-yet"));
      action("move", globalThis.t.text("workbench.placement.move"), () => moveOrCopy(view, "move"), view.can.move, view.object.project_id === null ? globalThis.t.text("workbench.placement.kind-item-only-lives-personal-space") : globalThis.t.text("workbench.placement.items-plugin-can-t-be-moved-yet"));
      action("copy", globalThis.t.text("workbench.placement.copy"), () => moveOrCopy(view, "copy"), view.can.copy, view.object.project_id === null ? globalThis.t.text("workbench.placement.kind-item-only-lives-personal-space") : globalThis.t.text("workbench.placement.items-plugin-can-t-be-copied-elsewhere-yet"));
      action("goal", globalThis.t.text("workbench.placement.link-goal"), () => bindToGoal(view), Boolean(view.object.project_id || here()), globalThis.t.text("workbench.placement.open-project-personal-space-first"));
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
    const cancel = node("button", globalThis.t.text("common.control.cancel"), "mw-btn mw-btn--secondary"); cancel.type = "button"; cancel.onclick = () => shell.close();
    const ok = node("button", confirm, "mw-btn mw-btn--primary"); ok.type = "submit"; ok.dataset.placementConfirm = "";
    footer.append(cancel, ok);
    form.append(header, content, error, footer);
    shell.append(form); document.body.append(shell);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); ok.disabled = true; error.textContent = "";
      try { await run(new FormData(form)); shell.close(); }
      catch (failure) { molisWorkRequest.show(error,failure); ok.disabled = false; }
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
  // A Goal takes an input one of two ways (specs/artifact-positioning 五.1, one entry): following the object as it changes, or
  // a version fixed now in the 成果库. A version that is already in the 成果库 is fixed by nature.
  const inputMode = () => {
    const set = node("fieldset", undefined, "placement-goal-mode"); set.append(node("legend", globalThis.t.text("workbench.placement.which-version-goal-uses")),
      choice("mode", "live", globalThis.t.text("workbench.placement.follow-original"), globalThis.t.text("workbench.placement.goal-sees-now"), true), choice("mode", "fixed", globalThis.t.text("workbench.placement.fix-version"), globalThis.t.text("workbench.placement.save-version-now-later-edits-original-don-t"), false));
    return set;
  };
  const takeAsInput = async (projectId, goalId, object, fixed) => {
    const base = "/projects/" + encodeURIComponent(projectId), ask = (path, body) => molisWorkRequest(base + path, { body, fallback: globalThis.t.text("workbench.placement.input-was-not-recorded") });
    // A file of the project's folders is read first: followed, the Goal keeps what was read so it can tell later that the original changed; fixed, that exact version is bound.
    const seen = object.kind === "workspace_file" ? (await ask("/api/materials/read", { ref: { subject: { kind: object.kind, id: object.id }, pin: { mode: "current", read_revision: "size:0" } }, mode: "head" })).read_revision : "";
    if (!fixed && object.kind !== "artifact") { await api("bind-goal", { object, project_id: projectId, goal_id: goalId, ...(seen ? { read_revision: seen } : {}) }); return; }
    if (object.kind === "workspace_file") {
      const at = object.id.indexOf(":");
      if (!/^[0-9a-f]{64}$/.test(seen)) throw new Error(globalThis.t.text("workbench.placement.long-pin"));
      const { ref } = await ask("/api/materials/capture", { workspace_id: object.id.slice(0, at), path: object.id.slice(at + 1).split("/"), fingerprint: seen });
      await ask("/api/plugins/io.molis.work.goals/goals/" + encodeURIComponent(goalId) + "/inputs", { action: "bind", ref });
      return;
    }
    let body = { subject: { kind: object.kind, id: object.id }, used: true };
    if (object.kind === "artifact") { const [artifact_id, version] = JSON.parse(object.id); body = { reference: { artifact_id, version }, used: true }; }
    await molisWorkRequest("/projects/"+encodeURIComponent(projectId)+"/api/plugins/io.molis.work.goals/goals/"+encodeURIComponent(goalId)+"/artifact-inputs",{body,fallback:globalThis.t.text("workbench.placement.input-was-not-recorded")});
  };
  // 「加输入…」 on a Goal: anything this project lists among its files, chosen here and taken one of the two ways.
  const addGoalInput = async (goalId) => {
    const read=path=>molisWorkRequest(route(path),{fallback:globalThis.t.text("workbench.placement.couldn-t-read-project-s-items")});
    const entries = [];
    try {
      // The same one request as the side panel (N52): every source with its first page.
      const { sources, pages } = await readSideFileSources(read);
      // Every source gets its share of the 80 rows, so one long source does not hide the others.
      const share = Math.ceil(80 / Math.max(1, sources.length));
      for (const source of sources) entries.push(...pages.get(source.id).items.filter((entry) => entry.subject).slice(0, share).map((entry) => ({ ...entry, group: source.title })));
    } catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-read-project-s-items"), error, [], "error"); return; }
    if (!entries.length) { card(globalThis.t.text("workbench.placement.nothing-here-can-be-used-input-yet"), globalThis.t.text("workbench.placement.create-one-goal-first-import-into-results"), [], "error"); return; }
    const rows = entries.slice(0, 80).map((entry, index) => choice("object", JSON.stringify(entry.subject), entry.title, entry.group, index === 0));
    dialog(globalThis.t.text("workbench.placement.add-input-goal"), globalThis.t.text("workbench.placement.versions-results-already-fixed-anything-else-can-follow"), [...rows, inputMode()], globalThis.t.text("workbench.placement.add"), async (data) => {
      const subject = JSON.parse(String(data.get("object") || "null"));
      if (!subject) throw new Error(globalThis.t.text("workbench.placement.choose-one-first"));
      await takeAsInput(here(), goalId, { ...subject, project_id: here() }, data.get("mode") === "fixed");
      invalidate();
      card(globalThis.t.text("workbench.placement.added-goal-s-inputs"), data.get("mode") === "fixed" || subject.kind === "artifact" ? globalThis.t.text("workbench.placement.goal-uses-version") : globalThis.t.text("workbench.placement.goal-follows-original"), [], "done");
    });
  };
  const useInProject = async (view) => {
    const all = await loadSpaces();
    const used = new Set(view.associations.filter(link => link.type === "used_in").map(link => link.target.project_id));
    const projects = all.filter(space => space.kind === "project" && space.project_id !== view.object.project_id);
    if (!projects.length) { card(globalThis.t.text("workbench.placement.no-project-yet"), globalThis.t.text("workbench.placement.once-have-project-can-use"), [], "error"); return; }
    const preferred = projects.find(space => space.project_id === here()) || projects[0];
    const rows = projects.map(space => choice("project", space.project_id, globalThis.t.text("workbench.placement.project-name", { name: space.title }),
      used.has(space.project_id) ? globalThis.t.text("workbench.placement.already-used-project") : (space.project_id === here() ? globalThis.t.text("workbench.placement.re-project") : ""), space.project_id === preferred.project_id));
    const note = node("p", view.location && view.location.access === "home"
      ? globalThis.t.text("workbench.placement.using-project-only-adds-link-project-home-lists")
      : globalThis.t.text("workbench.placement.using-project-only-adds-link-project-home-lists-2"), "placement-dialog-note");
    dialog(globalThis.t.text("workbench.placement.use-title-project", { title: view.title }), globalThis.t.text("workbench.placement.stays-place-project-only-gets-link", { place: view.location ? view.location.title : globalThis.t.text("workbench.placement.its-current-location") }), [...rows, note], globalThis.t.text("workbench.placement.use-project-2"), async (data) => {
      const projectId = String(data.get("project") || "");
      await api("link", { object: view.object, project_id: projectId }).catch((error) => dropGone("project", error));
      invalidate(); repaint();
      const space = projects.find(entry => entry.project_id === projectId);
      card(globalThis.t.text("workbench.placement.used-project-project", { project: space ? space.title : "" }), globalThis.t.text("workbench.placement.title-stays-place", { title: view.title, place: view.location ? view.location.title : "" }) + " · " + globalThis.t.text("workbench.placement.open-linked-materials-project-home"),
        projectId === here() ? [] : [{ label: globalThis.t.text("workbench.placement.go-project-2"), primary: true, run: () => location.assign("/projects/" + encodeURIComponent(projectId) + "/") }], "done");
    });
  };
  const moveOrCopy = async (view, mode) => {
    const all = await loadSpaces();
    const current = view.location ? view.location.project_id || "personal" : view.object.project_id;
    const kept = view.location && view.location.access === "home";
    const targets = all.filter(space => space.project_id !== current);
    if (!targets.length) { card(globalThis.t.text("workbench.placement.no-other-location"), globalThis.t.text("workbench.placement.create-project-first-then-move-copy"), [], "error"); return; }
    const links = view.associations.length;
    const rows = targets.map((space, index) => choice("to", space.project_id, space.kind === "personal" ? globalThis.t.text("workbench.placement.personal-space") : globalThis.t.text("workbench.placement.project-name", { name: space.title }),
      mode === "copy" ? globalThis.t.text("workbench.placement.new-copy-will-say-copied-place", { place: view.location ? view.location.title : "" })
        : kept ? (space.kind === "personal" ? globalThis.t.text("workbench.placement.becomes-yours-alone-no-longer-part-project-who") : globalThis.t.text("workbench.placement.becomes-part-project-listed-there-who-can-read"))
        : space.kind === "personal" ? globalThis.t.text("workbench.placement.after-moves-personal-space-assistants-runtimes-workflows-origina") : globalThis.t.text("workbench.placement.after-moves-project-that-project-s-assistants-runtimes"), index === 0));
    const body = [...rows];
    if (mode === "move" && links) body.push(node("p", globalThis.t.text("workbench.placement.has-count-count-they-all-stay-after-move", { count: links }), "placement-dialog-note"));
    dialog(mode === "move" ? globalThis.t.text("workbench.placement.move-title", { title: view.title }) : globalThis.t.text("workbench.placement.copy-title", { title: view.title }),
      mode === "move" ? globalThis.t.text("workbench.placement.moving-only-changes-where-s-stored-s-same") : globalThis.t.text("workbench.placement.creates-new-separate-item-changing-one-later-won"),
      body, mode === "move" ? globalThis.t.text("workbench.placement.move-2") : globalThis.t.text("common.control.copy"), async (data) => {
        const to = String(data.get("to") || "");
        if (mode === "move") { const flushing = { mode, object: view.object, settle: [] }; window.dispatchEvent(new CustomEvent("molis:placement-flush", { detail: flushing })); await Promise.all(flushing.settle); }
        const result = await api(mode, mode === "move" ? { object: view.object, to_project_id: to } : { object: view.object, to_project_id: to, request_id: crypto.randomUUID() })
          .catch((error) => dropGone("to", error));
        invalidate();
        const where = result.location ? result.location.title : "";
        window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: { mode, from: view.object, to: result.object } }));
        if (mode === "move" && view.open && host.closeItem && result.object.project_id !== here()) host.closeItem(view.open.surface, view.open.id);
        card(mode === "move" ? globalThis.t.text("workbench.placement.moved-place", { place: where }) : globalThis.t.text("workbench.placement.copied-place", { place: where }), named("", view.title).trim() + " · " + (mode === "move" ? globalThis.t.text("workbench.placement.s-no-longer-listed-old-location-all-links") : globalThis.t.text("workbench.placement.copied-place-2", { place: view.location ? view.location.title : "" })),
          result.open ? [{ label: globalThis.t.text("workbench.placement.open-new-location"), primary: true, run: () => openObject(result.open, view.title) }] : [], "done");
        repaint();
      });
  };

  /* ---- Goals: bind an object to a Goal, create straight into a Goal ---- */
  const bindToGoal = async (view) => {
    const home = view.object.project_id || here();
    const places = [home, ...view.associations.filter((link) => link.type === "used_in").map((link) => link.target.project_id), here()]
      .filter((id, index, all) => id && all.indexOf(id) === index);
    let spaces = [];
    try { spaces = (await api("spaces")).spaces || []; } catch { spaces = []; }
    const nameOf = (projectId) => {
      const space = spaces.find((entry) => entry.project_id === projectId);
      return !space ? "" : space.kind === "personal" ? globalThis.t.text("workbench.placement.personal-space") : globalThis.t.text("workbench.placement.project-name", { name: space.title });
    };
    const found = [];
    for (const projectId of places) {
      try { for (const goal of (await api("goals?project_id=" + encodeURIComponent(projectId))).goals || []) found.push({ goal_id: goal.goal_id, title: goal.title, project_id: projectId }); }
      catch (error) { if (projectId === home) { card(globalThis.t.text("workbench.placement.couldn-t-read-goals"), error, [], "error"); return; } }
    }
    if (!found.length) { card(globalThis.t.text("workbench.placement.no-goals-here-yet"), globalThis.t.text("workbench.placement.create-goal-goals-first-then-link-material"), [], "error"); return; }
    const bound = new Set(view.associations.filter((link) => link.type === "goal").map((link) => link.target.project_id + "|" + link.target.goal_id));
    const several = new Set(found.map((goal) => goal.project_id)).size > 1;
    const rows = found.slice(0, 60).map((goal, index) => choice("goal", goal.project_id + "|" + goal.goal_id, goal.title,
      [several ? nameOf(goal.project_id) : "", bound.has(goal.project_id + "|" + goal.goal_id) ? globalThis.t.text("workbench.placement.already-linked") : ""].filter(Boolean).join(" · "), index === 0));
    const where = home === "personal" ? globalThis.t.text("workbench.placement.personal-space") : globalThis.t.text("workbench.placement.project");
    dialog(globalThis.t.text("workbench.placement.link-title-goal", { title: view.title }), globalThis.t.text("workbench.placement.goal-s-inputs-will-list-stays-place-isn", { place: view.location ? view.location.title : where }), [...rows, inputMode()], globalThis.t.text("workbench.placement.link"), async (data) => {
      const [projectId, goalId] = String(data.get("goal") || "").split("|");
      await takeAsInput(projectId, goalId, view.object, data.get("mode") === "fixed");
      invalidate(); repaint();
      const goal = found.find((entry) => entry.project_id === projectId && entry.goal_id === goalId);
      // The Goal's materials are in its work view, not on the Frame canvas.
      const openGoal = () => {
        if (projectId === here()) { openItem("goals", goalId, goal ? goal.title : ""); if (host.openGoalWork) host.openGoalWork(); return; }
        const url = new URL("/projects/" + encodeURIComponent(projectId) + "/", location.origin);
        url.searchParams.set("openPlugin", "goals"); url.searchParams.set("openItem", goalId); url.searchParams.set("openView", "work");
        if (goal) url.searchParams.set("openTitle", goal.title);
        location.assign(url.pathname + url.search);
      };
      card(globalThis.t.text("workbench.placement.linked-goal-goal", { goal: goal ? goal.title : "" }), globalThis.t.text("workbench.placement.open-goal-s-inputs-where-s-stored-doesn"),
        [{ label: globalThis.t.text("workbench.placement.open-goal"), primary: true, run: openGoal }], "done");
    });
  };
  const paintMaterials = () => {
    document.querySelectorAll("[data-placement-material]:not([data-placement-filled])").forEach((row) => {
      row.dataset.placementFilled = "1";
      const state = row.querySelector("[data-placement-material-state]"), actions = row.querySelector(".placement-goal-material-actions");
      const object = { kind: row.dataset.placementKind, id: row.dataset.placementId, project_id: here() };
      void describe(object, false).then((view) => {
        const where = view.location ? view.location.title : "";
        state.textContent = view.state === "ok"
          ? (view.plugin ? view.plugin.title + " · " : "") + globalThis.t.text("workbench.placement.place", { place: where }) + (view.moved_from ? " · " + globalThis.t.text("workbench.placement.moved-place-2", { place: view.moved_from.title }) : "")
          : view.state === "missing" ? globalThis.t.text("workbench.placement.original-was-deleted") : (view.reason || globalThis.t.text("workbench.placement.can-t-read-right-now-2"));
        row.classList.toggle("is-gone", view.state !== "ok");
        // A project-folder file the Goal follows: what was read when it was taken is compared with the file now (SSC-28).
        const digest = row.dataset.goalInputDigest;
        if (view.state === "ok" && object.kind === "workspace_file" && digest !== undefined) {
          if (!digest) state.textContent += " · " + globalThis.t.text("workbench.placement.content-not-checked");
          else void molisWorkRequest(route("/api/materials/read"), { body: { ref: { subject: { kind: object.kind, id: object.id }, pin: { mode: "current", read_revision: digest.slice(7) } }, mode: "head" }, fallback: "" })
            .then((read) => { if (read.state === "changed") state.textContent += " · " + globalThis.t.text("workbench.placement.changed"); }).catch(() => {});
        }
        if (view.state === "ok" && view.open) {
          const open = ghost(globalThis.t.text("common.control.open"));
          open.onclick = () => openObject(view.open, view.title); actions.append(open);
        }
        const remove = ghost(view.state === "ok" ? globalThis.t.text("workbench.placement.remove-link") : globalThis.t.text("workbench.placement.clean-up"));
        remove.onclick = async () => {
          try {
            await api("unlink", { key: JSON.stringify(["goal", here(), row.dataset.goalId, row.dataset.placementBinding]) });
            row.remove(); invalidate();
            card(globalThis.t.text("workbench.placement.link-removed"), globalThis.t.text("workbench.placement.only-entry-goal-was-removed-material-itself-unchanged"), [], "done");
          } catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-remove-link"), error, [], "error"); }
        };
        actions.append(remove);
      }).catch((error) => { molisWorkRequest.show(state,error); });
    });
    // Versions the materials service fixed for a Goal: only whether the person can still read each is asked, never where it was.
    const fixed = [...document.querySelectorAll("[data-goal-material-snapshot]:not([data-placement-filled])")];
    if (!fixed.length) return;
    fixed.forEach((row) => { row.dataset.placementFilled = "1"; });
    const versions = fixed.map((row) => { try { const [artifact_id, version] = JSON.parse(row.dataset.goalMaterialSnapshot); return { artifact_id, version }; } catch { return null; } });
    void molisWorkRequest(route("/api/materials/pinned"), { body: { versions: versions.filter(Boolean) }, fallback: globalThis.t.text("workbench.placement.can-t-read-right-now-2") }).then(({ items }) => {
      let at = 0;
      fixed.forEach((row, index) => {
        const found = versions[index] ? items[at++] : null, gone = !found || !found.ref;
        row.classList.toggle("is-gone", gone);
        row.querySelector("[data-goal-material-snapshot-state]").textContent = gone ? globalThis.t.text("workbench.placement.unreadable") : "";
      });
    }).catch((error) => { fixed.forEach((row) => molisWorkRequest.show(row.querySelector("[data-goal-material-snapshot-state]"), error)); });
  };
  document.addEventListener("click", (event) => {
    const add = event.target.closest && event.target.closest("[data-goal-input-add]");
    if (add && here()) { event.preventDefault(); void addGoalInput(add.dataset.goalId); }
    // An input leaves the Goal, or a proposed one is accepted; the button carries the request and the words for a failure.
    const act = event.target.closest && event.target.closest("[data-goal-input-post]");
    if (act && here()) {
      event.preventDefault(); act.disabled = true;
      molisWorkRequest(route(act.dataset.goalInputPost),{body:JSON.parse(act.dataset.goalInputBody),fallback:globalThis.t.text("workbench.placement.couldn-t-do-that-right-now-try-again")})
        .then(() => {
          const row = act.closest("article"), done = act.dataset.goalInputDone;
          if (done) { row.querySelector("[data-goal-input-state]").textContent = done; act.parentNode.remove(); } else row.remove();
        })
        .catch((error) => { act.disabled = false; card(act.dataset.goalInputFail, error, [], "error"); });
    }
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest && event.target.closest("[data-placement-create]");
    if (!button || !here()) return;
    event.preventDefault();
    button.disabled = true;
    const station = button.dataset.placementCreate, goalId = button.dataset.goalId || null;
    // What this kind is called is the title its plugin's view declares; the button carries it (goal-inputs-html.ts), worded with that plugin's words.
    const kind = (button.textContent || "").trim() || (button.dataset.placementCreateTitle || "");
    try {
      const result = await api("create", { station, project_id: here(), goal_id: goalId, request_id: crypto.randomUUID(), title: globalThis.t.text("workbench.placement.untitled") + kind });
      invalidate();
      const section = button.closest("[data-placement-goal-materials]");
      if (section && result.goal_key) {
        const parts = JSON.parse(result.goal_key);
        const row = node("article", undefined, "placement-goal-material");
        row.dataset.placementMaterial = ""; row.dataset.placementKind = result.object.kind; row.dataset.placementId = result.object.id;
        row.dataset.placementBinding = parts[3]; row.dataset.goalId = parts[2];
        const text = node("div"); text.append(node("strong", result.title)); const state = node("small", globalThis.t.text("workbench.placement.loading")); state.dataset.placementMaterialState = ""; text.append(state);
        row.append(text, node("span", undefined, "placement-goal-material-actions"));
        let list = section.querySelector(".bound-list");
        if (!list) { list = node("div", undefined, "bound-list"); section.querySelector(".empty-row")?.replaceWith(list); }
        list.prepend(row); paintMaterials();
      }
      card(globalThis.t.text("workbench.placement.created-kind-title", { kind, title: result.title }), globalThis.t.text("workbench.placement.saved-place", { place: result.location.title }) + (goalId ? " · " + globalThis.t.text("workbench.placement.linked-goal") : ""),
        result.open ? [{ label: globalThis.t.text("common.control.open"), primary: true, run: () => openObject(result.open, result.title) }] : [], "done");
    } catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-create"), error, [], "error"); }
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
    box.append(node("h3", globalThis.t.text("workbench.placement.linked-materials-used-project-still-stored-where-they")));
    for (const item of items) {
      const row = node("div", undefined, "placement-related-row" + (item.state === "ok" ? "" : " is-gone"));
      const text = node("div");
      text.append(node("strong", item.title));
      const where = item.location ? item.location.title : "";
      const source = (item.plugin ? item.plugin.title + " · " : "") + (item.state === "ok"
        ? (where ? globalThis.t.text("workbench.placement.place", { place: where }) : "") + (item.location && item.location.kind === "personal" ? " · " + globalThis.t.text("workbench.placement.only-can-open") : "")
        : item.reason || globalThis.t.text("workbench.placement.can-t-read-right-now-2"));
      text.append(node("small", source));
      const actions = node("span", undefined, "placement-related-actions");
      if (item.state === "ok" && item.open) {
        const open = ghost(globalThis.t.text("common.control.open")); open.dataset.placementOpen = item.object.id;
        open.onclick = () => openObject(item.open, item.title); actions.append(open);
      } else {
        actions.append(node("span", item.state === "missing" ? globalThis.t.text("workbench.placement.original-was-deleted") : globalThis.t.text("workbench.placement.can-t-read-right-now-2"), "mw-status mw-status--" + (item.state === "missing" ? "blocked" : "attention")));
      }
      const remove = ghost(item.state === "ok" ? globalThis.t.text("workbench.placement.remove-link") : globalThis.t.text("workbench.placement.clean-up"));
      remove.onclick = async () => {
        try { await api("unlink", { key: item.key }); row.remove(); if (!box.querySelector(".placement-related-row")) box.hidden = true;
          card(item.state === "ok" ? globalThis.t.text("workbench.placement.link-removed") : globalThis.t.text("workbench.placement.link-cleaned-up"), globalThis.t.text("workbench.placement.only-link-record-was-removed-item-itself-unaffected"), [], "done"); }
        catch (error) { card(globalThis.t.text("workbench.placement.couldn-t-remove-link"), error, [], "error"); }
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
      // Read as the home comes into view or after invalidate, not on every repaint (W4-10).
      const home = document.querySelector('[data-work-surface="home"]'), shown = home && !home.hidden;
      if (shown && (!relatedShown || !relatedAt)) void paintRelated();
      relatedShown = shown;
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
      if (record.type === "attributes" || [...record.addedNodes].some(added => added.nodeType === 1 && (added.matches?.("[data-placement-slot],[data-placement-target],[data-placement-material],[data-goal-material-snapshot]") || added.querySelector?.("[data-placement-slot],[data-placement-target],[data-placement-material],[data-goal-material-snapshot]")))) { scheduleRepaint(); return; }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-assistant-context", "hidden", "data-expanded"] });
  // The workbench selects an item on a plugin's surface when a tab is applied; the plugin shows it a moment later.
  document.addEventListener("molis-work:select-item", () => { scheduleRepaint(); setTimeout(scheduleRepaint, 300); }, true);
  window.addEventListener("molis:assistant-effect", () => { invalidate(); repaint(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { invalidate(); repaint(); } });
  repaint();
  return { describe, openObject, repaint, card, paintBar, paintTargets };
}`;
