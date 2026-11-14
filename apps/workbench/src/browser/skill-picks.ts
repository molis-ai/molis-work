import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillCatalogEntry, SkillPick, SkillState } from "@molis-ai/molis-work-contracts/services/skills";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * What a page sends with `molis:skill-pick-open` (specs/prologue-strategies/skill.md §10): the round's Skills as its line shows them,
 * which one was pressed (null on 「选一个」), where the button is in the window, and the page's own mark for the round, which comes
 * back on `molis:skill-redo`. A framed page's box is moved into the window by its frame (plugin-frame/parent.ts).
 */
export interface SkillPickRequest {
  reply: string;
  consumer: "assistant" | "coding";
  picks: SkillPick[];
  index: number | null;
  box: { x: number; y: number; width: number; height: number };
}
/** The person's answer for another round of the same words: exactly these Skills (none: 「这次不用技能」), and no automatic ones. */
export interface SkillRedo { reply: string; named: Array<{ ref: SkillRef; name: string }> }

interface Ports {
  /** The project the shell is in; null in the personal space. */
  project: string | null;
  /** The shell's card toast, with its follow-up buttons (placement.ts). */
  card(title: string, detail: string, actions: Array<{ label: string; run(): void }>, tone: "done" | "error"): void;
}

declare const molisWorkRequest: <T>(path: string, options: { body: unknown }) => Promise<T>;
const say = (key: string, values?: Record<string, string | number>) => uiText.text("workbench.skill-picks." + key, values);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node;
};
const same = (a: SkillRef, b: SkillRef) => JSON.stringify(a) === JSON.stringify(b);
const STATE = { off: "state-off", auto: "state-auto", manual: "state-manual" } as const;

/**
 * The 「依据」 panel of a round's Skills (SKL-11): why one was used, and what the person can do about it — run the round again with
 * another or with none, or change how the Skill is used from now on (仅手动, 停用; each can be undone from the toast). It belongs to
 * the shell: a plugin's page cannot change the person's Skill settings, so it asks with `molis:skill-pick-open` and hears the choice
 * for another round on `molis:skill-redo`. The catalog is read when the panel opens; nothing here is kept.
 */
