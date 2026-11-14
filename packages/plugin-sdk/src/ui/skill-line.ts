import { renderButton } from "./button.js";
import { cx, escapeHtml } from "./html.js";
import { renderMenuItem } from "./overlay.js";

/** One Skill a round used, as `SkillPick` (contracts `services/skills`) has it: the exact reference, its name, and who chose it. */
export interface SkillLinePick {
  ref: unknown;
  name: string;
  picked: "named" | "auto";
}

/** The line's own words, in the page's language: the page passes its texts, the line holds none. */
export interface SkillLineWords {
  /** Before the Skills: 「用了」. */
  used: string;
  /** After a Skill's name: 「自动选的」 and 「你点名的」. */
  auto: string;
  named: string;
  /** When the round used none: 「这一轮没用技能」, and the button to choose one for another round: 「选一个」. */
  none: string;
  choose: string;
}

/**
 * The Skills one round used, one line above its reply (specs/prologue-strategies/skill.md SKL-11): each Skill a button with its name
 * and who chose it; a round that used none says so and offers to choose one. The buttons carry `data-skill-pick` (the Skill's place
 * in `picks`, empty on 「选一个」) and the line `data-skill-round` (the page's own mark for the round); the page opens the shell's
 * 「依据」 panel from them (`molis:skill-pick-open`) and never draws that panel itself. Markup only: no words, no behaviour.
 */
export function renderSkillLine(options: { picks: readonly SkillLinePick[]; round: string; words: SkillLineWords; className?: string }): string {
  const { picks, words } = options;
  const open = (label: string, index: string, variant: "secondary" | "ghost") => renderButton({ label, variant, size: "sm", icon: "zap",
    attrs: { "data-skill-pick": index, "aria-haspopup": "dialog", "aria-expanded": "false" } });
  const body = picks.length
    ? `<span>${escapeHtml(words.used)}</span>` + picks.map((pick, index) => open(`${pick.name} · ${pick.picked === "auto" ? words.auto : words.named}`, String(index), "secondary")).join("")
    : `<span>${escapeHtml(words.none)}</span>` + open(words.choose, "", "ghost");
  return `<div class="${cx("mw-skill-line", options.className)}" data-slot="skill-line" data-skill-round="${escapeHtml(options.round)}" data-skill-picks="${escapeHtml(JSON.stringify(picks))}">${body}</div>`;
}

/** One thing the person can do from the 「依据」 panel: its words, and the id the panel's owner hears when it is pressed. */
export interface SkillWhyAction {
  id: string;
  label: string;
  detail?: string;
}

/**
 * The inside of the 「依据」 panel of one Skill a round used (SKL-11): its name, why it was used, the facts to judge that by, then
 * what the person can do — in groups (「这一轮」, 「以后」, or the other Skills to use instead). The shell owns the panel and its
 * behaviour (apps/workbench `browser/skill-picks.ts`); this is its markup, so the component board shows the same thing. Each action is
 * a menu item with `data-skill-why-action="<id>"`.
 */
export function renderSkillWhy(options: { title?: string; reason?: string; facts?: ReadonlyArray<readonly [label: string, text: string]>; note?: string;
  groups: ReadonlyArray<{ label?: string; actions: readonly SkillWhyAction[]; empty?: string }> }): string {
  const action = (item: SkillWhyAction) => renderMenuItem({ label: item.label, ...(item.detail ? { description: item.detail, id: "skill-why-" + item.id } : {}), attrs: { "data-skill-why-action": item.id } });
  return (options.title ? `<h4>${escapeHtml(options.title)}</h4>` : "")
    + (options.reason ? `<p class="mw-skill-why__reason">${escapeHtml(options.reason)}</p>` : "")
    + (options.facts?.length ? `<dl class="mw-skill-why__facts">${options.facts.map(([label, text]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd>`).join("")}</dl>` : "")
    + (options.note ? `<p class="mw-skill-why__empty">${escapeHtml(options.note)}</p>` : "")
    + options.groups.map(group => `<div class="mw-skill-why__group" role="menu"${group.label ? ` aria-label="${escapeHtml(group.label)}"` : ""}>`
      + (group.label ? `<p class="mw-skill-why__label">${escapeHtml(group.label)}</p>` : "") + group.actions.map(action).join("")
      + (!group.actions.length && group.empty ? `<p class="mw-skill-why__empty">${escapeHtml(group.empty)}</p>` : "") + `</div>`).join("");
}
