import { renderSkillLine, renderSkillWhy } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Say } from "./catalog-composer.js";
import { section, specimen } from "./catalog-parts.js";

// Skill selection (路线书第 41 批, specs/prologue-strategies/skill.md §10): the line of Skills a round used, and the shell's 「依据」
// panel. Both are the SDK's own markup (`renderSkillLine`, `renderSkillWhy`), so the board shows what the pages draw.

/** Board-only: the panel is a popover in the product; here it sits in the flow at its real width. */
export const SKILL_SELECTION_BOARD_STYLES = `
  .mw-catalog .mw-skill-why[data-preview] { position: static; display: block; box-shadow: var(--lift-2); }
`;

const words = (say: Say) => ({ used: say("workbench.skill-picks.used"), auto: say("workbench.skill-picks.auto"), named: say("workbench.skill-picks.named"),
  none: say("workbench.skill-picks.none"), choose: say("workbench.skill-picks.choose") });
const ref = (id: string) => ({ skill_id: id });

export function skillLineSection(say: Say): string {
  const review = say("workbench.catalog-skill-packs.write-the-weekly-review"), notes = say("workbench.catalog-skill-selection.meeting-notes");
  const line = (picks: Parameters<typeof renderSkillLine>[0]["picks"]) => renderSkillLine({ picks, round: "specimen", words: words(say) });
  return section("skill-line", say("workbench.catalog-skill-selection.skill-line"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-skill-selection.one-picked-by-ai"), line([{ ref: ref("review"), name: review, picked: "auto" }]))}
    ${specimen(say("workbench.catalog-skill-selection.named-and-picked"), line([{ ref: ref("notes"), name: notes, picked: "named" }, { ref: ref("review"), name: review, picked: "auto" }]))}
    ${specimen(say("workbench.catalog-skill-selection.none-used"), line([]))}
  </div>`);
}

export function skillWhySection(say: Say): string {
  const pick = (key: string) => say("workbench.skill-picks." + key);
  const panel = (body: string) => `<div class="mw-popover mw-skill-why" data-preview role="dialog"><div class="mw-skill-why__body">${body}</div></div>`;
  const review = say("workbench.catalog-skill-packs.write-the-weekly-review"), notes = say("workbench.catalog-skill-selection.meeting-notes");
  const why = renderSkillWhy({ title: review, reason: pick("why-auto"), facts: [
    [pick("what"), say("workbench.catalog-skill-selection.review-what")], [pick("when"), say("workbench.catalog-skill-selection.review-when")],
    [pick("from"), say("workbench.skill-picks.from-pack", { pack: say("workbench.catalog-skill-packs.weekly-reports-and-reviews"), version: "3" })], [pick("setting"), pick("state-auto")]],
    groups: [{ label: pick("this-round"), actions: [{ id: "swap", label: pick("swap"), detail: pick("swap-detail") }, { id: "plain", label: pick("plain"), detail: pick("plain-detail") }] },
      { label: pick("from-now"), actions: [{ id: "manual", label: pick("make-manual"), detail: pick("make-manual-detail") }, { id: "off", label: pick("turn-off"), detail: pick("turn-off-detail") }] }] });
  const others = renderSkillWhy({ groups: [{ actions: [{ id: "back", label: "‹ " + say("common.control.back") }] },
    { label: pick("others"), actions: [{ id: "notes", label: notes, detail: pick("state-manual") + " · " + say("workbench.catalog-skill-selection.notes-when") }] }] });
  const empty = renderSkillWhy({ groups: [{ label: pick("others"), actions: [], empty: pick("no-others") }] });
  // The same panel drawn a second time on the board names its own items (UIC-04: no described item's id twice on a page).
  const failed = why.replaceAll('"skill-why-', '"skill-why-failed-') + `<div class="mw-alert" role="alert"><p>${pick("failed")}</p><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm">${say("common.control.retry")}</button></div>`;
  return section("skill-why", say("workbench.catalog-skill-selection.skill-why"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-skill-selection.why-and-what-to-do"), panel(why))}
    ${specimen(say("workbench.catalog-skill-selection.use-another"), panel(others))}
    ${specimen(say("workbench.catalog-skill-selection.no-other"), panel(empty))}
    ${specimen(say("workbench.catalog-skill-selection.save-failed"), panel(failed))}
  </div>`);
}