export function mountSkillPicks(ports: Ports): void {
  const api = <T>(home: boolean, path: string, body: unknown = {}) =>
    molisWorkRequest<T>((ports.project && !home ? "/projects/" + encodeURIComponent(ports.project) : "") + "/api/skills/" + path, { body });
  const redo = (request: SkillPickRequest, named: SkillRedo["named"]) => document.dispatchEvent(new CustomEvent<SkillRedo>("molis:skill-redo", { detail: { reply: request.reply, named } }));

  const open = (request: SkillPickRequest): void => {
    document.querySelector("[data-skill-why]")?.remove();
    const pick = request.index === null ? null : request.picks[request.index] ?? null;
    const pop = el("div", "mw-popover mw-skill-why"); pop.setAttribute("popover", "auto"); pop.setAttribute("role", "dialog"); pop.dataset.skillWhy = "";
    pop.setAttribute("aria-label", pick ? pick.name : say("choose"));
    const body = el("div", "mw-skill-why__body"), fail = el("div", "mw-alert"); fail.hidden = true; fail.setAttribute("role", "alert");
    pop.append(body, fail); document.body.append(pop);
    const place = () => {
      const { box } = request, width = pop.offsetWidth, height = pop.offsetHeight, gap = 6, edge = 8;
      const below = innerHeight - (box.y + box.height) - gap - edge, above = box.y - gap - edge, up = height > below && above > below;
      pop.style.maxHeight = `${Math.max(160, up ? above : below)}px`;
      pop.style.left = `${Math.max(edge, Math.min(box.x, innerWidth - width - edge))}px`;
      pop.style.top = `${up ? Math.max(edge, box.y - gap - Math.min(height, above)) : box.y + box.height + gap}px`;
    };
    const item = (label: string, desc: string, run: () => void) => {
      const button = el("button", "mw-menu__item"); button.type = "button"; button.setAttribute("role", "menuitem");
      const text = el("span"); text.dataset.slot = "menu-item-label"; text.append(el("span", "", label)); if (desc) text.append(el("small", "mw-menu__desc", desc));
      button.append(text); button.addEventListener("click", run); return button;
    };
    const group = (title: string, ...items: HTMLElement[]) => { const box = el("div", "mw-skill-why__group"); box.setAttribute("role", "menu"); box.setAttribute("aria-label", title); box.append(el("p", "mw-skill-why__label", title), ...items); return box; };
    const close = () => pop.hidePopover();
    const failed = (cause: unknown, retry: () => void) => {
      fail.hidden = false; const again = el("button", "mw-btn mw-btn--secondary mw-btn--sm", uiText.text("common.control.retry")); again.type = "button";
      again.addEventListener("click", () => { fail.hidden = true; retry(); });
      fail.replaceChildren(el("p", "", say("failed") + (cause instanceof Error && cause.message ? " " + cause.message : "")), again); place();
    };
    // Sets one Skill's state where its setting lives (the project's or the personal space's); the toast offers the way back.
    const setState = async (entry: SkillCatalogEntry, state: SkillState, undo: boolean): Promise<void> => {
      const home = entry.enabled?.scope === "home" || !ports.project, was = entry.state;
      try {
        const next = await api<SkillCatalogEntry>(home, "set", { scope: home ? "home" : "project", install_id: entry.ref.install_id, skill_id: entry.ref.skill_id, state, expected_revision: entry.settings_revision });
        close();
        ports.card(say(undo ? "restored" : state === "manual" ? "now-manual" : "now-off", { name: entry.name }), undo ? "" : say(state === "manual" ? "now-manual-detail" : "now-off-detail"),
          undo ? [] : [{ label: say("undo"), run: () => void setState({ ...next, enabled: entry.enabled }, was, true) }], "done");
      } catch (cause) {
        if (undo) ports.card(say("failed"), cause instanceof Error ? cause.message : "", [], "error"); else failed(cause, () => void setState(entry, state, false));
      }
    };
    // 「换一个重做」 and 「选一个」: the other Skills this page's rounds can use here, each with what it is for.
    const others = (all: SkillCatalogEntry[], keep: SkillRedo["named"], back?: () => void) => {
      const rows = all.filter(entry => entry.state !== "off" && entry.availability.available && (entry.applies_to === "both" || entry.applies_to === request.consumer)
        && !request.picks.some(used => same(used.ref, entry.ref)));
      const list = group(say("others"), ...rows.map(entry => item(entry.name, (entry.state === "manual" ? say("state-manual") + " · " : "") + (entry.when_to_use || entry.description),
        () => { close(); redo(request, [...keep, { ref: entry.ref, name: entry.name }]); })));
      if (!rows.length) list.append(el("p", "mw-skill-why__empty", say("no-others")));
      body.replaceChildren(...(back ? [item("‹ " + uiText.text("common.control.back"), "", back)] : []), list); place();
    };
    const draw = (all: SkillCatalogEntry[]) => {
      if (!pick) { others(all, request.picks.filter(used => used.picked === "named").map(({ ref, name }) => ({ ref, name }))); return; }
      const entry = all.find(row => same(row.ref, pick.ref)), head = el("h4", "", pick.name);
      const facts = el("dl", "mw-skill-why__facts"), fact = (label: string, text: string | undefined) => { if (text) facts.append(el("dt", "", say(label)), el("dd", "", text)); };
      fact("what", entry?.description); fact("when", entry?.when_to_use);
      fact("from", entry ? say("from-pack", { pack: entry.pack.title, version: entry.ref.version }) : undefined);
      fact("setting", entry ? say(STATE[entry.state]) : undefined);
      // The round again without this one: the Skills the person named stay, this one leaves, and the AI adds none of its own.
      const kept = request.picks.filter(used => used.picked === "named" && used !== pick).map(({ ref, name }) => ({ ref, name }));
      const menus = [group(say("this-round"), item(say("swap"), say("swap-detail"), () => others(all, kept, () => draw(all))), item(say("plain"), say("plain-detail"), () => { close(); redo(request, []); }))];
      if (entry && entry.state !== "off") menus.push(group(say("from-now"),
        ...(entry.state === "auto" ? [item(say("make-manual"), say("make-manual-detail"), () => void setState(entry, "manual", false))] : []),
        item(say("turn-off"), say("turn-off-detail"), () => void setState(entry, "off", false))));
      body.replaceChildren(head, el("p", "mw-skill-why__reason", say(pick.picked === "auto" ? "why-auto" : "why-named")),
        ...(entry ? [facts] : [el("p", "mw-skill-why__empty", say("gone"))]), ...menus); place();
    };
    pop.addEventListener("toggle", event => { if ((event as ToggleEvent).newState === "closed") pop.remove(); });
    body.append(el("p", "mw-skill-why__empty", say("loading"))); pop.showPopover(); place();
    const load = () => api<{ skills: SkillCatalogEntry[] }>(false, "list").then(listed => { if (pop.isConnected) draw(listed.skills); }, cause => { if (pop.isConnected) { body.replaceChildren(); failed(cause, () => void load()); } });
    void load();
  };
  document.addEventListener("molis:skill-pick-open", event => {
    const request = (event as CustomEvent<SkillPickRequest>).detail;
    if (!request || !Array.isArray(request.picks) || !request.box) return;
    event.preventDefault(); open(request);
  });
}
