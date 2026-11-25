import type { ContractDescriptor } from "./package.js";

export const platformDomEventsContract = {
  contractId: /* @version contract.io.molis.work.platform.dom-events "io.molis.work.platform.dom-events.v{version}" */ "io.molis.work.platform.dom-events.v1",
  kind: "platform",
  schemaVersion: /* @version contract.io.molis.work.platform.dom-events */ 1,
  maturity: "partial",
  ssot: "docs/platform/UI-PLATFORM.md",
} as const satisfies ContractDescriptor;

/**
 * The page-level event vocabulary of the Workbench: every `CustomEvent` that crosses a module boundary inside one page,
 * and the module that owns the page state each of them is about. The Workbench is one page made of a shell, plugin
 * surfaces and a few frames. The rule is that they pass no objects (docs/platform/UI-PLATFORM.md §3) and share this list
 * of names, a payload each, and one owner per piece of state. The page does not keep the rule everywhere yet: the
 * segments of the Workbench client share one scope and some of them read or set another owner's variables directly. The
 * page-events section of docs/platform/UI-PLATFORM.md lists the known gaps ("现状与例外"); this list does not claim they
 * are closed.
 *
 * The browser programs are template-literal strings, so they cannot import this file. It is checked against their source
 * instead: `scripts/gates/dom-events.mjs` (in `pnpm health:check`) fails when a `CustomEvent` is created, or a
 * prefixed event is listened to, under a name that is not listed here, when a listed name is neither sent nor heard
 * anywhere, and when an owner does not hold what it claims to own. An event is added by listing it here in the same
 * change that dispatches it.
 *
 * Not in scope: events created by the browser itself, `postMessage` types between the shell and its frames, the
 * `data-assistant-context` attribute, the `host` object handed to plugin client scripts, storage keys, `BroadcastChannel`
 * names (the one in use, `molis-work:model-ready`, carries a page event to the other tabs of the origin and is
 * recorded under that event), direct calls between the segments of the Workbench client, and state that no event
 * announces. Those are other channels with no registry yet.
 */

/**
 * The platform's own name prefixes: three styles grew side by side; the rename to one is a separate change that edits this
 * list and every name below. A plugin's events need no entry here: a name that starts with `molis-<owner>-` is valid when the
 * event's registered `owner` is exactly `<owner>` and all of that owner's files belong to one `plugins/<group>/<package>/`
 * directory (`molis-notes-saved` would be owned by `notes`). An owner mixing plugin and platform files, or different plugin
 * packages, must be split. The longest complete owner prefix wins. Every plugin gets the same treatment and this table
 * names none of them (ac-artifacts A4, PG-096). Platform owners use only the prefixes below.
 */
export const DOM_EVENT_PREFIXES = ["molis-work:", "molis:"] as const;

/**
 * The module that holds a piece of page state. The rule: it is the only place that changes it, and the one other modules
 * ask (a `request`) or listen to (an `announcement`). The gate checks the owner's side only (its files send the
 * announcements and handle the requests), not that nobody else reaches in; the known cases that do are listed in
 * docs/platform/UI-PLATFORM.md.
 */
export interface PageStateOwner {
  /**
   * Repository paths of the client modules that hold the state (the Workbench client is assembled from segment files, so
   * one owner can be more than one file). The gate checks each exists and that the owner dispatches or handles the
   * events listed under it.
   */
  readonly files: readonly string[];
  /** What the owner holds, in a sentence. */
  readonly state: string;
}

