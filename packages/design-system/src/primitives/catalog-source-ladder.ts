// The board's parts for a setting that falls back to a wider layer (docs/design/role-scope/README.md「组件板新增」, plan C decided
// by the user 2026-11-04): the source ladder that lays the layers out nearest first, and the quiet note under a control. Their rules
// are SOURCE_LADDER_STYLES in the served sheets, since the role settings in a project and in Settings draw them.
import { renderNote, renderSourceLadder, type MwSourceLayer } from "@molis-ai/molis-work-plugin-sdk/ui";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";


/** The four layers of a role, from nearest to farthest, each with where it stands in this specimen. */
function roleLadder(say: Say, states: readonly [MwSourceLayer["state"], MwSourceLayer["state"], MwSourceLayer["state"], MwSourceLayer["state"]], values: { project?: string; mine?: string } = {}): string {
  const names = [say("workbench.catalog-source-ladder.task"), say("workbench.catalog-source-ladder.project"), say("workbench.catalog-source-ladder.mine"), say("workbench.catalog-source-ladder.otherwise")];
  const shown = [say("workbench.catalog-source-ladder.task-only"), values.project ?? say("workbench.catalog-source-ladder.not-set"), values.mine ?? say("workbench.catalog-source-ladder.not-set"), say("workbench.catalog-source-ladder.assistant")];
  return renderSourceLadder({ label: say("workbench.catalog-source-ladder.label"), layers: names.map((name, index) => ({ name, value: shown[index]!, state: states[index]! })) });
}

export function sourceLadderSection(say: Say): string {
  const reviewer = say("workbench.catalog-source-ladder.reviewer"), researcher = say("workbench.catalog-source-ladder.researcher");
  return section("source-ladder", say("workbench.catalog-source-ladder.title"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-source-ladder.follows-mine"), roleLadder(say, ["empty", "empty", "on", "under"], { mine: researcher }))}
    ${specimen(say("workbench.catalog-source-ladder.project-own"), roleLadder(say, ["empty", "on", "under", "under"], { project: reviewer, mine: researcher }))}
    ${specimen(say("workbench.catalog-source-ladder.project-off"), roleLadder(say, ["empty", "off", "under", "on"], { project: say("workbench.catalog-source-ladder.weekly-off"), mine: researcher }))}
    ${specimen(say("workbench.catalog-source-ladder.nothing-set"), roleLadder(say, ["empty", "empty", "empty", "on"]))}
    ${specimen(say("workbench.catalog-source-ladder.long-value"), roleLadder(say, ["empty", "on", "under", "under"], { project: say("workbench.catalog-source-ladder.long-name"), mine: researcher }))}
  </div>`);
}

export function noteSection(say: Say): string {
  return section("note", say("workbench.catalog-source-ladder.note-title"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-source-ladder.note-plain"), renderNote({ text: say("workbench.catalog-source-ladder.note-narrow"), icon: "shield" }))}
    ${specimen(say("workbench.catalog-source-ladder.note-history"), renderNote({ text: say("workbench.catalog-source-ladder.note-restore"), icon: "history" }))}
    ${specimen(say("workbench.catalog-source-ladder.note-warning"), renderNote({ text: say("workbench.catalog-source-ladder.note-warn-text"), tone: "warning", icon: "circle-alert" }))}
  </div>`);
}
