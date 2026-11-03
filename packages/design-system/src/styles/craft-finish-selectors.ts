// The selector fragments the Soft Workbench finish layer writes its rules against.

export const WORKBENCH = "body.immersive-workbench";
/** The shell outside a pane. The component board's bar stage takes the same rules so its specimen is the real bar. */
export const SHELL = ":is(body.immersive-workbench:not([data-pane-embedded]), .mw-catalog-bar-stage)";
/** The resident Assistant lives in the workbench bar; the chooser's bar is the same bar (body.immersive-workbench.arrival-page). */
export const ASSIST = "body.immersive-workbench:not([data-pane-embedded])";
export const RAIL_LINK = ":is(.plugin-rail, .workspace-chrome) :is(.immersive-plugin-link, .navigator-project-search, .navigator-project-settings, .navigator-directory-toggle, .immersive-show-directory, .personal-account)";
export const PAGES = "body:is(.immersive-workbench, .settings-page, .project-preferences-page)";
/** A plugin's list page (not Feed or Coding, which lay out their own columns; not Jelly's calendar). */
export const STAGE_SHELL = "body.immersive-workbench .plugin-stage-shell:not([data-feed-stage-shell], .mw-layout-primitives, [data-work-surface=\"jelly\"])";
export const STAGE_LIST = `${STAGE_SHELL}[data-expanded="false"] > .plugin-stage-list`;
export const STAGE_OPEN = `${STAGE_SHELL}[data-expanded="true"]`;

/** Dialogs that open in the middle of the viewport. Edge sheets travel in from their edge instead. */
export const CENTRED_DIALOG = ":is(dialog.mw-dialog, dialog.global-search-dialog, dialog.runtime-plan-dialog, dialog.inbox-compose-dialog):not(.mw-sheet)";