// The Host frame adapters relay these owners' announcements into an isolated document; they own no second copy of the state.
export const PAGE_STATE_OWNERS = {
  "character-picker": {
    files: ["apps/workbench/src/browser/characters/task-picker.ts"],
    state: "The task's role picker and its default and editor modes.",
  },
  "document-language": {
    files: ["apps/workbench/src/browser/language-entry.ts", "apps/workbench/src/browser/plugin-frame/language-child.ts", "packages/im-ui/src/browser/locale.ts"],
    state: "The displayed words and language of one document.",
  },
  "side-panel": {
    files: ["apps/workbench/src/side-panel-context.ts", "apps/workbench/src/side-panel.ts", "apps/workbench/src/side-panel-browser.ts", "apps/workbench/src/side-panel-files.ts", "apps/workbench/src/side-panel-help.ts"],
    state: "The right side's views, their documents and what each was asked to show (a file, a web page, help text, the browser held by the person or by a Work). Whether it is open, its tabs, the current one and its width are the tab workspace's state, not this owner's.",
  },
  "on-demand-help": {
    files: ["packages/design-system/src/browser/on-demand-help.ts"],
    state: "The active Scheme A on-demand help card, its trigger focus return, and skippable first-visit tips.",
  },
  assistant: {
    files: ["apps/workbench/src/scripts/client/assistant-island.ts", "apps/workbench/src/scripts/client/assistant-choosers.ts", "apps/workbench/src/scripts/client/assistant-browser-handback.ts", "apps/workbench/src/scripts/client/assistant-conversation.ts", "apps/workbench/src/scripts/client/assistant-page-messages.ts", "apps/workbench/src/scripts/client/assistant-send.ts", "apps/workbench/src/scripts/client/assistant-stage.ts", "apps/workbench/src/scripts/client/assistant-work-objects.ts", "apps/workbench/src/browser/plugin-frame/context-child.ts"],
    state: "The bottom Assistant: the Work it shows, the draft and the materials in its input, what waits on the person.",
  },
  "context-actions": {
    files: ["apps/workbench/src/scripts/client/context-actions.ts", "apps/workbench/src/scripts/client/context-bar.ts", "apps/workbench/src/scripts/client/context-bus.ts", "apps/workbench/src/scripts/client/context-card-target.ts", "apps/workbench/src/scripts/client/context-landing.ts", "apps/workbench/src/browser/plugin-frame/context-child.ts"],
    state: "What the person has in hand on the focused surface, where it would land on the left, the ranked actions offered for it, and the starters offered for the open Work.",
  },
  "task-float": {
    files: ["apps/workbench/src/browser/task-float-content.ts", "apps/workbench/src/browser/work-tasks.ts", "apps/workbench/src/browser/plugin-frame/task-parent.ts", "apps/workbench/src/browser/assistant-subtasks.ts"],
    state: "The existing task float and the lifetime of its trusted content mounts; task facts remain with their original service.",
  },
  "context-toolbar": {
    files: ["packages/design-system/src/context-toolbar.ts", "apps/workbench/src/browser/plugin-frame/context-child.ts"],
    state: "The toolbar next to what the person has in hand, in the document that owns it: the tools a plugin offered for the open context, and the small form under it.",
  },
  placement: {
    files: ["apps/workbench/src/scripts/client/placement.ts", "apps/workbench/src/scripts/client/pane-messages.ts", "apps/workbench/src/browser/plugin-frame/parent.ts", "apps/workbench/src/browser/plugin-frame/presentation.ts", "apps/workbench/src/browser/plugin-frame/context-child.ts"],
    state: "Where the objects on the page live (project, personal, Home) and the shared dialogs that use, move, copy or convert them.",
  },
  "tab-workspace": {
    files: ["apps/workbench/src/scripts/client/tab-workspace.ts", "apps/workbench/src/scripts/client/tab-workspace-panes.ts", "apps/workbench/src/scripts/client/tab-workspace-places.ts", "apps/workbench/src/scripts/client/tab-workspace-plugins.ts", "apps/workbench/src/scripts/client/system-tabs.ts", "apps/workbench/src/side-view-document.ts", "apps/workbench/src/plugin-document-shell.ts", "apps/workbench/src/browser/plugin-frame/view.ts"],
    state: "The open tabs and panes of the work area and of the right side (whether it is open, its tabs, the current one and its width: `side`, per project), the current place, and which item each plugin surface has been asked to show (a plugin's side tab is its own document, which asks its one surface the same way).",
  },
  "settings-directory": {
    files: ["apps/workbench/src/scripts/client/settings-directory.ts", "apps/workbench/src/scripts/home-model-settings.ts", "apps/workbench/src/settings-authorizations.ts", "apps/workbench/src/browser/plugin-frame/child.ts", "apps/workbench/src/browser/plugin-frame/review-permission.ts"],
    state: "The settings area: which global or project settings page is open, and the embedded settings pages inside it, including the standalone Home settings host.",
  },
  "automation-recommendations": {
    files: ["apps/workbench/src/scripts/client/automation-recommendations.ts"],
    state: "The project suggestions dialog, its selected project and the report it is showing.",
  },
  "settings-return": {
    files: ["apps/workbench/src/browser/settings-return.ts", "apps/workbench/src/browser/return-trips.ts"],
    state: "This window's return trips (specs/draft-and-return): where the person went into the settings from, what the settings had to make true and what goes back, kept in this tab's sessionStorage (molis-work:return-trips, molis-work:return-window, molis-work:return-window-handoff).",
  },
  attention: {
    files: ["apps/workbench/src/scripts/client/attention.ts"],
    state: "What waits on the person, read once for the whole page (W4-10): the background tasks the right side's background-tasks tab counts and lists, the Assistant's notices for the plugin in front, the plugin deliveries waiting in the market and, on a project page, the board's event cursor.",
  },
  "plugin-notifications": {
    files: ["apps/workbench/src/scripts/client/plugin-notifications.ts"],
    state: "Opening the market's recovery list on the plugin deliveries that wait.",
  },
  "plugin-event-recovery": {
    files: ["apps/workbench/src/scripts/client/plugin-event-recovery.ts"],
    state: "The recovery list of plugin deliveries the Runtime could not confirm, as the market read it last.",
  },
  "plugin-membership": {
    files: ["apps/workbench/src/scripts/client/plugin-membership.ts"],
    state: "Which plugins the project has, brought in line in place when one is added or removed.",
  },
  "immersive-navigation": {
    files: ["apps/workbench/src/scripts/client/immersive-navigation.ts"],
    state: "The application chrome around the work area, including the object work mode.",
  },
  "acceptance-column": {
    files: ["apps/workbench/src/browser/work-acceptance.ts"],
    state: "The requirement column beside the work surface: whose requirements it shows, read from the platform's acceptance, and what the person is writing in it.",
  },
  "composer-draft": {
    files: ["packages/design-system/src/browser/composer-drafts.ts"],
    state: "The draft that the mounted input has finished restoring from its owner.",
  },
  preferences: {
    files: ["packages/design-system/src/preferences.ts", "apps/workbench/src/browser/plugin-frame/child.ts"],
    state: "The person's display preferences on this device: theme, density and terminal theme (localStorage molis-work:theme, molis-work:density, molis-work:terminal-theme).",
  },
  appearance: {
    files: ["apps/workbench/src/browser/appearance-view.ts"],
    state: "The effective Home appearance that this document has finished preparing and rendered.",
  },
  shelf: {
    files: ["modules/shelf/src/surface/browser/document.ts", "modules/shelf/src/surface/browser/tui.ts", "modules/shelf/src/surface/browser/terminal.ts", "modules/shelf/src/surface/browser/settings/reload.ts"],
    state: "The Shelf surface: its list and selection, the notice line and the input to the terminal Agent.",
  },
  "character-run": {
    files: ["apps/workbench/src/browser/characters/import-client.ts"],
    state: "The Character run the person asked to open in a workspace (its fixed role package, task, workspace and Skills); a plugin whose surface carries data-character-run-target opens it (M6).",
  },
  "character-terminal": {
    files: ["apps/workbench/src/browser/characters/terminal.ts"],
    state: "The terminal that shows a Character run: which process it is attached to.",
  },
  "work-terminal": {
    files: ["apps/workbench/src/terminal/client-subject-events.ts"],
    state: "The object work terminal pane: which plugin object it is bound to, whether that object is read-only for terminal work, and its panels.",
  },
  "surface-landing": {
    files: ["apps/workbench/src/browser/plugin-frame/context.ts"],
    state: "The flash that shows where something in hand would land in an open document surface: asked of the surface that reported the landing, which any plugin surface may answer, and relayed out of a plugin frame by its adapter (M6).",
  },
  "knowledge-picker": {
    files: ["apps/workbench/src/browser/knowledge/picker.ts", "apps/workbench/src/browser/plugin-frame/materials-picker.ts"],
    state: "The one picker of project materials (specs/project-knowledge PMAT-17, materials-ui-contract §3): what it was asked for, the person's query, the file read beside the list and their picks until they confirm; for a plugin frame, the page's own request on the frame's behalf and the answer it relays into the frame.",
  },
  "skill-picks": {
    files: ["apps/workbench/src/browser/skill-picks.ts", "apps/workbench/src/browser/plugin-frame/skill-picks.ts"],
    state: "The one 「依据」 panel of a round's Skills (specs/prologue-strategies/skill.md §10): which round's line asked, the catalog as read when it opened, and the person's choice until they make it; for a plugin frame, the page's own mark for the round it asked about.",
  },
  "mainline-switcher": {
    files: [
      "apps/workbench/src/browser/mainline-switcher.ts",
      "apps/workbench/src/browser/work-item-page.ts",
      "apps/workbench/src/browser/work-item-contents.ts",
      "apps/workbench/src/scripts/client/top-corner.ts",
    ],
    state: "The current project's mainline work-item selection, switcher list, per-item counts, and 「放进事项」 picker dialog.",
  },
} as const satisfies Readonly<Record<string, PageStateOwner>>;

export type PageStateOwnerId = keyof typeof PAGE_STATE_OWNERS;

/**
 * - `announcement`: the owner reports a change of its own state, or hands something it decided to the others; the owner
 *   dispatches it and other modules listen.
 * - `request`: another module asks the owner to change its state; the owner listens and others dispatch. A surface that
 *   reports its own situation to the owner of the shared state about it (`molis:surface-focus`, `molis:assistant-surface-changed`)
 *   is a request too: the surface sends and the owner takes it into its state.
 */
export type DomEventKind = "announcement" | "request";

/**
 * Where the event is dispatched, and so where listeners attach. A `document` listener never hears an event dispatched on
 * `window`, and a `window` listener does not hear one dispatched on `document` or an element unless it bubbles (`bubbles`)
 * or the listener captures. Two modules that do not meet usually fail on exactly this.
 */
export type DomEventTarget = "window" | "document" | "element";

export interface DomEventDeclaration {
  /** The name as dispatched. One name, one meaning: two modules never dispatch the same name for different things. */
  readonly name: string;
  readonly kind: DomEventKind;
  readonly owner: PageStateOwnerId;
  readonly on: DomEventTarget;
  /** The event bubbles, so a listener on an ancestor (or on `document`) hears one dispatched on an element. */
  readonly bubbles?: true;
  /** A handler that takes the event calls `preventDefault()`; the sender reads that and falls back when nobody did. */
  readonly cancelable?: true;
  /** The `detail` payload: the field names, or the contract type that describes it. `none` when the event carries nothing. */
  readonly detail: string;
  /** What it means, in a sentence. */
  readonly summary: string;
}

/**
 * Every page event, in name order: 62 names at the time of listing, 159 dispatch sites and 149 listener sites on a page
 * prefix. Who dispatches and who listens is not written down here:
 * `node scripts/gates/dom-events.mjs --report` computes both from the source, so it cannot go stale.
 */
export const DOM_EVENTS = [
  {
    name: "molis-work:attention", kind: "announcement", owner: "attention", on: "document",
    detail: "the /api/attention answer ({ background_tasks: { tasks, issues }, notices, plugin_events_pending, board_cursor, line, tasks }) and started; a part that could not be read or that this page does not have is null, started is the read's performance.now()",
    summary: "The page read what waits on the person; the Assistant's bell (with the plugin notification count) paints from it, the board refreshes when its cursor moved, and on a project page the work line and the task panel paint from its line and tasks.",
  },
  {
    name: "molis-work:attention-refresh", kind: "request", owner: "attention", on: "document",
    detail: "none, or { reconnected: true } from the desktop shell once the Host answers again: the page then replaces its event stream before reading",
    summary: "Read what waits on the person again now: the person acted on a notice or on the work line, a work of the Assistant's changed state, or the desktop reconnected to the Host.",
  },
  {
    name: "molis-work:attention-unreachable", kind: "announcement", owner: "attention", on: "document",
    detail: "{ since }: when this page last read it, an ISO time, or null when it never has",
    summary: "The page's read of what waits on the person did not get through (not a gone project): the work line and the task panel keep what they showed and say it is being checked (WLN-05, WLN-29).",
  },
  {
    name: "molis-work:character-run-open", kind: "announcement", owner: "character-run", on: "window",
    detail: "{ reference, title, task, workspace_id, skill_ids }",
    summary: "The person asked the Characters page to open a Character run (the fixed role package and the task) in a workspace; a plugin surface that offers workspaces (data-character-run-target) opens a new session prepared from it.",
  },
  {
    name: "molis-work:character-terminal", kind: "request", owner: "character-terminal", on: "window",
    detail: "{ panelId, attachOnly: true }: the panel of a run the Characters page started or found running; nothing it could start a process with",
    summary: "Attach the Character terminal to the process of a run the Characters page started or found running.",
  },
  {
    name: "molis-work:character-terminal-reset", kind: "request", owner: "character-terminal", on: "window",
    detail: "none",
    summary: "Detach and hide the Character terminal, because another Character is shown.",
  },
  {
    name: "molis-work:composer-draft-restored", kind: "announcement", owner: "composer-draft", on: "element",
    detail: "none",
    summary: "The input has applied the restored text. Its enclosing workspace may now restore the selection and scroll.",
  },
  {
    name: "molis-work:item-unreadable", kind: "request", owner: "context-actions", on: "element", bubbles: true,
    detail: "{ itemId }",
    summary: "A plugin surface could not read the item the workbench asked it to show (molis-work:select-item): it is gone, or the plugin is refused the read (no permission, or the project turned the plugin off). The surface says which on itself; the workbench does not name the surface after the item, so the Assistant does not carry it as what the person is looking at. Raised from the surface root and bubbling.",
  },
  {
    name: "molis-work:knowledge-pick", kind: "request", owner: "knowledge-picker", on: "document",
    detail: "{ request_id, selected?: Array<{ ref: MaterialRef, title }>, max?, signal?: AbortSignal }",
    summary: "Open the project materials picker with these pieces already chosen, by their exact references. Sent by an input that brings pieces into a round: the Assistant's ＋ and Coding's 材料. A request sent while another is open takes its place; the earlier one is answered cancelled; an aborted signal closes the picker and answers cancelled. A plugin frame sends it on its own document: the frame's port carries it to the page, which asks under an id of its own only for a visible view after a real press, ends it when the view goes away, and hands back only the references that plugin page can read (plugin-frame/materials-picker.ts).",
  },
  {
    name: "molis-work:knowledge-picked", kind: "announcement", owner: "knowledge-picker", on: "document",
    detail: "{ request_id, outcome: 'confirmed' | 'cancelled' | 'unavailable', items: Array<{ ref: MaterialRef, title, hint? }> }",
    summary: "The picker's one answer to request_id. confirmed: items is the person's whole choice, replacing what was chosen before (an empty one clears it); cancelled: they closed it, or another request took its place, and the asking input keeps what it had; unavailable: there is no project here to pick from. Each item is an exact reference: a 成果 version, a piece as its owner indexed it, a folder file as read when ticked, or a quote or snapshot the materials service fixed.",
  },
  {
    name: "molis-work:language-changed", kind: "announcement", owner: "document-language", on: "document",
    detail: "{ tag: UiLanguageTag }",
    summary: "This document has applied a new language in place; its existing views can refresh compound words.",
  },
  {
    name: "molis-work:layout-holds", kind: "request", owner: "tab-workspace", on: "document",
    detail: "{ pane, surface, answer? }; the handler sets answer to a boolean, synchronously",
    summary: "Is a return trip's place still in the layout: the pane is there and has a view or a tab of this surface (not a frame's key). Sent by the settings-return owner when a trip settles with no page claiming it; an embedded pane document does not answer, and with no answer the sender does not judge.",
  },
  {
    name: "molis-work:memory-changed", kind: "announcement", owner: "assistant", on: "document",
    detail: "{ work_id }",
    summary: "A memory kept, replaced or undone in an Assistant work changed what the memory settings show; an open memory settings page reads its list again once it is idle.",
  },
  {
    name: "molis-work:model-ready", kind: "announcement", owner: "settings-directory", on: "document",
    detail: "none",
    summary: "The model settings page saved the first provider that can run. Sent on the document and into every pane frame; each page that showed \"no model\" reads its model state again (listeners: `node scripts/gates/dom-events.mjs --report`). When a return trip is open on these settings (a page of this tab sent the person there: an ordinary link, a pane's relay or a page's host.returns.go; not the gear, a menu or an address), the trip is settled first (settings-return): read back, the cover closed over that page and a toast, and only then is the event sent, so a page that reacts finds itself as the person sees it; with the settings opened any other way the settings stay open, and a page beneath them is still hidden when it hears the event. The model settings script also posts it on a BroadcastChannel of the same name to the other tabs of the origin, which is how an onboarding page open in another tab learns that a model was set up there (also on the standalone settings page of a person with no project, where the settings directory is not loaded); that channel is not a DOM event and has no entry of its own, and a desktop shell that hands a tab to the system browser cannot reach it.",
  },
  {
    name: "molis-work:open-settings-path", kind: "request", owner: "settings-directory", on: "document", cancelable: true,
    detail: "{ href, return_id?, need?, from?, carry? }; return_id only from a plugin frame's host, with from a page's (specs/draft-and-return §2.1)",
    summary: "Open the settings page at a settings address, global or of the project, and open a return trip from where it was asked (the settings-return owner checks need, from and carry and keeps them; only a frame host's return_id makes a trip a page claims; a request while the settings are open opens none). The settings directory calls preventDefault() when it opens the target cover, letting callers such as the Assistant's project-memory link fall back to navigation when no settings cover is mounted. The standalone Home host accepts only same-origin /settings/models, /settings/connectors and /capabilities/connections in its existing dialog; invalid detail, foreign origins and other paths open nothing, send no request and never navigate the owner document.",
  },
  {
    name: "molis-work:open-settings-section", kind: "request", owner: "settings-directory", on: "document", cancelable: true,
    detail: "{ section }",
    summary: "Open a global settings section by id; sent by the tab workspace when a plugin whose page lives in settings is opened, and by the Assistant's global memory-change link. The settings directory calls preventDefault() when it opens the section so callers can fall back to navigation when no settings cover is mounted.",
  },
  {
    name: "molis-work:place-changed", kind: "announcement", owner: "tab-workspace", on: "document",
    detail: "{ paneId, place, previous, cover }; cover is the kind of the cover over the panes or null (previous.cover missing reads as null); the constant is PLACE_CHANGED_EVENT (services/contextual)",
    summary: "The focused pane's place changed, or the cover over the panes did (a cover closing or turning into another is announced too); whatever was judged to be in hand there is void.",
  },
  {
    name: "molis-work:plugin-events", kind: "announcement", owner: "plugin-event-recovery", on: "document",
    detail: "{ pending }",
    summary: "The market read the recovery list: this many plugin deliveries wait on the person.",
  },
  {
    name: "molis-work:plugin-events-open", kind: "request", owner: "plugin-notifications", on: "document",
    detail: "none",
    summary: "Open the market on the plugin deliveries that wait. Sent from the Assistant's attention list.",
  },
  {
    name: "molis-work:plugin-events-reveal", kind: "announcement", owner: "plugin-notifications", on: "document",
    detail: "none",
    summary: "The market is being opened on the waiting deliveries; the recovery list shows them for a few seconds.",
  },
  {
    name: "molis-work:plugins-changed", kind: "announcement", owner: "plugin-membership", on: "document",
    detail: "{ came, gone, next, failed }; a listener sets failed to true when it could not bring its page in line",
    summary: "The project's plugins changed in place; plugins whose pages fill when the project has them fill them from next.",
  },
  {
    name: "molis-work:record-gone", kind: "request", owner: "tab-workspace", on: "document",
    detail: "{ plugin, itemId }",
    summary: "A record a tab opens is no longer there: strike its tab through and say so in its pane, with a way to close it. Sent by a plugin's page when its read of the record answers 404.",
  },
  {
    name: "molis-work:record-panel-presence", kind: "request", owner: "immersive-navigation", on: "element", bubbles: true,
    detail: "none",
    summary: "An editing or detail panel inside an open record document changed presence; the shell re-reads panel layout.",
  },
  {
    name: "molis-work:record-selected", kind: "request", owner: "tab-workspace", on: "document",
    detail: "{ plugin, itemId, title? }",
    summary: "The selected record inside a shell-rendered plugin surface changed; the active item tab follows the selection.",
  },
  {
    name: "molis-work:return-claim", kind: "request", owner: "settings-return", on: "document",
    detail: "{ return_id?, origin?: { scope, surface, place }, drop?, answer? }; the owner sets answer synchronously: { status, carry } (handed over and removed), { open: return_id } (still open, wait), or null",
    summary: "A plugin frame's host claims the outcome of a trip a page opened with host.returns.go, for this installation scope, surface and place as it is now; drop ends the trip as not ready. Only on the outer document.",
  },
  {
    name: "molis-work:return-settled", kind: "announcement", owner: "settings-return", on: "document",
    detail: "{ return_id, status }: ready, not_ready, ended (removed with no outcome: expired, or the person left the place), or refused (it never opened: no settings or no trips in this document)",
    summary: "A return trip settled or ended; the frame host waiting on it claims it inside the dispatch. It hands nothing over itself. After a start the owner sends it once more for each settled trip still waiting. Only on the outer document.",
  },
  {
    name: "molis-work:select-item", kind: "announcement", owner: "tab-workspace", on: "element",
    detail: "{ itemId?, quiet?, view?, panel?, intent?, invalidate? }",
    summary: "The workbench projects its current item or finite view selection onto one plugin surface; invalidate asks it to reread its own document without a business payload. quiet: a reopen the person did not ask for (a reload, Back), so an item that is gone is forgotten without a word. Dispatched on the surface root, not bubbling. A frame dispatch is cancelable: a plugin that handles the complete selection synchronously calls preventDefault to take responsibility for its reads, saves and navigation, so the frame does not also find and click a row. Claiming the request does not report success or cancel a business operation.",
  },
  {
    name: "molis-work:settings-embed", kind: "announcement", owner: "settings-directory", on: "document",
    detail: "{ root }",
    summary: "A settings page was placed into the settings area; page scripts bind to root.",
  },
  {
    name: "molis-work:system-view-changed", kind: "announcement", owner: "tab-workspace", on: "document",
    detail: "{ active: { owner, id, tab_id } | null, open: Array<{ owner, id, tab_id }> }",
    summary: "System view owners mount their existing controller into the focused system tab and retain hidden state.",
  },
  {
    name: "molis-work:system-view-close", kind: "request", owner: "tab-workspace", on: "document",
    detail: "{ owner, id }", summary: "Close the presentation of a system object without stopping its work.",
  },
  {
    name: "molis-work:system-view-open", kind: "request", owner: "tab-workspace", on: "document", cancelable: true,
    detail: "{ owner, id, title }", summary: "Focus or open one system-owned object in the common tab layout.",
  },
  {
    name: "molis-work:task-float", kind: "request", owner: "task-float", on: "document",
    detail: "Trusted shell-only TaskFloatRequest: open/close/forget with an opaque mount owner and lifecycle callbacks; never forwarded from a plugin frame.",
    summary: "The separately bundled frame bridge asks the existing task panel to mount its independently authorized child projection. The panel alone owns visibility, cancellation and cache lifetime; the callback does not carry task facts or grant authority.",
  },
  {
    name: "molis-work:task-role-picked", kind: "announcement", owner: "character-picker", on: "element",
    detail: "{ target, character?: { ref, title, character_id } | null, reset?: true }; null selects the Assistant, reset returns a new task to its defaults",
    summary: "A role picker changed the roles or applied a choice to its originating task.",
  },
  {
    name: "molis-work:task-role-picker", kind: "request", owner: "character-picker", on: "document",
    detail: "{ target, project_id: string | null, selection?: CharacterTaskSelection | null, required?: boolean, new_work?: boolean }",
    summary: "Open the role picker over the requesting Assistant island in the task's own scope.",
  },
  {
    name: "molis-work:terminal-theme-change", kind: "announcement", owner: "preferences", on: "window",
    detail: "{ theme }",
    summary: "The terminal colour theme changed; open terminals repaint.",
  },
  {
    name: "molis-work:ui-environment-changed", kind: "announcement", owner: "appearance", on: "window",
    detail: '{ revision: string, changed: ("skin" | "font" | "mono")[] }',
    summary: "This document has rendered the prepared appearance; frames update and open terminals remeasure.",
  },
  {
    name: "molis-work:work-item-changed", kind: "announcement", owner: "mainline-switcher", on: "document",
    detail: "{ item_id, item_name, previous_id, first_entry, source, other_waiting, items, task_items }",
    summary: "The active work item on this project's mainline changed, or its list/counts refreshed; attention, tab workspace, assistant, work bar, side contents and global search follow it.",
  },
  {
    name: "molis-work:work-item-hold-open", kind: "request", owner: "mainline-switcher", on: "document",
    detail: "{ subject, title?, mode?: 'hold' | 'as-item' }",
    summary: "Open the 「放进事项」 dialog or create a work item from an object on the current project's mainline.",
  },
  {
    name: "molis-work:work-item-switch", kind: "request", owner: "mainline-switcher", on: "document",
    detail: "{ item_id?, open_switcher?, previous?, open_organize? }",
    summary: "Ask the mainline switcher to switch to another work item (or project home), jump back to the previous item, open the top-left switcher, or open 「整理主线」.",
  },
  {
    name: "molis-work:work-terminal-subject-changed", kind: "request", owner: "work-terminal", on: "document",
    detail: "{ pluginId, subjectKind, subjectId, title?, status?, statusLabel?, statusMeaning?, statusIconMarkup?, readOnly? }",
    summary: "A plugin surface switched the object shown beside the platform work terminal pane: reset its panels and paint the new owner title, status and read-only guard.",
  },
  {
    name: "molis-work:work-terminal-subject-ready", kind: "request", owner: "work-terminal", on: "document",
    detail: "{ pluginId, subjectKind, subjectId }",
    summary: "The object shown beside the platform work terminal pane finished loading: load its work terminals if it is still the pane's current object.",
  },
  {
    name: "molis:acceptance-review-requested", kind: "request", owner: "acceptance-column", on: "document",
    detail: "{ subject: { provider_id, subject: { kind, id } } }",
    summary: "Open the requirement column on one object's requirements (an object surface's 「逐项审阅」). The column reads them as the person and shows the platform's own card; the page that asks draws no control that accepts or returns a requirement.",
  },
  {
    name: "molis:assistant-card-target", kind: "request", owner: "assistant", on: "document",
    detail: "{ object: { kind, id }, reply(work_id: string | null) }",
    summary: "A write chosen on the page asks which work its card goes into. The Assistant replies with its current work when its panel is open, the work is its own (not Coding's) and holds the object (one of the work's objects, or added to its strip); otherwise nobody replies and a new work starts. One reply counts. The work id is a pointer: the Host checks it when placing the card.",
  },
  {
    name: "molis:assistant-context-action-chosen", kind: "announcement", owner: "context-actions", on: "window", cancelable: true,
    detail: "ContextActionChosen (services/contextual); CONTEXT_ACTION_CHOSEN_EVENT",
    summary: "The person chose a ranked action. The page that owns the context takes it with preventDefault(); a trusted opaque-page bridge returns its asynchronous acceptance in handled and keeps callback authority outside that page; if nobody does, the Assistant gets the words and the material, unsent. An attach choice carries landing and run: the landing's owner takes it, previews there and confirms with run.",
  },
  {
    name: "molis:assistant-effect", kind: "announcement", owner: "assistant", on: "window",
    detail: "{ work_id, capability_id, session_id? }; ASSISTANT_EFFECT_EVENT (services/assistant)",
    summary: "The Assistant changed something through a plugin capability; the plugin's surface reads that object again and keeps unsaved edits.",
  },
  {
    name: "molis:assistant-message", kind: "request", owner: "assistant", on: "window",
    detail: "AssistantPluginMessage (services/assistant); ASSISTANT_MESSAGE_EVENT",
    summary: "A plugin page tells the Assistant something. What happens depends on message.purpose: background, change, suggest, delegate or reply. A suggest with `thread` offers 「让助理回复」 for that comment thread; only the person's press there starts it, for the plugin whose frame sent it.",
  },
  {
    name: "molis:assistant-open", kind: "request", owner: "assistant", on: "document",
    detail: "{ work_id?, new?, open?, source?, materials? ({ title, text }, a piece of project knowledge { title, subject: { kind, id } }, or a materials reference { title, ref: MaterialRef }), object? }",
    summary: "Open the Assistant panel on a Work, or a new one, with what is in hand (materials and the object they are from) put in its strip; no words are written and nothing is sent. Passing `open: false` (floating toolbar `✦ 助理` / POLISH-49) places what is in hand in the strip and focuses the input without changing whether the dialog is open or closed. A piece of project knowledge goes in by its subject (the knowledge picker sends these), a quote or snapshot of the project's folders by its materials reference (the side panel's reader), and either is read from its owner when the message is sent.",
  },
  {
    name: "molis:assistant-starter-choose", kind: "request", owner: "context-actions", on: "document",
    detail: "{ object_key, key }",
    summary: "The person picked a starter in the Assistant; the context row runs it.",
  },
  {
    name: "molis:assistant-starters", kind: "announcement", owner: "context-actions", on: "document",
    detail: "{ request_id, object_key, items }",
    summary: "The starters the Host offers for the context an assistant-starters-request asked about.",
  },
  {
    name: "molis:assistant-starters-request", kind: "request", owner: "context-actions", on: "document",
    detail: "{ context, request_id }",
    summary: "The Assistant asks which starters the Host offers for the context it shows.",
  },
  {
    name: "molis:assistant-subtask-open", kind: "request", owner: "task-float", on: "document",
    detail: "{ base, signal, focus, interaction, reviews, work_id, parent_run_id?, child_id? }; Native Host entry supplies the frozen route, lifetime and original UI factories; never forwarded through a plugin frame. Work alone selects a delegated Work; both execution fields select that Work's original SDK child.",
    summary: "Open an authorized child in the shared task float without changing the main conversation or its input receiver. The original service checks every supplied reference.",
  },
  {
    name: "molis:assistant-surface-changed", kind: "request", owner: "assistant", on: "window",
    detail: "{ plugin_id, object: { kind, id } }; ASSISTANT_SURFACE_CHANGED_EVENT (services/assistant)",
    summary: "A surface changed an object the Assistant may be showing (Coding's session settings); the Assistant reads its Work again.",
  },
  {
    name: "molis:authorization-changed", kind: "request", owner: "settings-directory", on: "window",
    detail: "none",
    summary: "A local authorization setting changed. Settings in this document re-read their owners; the event carries no authorization or result.",
  },
  {
    name: "molis:automation-suggestions-open", kind: "request", owner: "automation-recommendations", on: "document",
    detail: "{ trigger: HTMLIFrameElement }",
    summary: "A visible framed surface asks the shell to open project suggestions. The shell chooses its current project and the original frame is the focus return point. No data, storage or action authority goes to the frame.",
  },
  {
    name: "molis:context-intake", kind: "request", owner: "context-actions", on: "element", bubbles: true,
    detail: "{ intake_id, id, title, text }",
    summary: "A control on a plugin's page (`data-context-intake`) asks to put the object it holds into the creation entry `intake_id`. Sent on the control, or on the surface that holds the plugin's frame; the surface says which plugin and which kind of object it is, and the entry's own provider drafts and makes it.",
  },
  {
    name: "molis:context-panel-open", kind: "request", owner: "context-toolbar", on: "element", bubbles: true, cancelable: true,
    detail: "{ context_id, node, label, onClose?, keep? }",
    summary: "A plugin asks the toolbar for a small form under it (a link's address, a comment): the toolbar places `node` below the bar, one at a time, takes the event with preventDefault(), and closes it on Esc, a click elsewhere or another context, calling onClose. `keep` leaves a result the person is waiting for where it is when the context changes. `node: null` takes it down. Not taken (no bar for that context): the plugin shows the form itself.",
  },
  {
    name: "molis:context-tool-invoke", kind: "announcement", owner: "context-toolbar", on: "element", bubbles: true,
    detail: "ContextToolInvoke (services/contextual)",
    summary: "The person clicked one of a plugin's tools in the toolbar. Sent on the element that published the tools; the plugin runs it and publishes its tools again.",
  },
  {
    name: "molis:context-tools", kind: "request", owner: "context-toolbar", on: "element", bubbles: true,
    detail: "ContextTools (services/contextual)",
    summary: "A plugin offers its tools for the context it names, as data (limits in CONTEXT_TOOL_LIMITS). The toolbar draws them at the left of the bar and ignores ones for another context.",
  },
  {
    name: "molis:help-retry", kind: "announcement", owner: "on-demand-help", on: "document",
    detail: "{ topic: string }",
    summary: "The person clicked Try again inside a failed on-demand help card; topic providers may clear cached failures before the card re-reads the topic.",
  },
  {
    name: "molis:placement-changed", kind: "announcement", owner: "placement", on: "window",
    detail: "{ mode, from, to }",
    summary: "An object was moved, copied, converted or used in a project; plugins re-read their lists and close editors of objects that left.",
  },
  {
    name: "molis:placement-convert", kind: "request", owner: "placement", on: "window",
    detail: "{ source, station | attach_kind, payload?, note? }",
    summary: "Hand content to another plugin (or make it a new target of a 「挂到…」 relation, by its subject kind) through the shared conversion dialog. From a plugin's side view it is dispatched in that view's own document and the side panel dispatches it again here, on the page's window, after the S-30 check (`SIDE_FORWARD_SCRIPT`).",
  },
  {
    name: "molis:placement-flush", kind: "announcement", owner: "placement", on: "window",
    detail: "{ mode, object, settle }",
    summary: "The placement bar is about to move an object; the page that has it open pushes a promise onto settle that stores unsaved edits. The bar waits, and does not move if that promise fails.",
  },
  {
    name: "molis:placement-request", kind: "request", owner: "placement", on: "window",
    detail: "{ action: use-in-project | move | copy, object }",
    summary: "Open the shared dialog that uses, moves or copies an object. From a plugin's side view it is dispatched in that view's own document and the side panel dispatches it again here, on the page's window, after the S-30 check (`SIDE_FORWARD_SCRIPT`).",
  },
  {
    name: "molis:placement-result", kind: "request", owner: "placement", on: "window",
    detail: "{ verb, title, object?, note?, file? }",
    summary: "A plugin reports what it made, imported, converted or exported, so the workbench shows what was made and where it is. From a plugin's side view it is dispatched in that view's own document and the side panel dispatches it again here, on the page's window, after the S-30 check (`SIDE_FORWARD_SCRIPT`).",
  },
  {
    name: "molis:shelf-notice", kind: "request", owner: "shelf", on: "window",
    detail: "{ message }",
    summary: "Show a one-line notice in the Shelf. Sent by the desktop shell, the native drop wheel and the Shelf's own terminal.",
  },
  {
    name: "molis:shelf-refresh", kind: "request", owner: "shelf", on: "window",
    detail: "{ item_ids? }",
    summary: "Reload the Shelf list and select the last of item_ids. Sent when something landed in the Shelf outside its page (desktop shell, drop wheel, Shelf settings).",
  },
  {
    name: "molis:shelf-send-tui", kind: "request", owner: "shelf", on: "window",
    detail: "{ item_ids, text? }",
    summary: "Send the named Shelf items, or text, to the terminal Agent. Sent by the native drop wheel (Rust).",
  },
  {
    name: "molis:shelf-tui-unsent", kind: "announcement", owner: "shelf", on: "window",
    detail: "{ texts, message }",
    summary: "The Shelf terminal was not connected, so typed text was not sent; the Shelf puts it back into its input.",
  },
  {
    name: "molis:side-browser-control", kind: "announcement", owner: "side-panel", on: "document",
    detail: "{ action: takeover | handback, project_id, session_id }",
    summary: "The person took the side panel's browser over from a Work, or handed it back; the Assistant tells the Work.",
  },
  {
    name: "molis:side-context-command", kind: "announcement", owner: "side-panel", on: "document",
    detail: "{ context_epoch, context: { plugin_id, pane_id, tab_id, view_id, object_ref, revision, unsaved }, command }",
    summary: "A mounted contextual side view asks its current stage owner to focus an anchor or prepare a comment. UI context carries no authority.",
  },
  {
    name: "molis:side-context-result", kind: "request", owner: "side-panel", on: "document",
    detail: "{ type, object_id, request_id, notes?, version?, saved?, error? }",
    summary: "The currently bound editor answers its contextual side view; the shell checks mounted source and object identity.",
  },
  {
    name: "molis:side-open", kind: "request", owner: "side-panel", on: "document", cancelable: true,
    detail: "{ tab, view?, target?, focus? }",
    summary: "Open the side panel on a tab (files, browser, a plugin view) with a target. A panel that takes it calls preventDefault(); same-origin frames post the same as a message.",
  },
  {
    name: "molis:side-shown", kind: "announcement", owner: "side-panel", on: "document",
    detail: "{ tab, target, open }",
    summary: "A tab of the side panel is now shown (or the panel closed); the tab's owner loads what it was asked to show.",
  },
  {
    name: "molis:skill-pick-open", kind: "request", owner: "skill-picks", on: "document", cancelable: true,
    detail: "{ reply, consumer: SkillPickConsumer, picks: SkillPick[], index: number | null, box: { x, y, width, height } }",
    summary: "Open the 「依据」 panel for one Skill of a round's line (index; null for 「选一个」), anchored at the pressed button's box. Sent by the page that shows the round: the Assistant or a plugin Agent through its frame. The panel takes it with preventDefault(); reply is the page's own mark for the round.",
  },
  {
    name: "molis:skill-redo", kind: "announcement", owner: "skill-picks", on: "document",
    detail: "{ reply, named: Array<{ ref: SkillRef, name }> }",
    summary: "The person asked for the round marked reply to run again with exactly these Skills and no automatic ones (an empty list: without Skills). The page that asked starts the round; nothing was changed in the Skill settings by this.",
  },
  {
    name: "molis:surface-focus", kind: "request", owner: "context-actions", on: "element", bubbles: true,
    detail: "SurfaceFocus | null (services/contextual); SURFACE_FOCUS_EVENT",
    summary: "A surface tells the context row what the person has in hand on it, or that it is nothing now. Raised from the surface's own root and bubbling to the row's listener on document; opaque pages report bounded data through their bound port, with identity and screen coordinates supplied by the shell; the row raises it itself, from the person's text selection, for a surface that only declares its object in data-assistant-context.",
  },
  {
    name: "molis:surface-interaction", kind: "announcement", owner: "placement", on: "window",
    detail: "none", summary: "Input or a pointer press in a visible isolated surface dismisses informational placement cards; it grants no action authority.",
  },
  {
    name: "molis:surface-landing", kind: "request", owner: "context-actions", on: "element", bubbles: true,
    detail: "SurfaceLanding | null (services/contextual)",
    summary: "The page that owns the object open on the left tells the context row where something in hand would land in it (cursor, selection or end, with the version its positions belong to), or that there is no landing now. Raised from the page's own root and bubbling to the row's listener on document; a split pane's report comes up as a pane message and is raised again on that pane's frame. The row keeps one landing and sends it with the requests for a thing in hand elsewhere.",
  },
  {
    name: "molis:surface-landing-flash", kind: "request", owner: "surface-landing", on: "element",
    detail: "none",
    summary: "The context row asks the page that reported the landing to show it once: a way to put the thing in hand there was hovered or focused on the bar or in its menu. Dispatched on the element that raised molis:surface-landing, only while it is connected; a split pane's landing is asked of that pane's frame (pane message workbench-surface-landing-flash, top document to pane only), which raises it on its own landing element. The page shows it without covering text, not again while it shows, and not at all under reduced motion.",
  },
] as const satisfies readonly DomEventDeclaration[];

export type DomEventName = (typeof DOM_EVENTS)[number]["name"];
