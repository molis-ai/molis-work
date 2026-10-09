import type { ContractDescriptor } from "./package.js";

export const platformDomEventsContract = {
  contractId: "io.molis.work.platform.dom-events.v1",
  kind: "platform",
  schemaVersion: 1,
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
 * `data-assistant-context` attribute, the `host` object handed to plugin client scripts, storage keys, direct calls
 * between the segments of the Workbench client, and state that no event announces. Those are other channels with no
 * registry yet.
 */

/**
 * The name prefixes in use. Four styles grew side by side; the rename to one is a separate change that edits this list
 * and every name below. A name must start with one of these, so a fifth style cannot appear unnoticed.
 */
export const DOM_EVENT_PREFIXES = ["molis-work:", "molis:", "molis-shelf-", "workbench-"] as const;

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

export const PAGE_STATE_OWNERS = {
  "side-panel": {
    files: ["apps/workbench/src/side-panel.ts", "apps/workbench/src/side-panel-browser.ts", "apps/workbench/src/side-panel-files.ts"],
    state: "Whether the right-hand panel is open, which tab it shows and what that tab was asked to show (a file, a web page, the browser held by the person or by a Work). The last tab is kept in localStorage as molis:side-tab.",
  },
  assistant: {
    files: ["apps/workbench/src/scripts/client/assistant-island.ts"],
    state: "The bottom Assistant: the Work it shows, the draft and the materials in its input, what waits on the person.",
  },
  "context-actions": {
    files: ["apps/workbench/src/scripts/client/context-actions.ts"],
    state: "What the person has in hand on the focused surface, the ranked actions offered for it, and the starters offered for the open Work.",
  },
  placement: {
    files: ["apps/workbench/src/scripts/client/placement.ts"],
    state: "Where the objects on the page live (project, personal, Home) and the shared dialogs that use, move, copy or convert them.",
  },
  "tab-workspace": {
    files: ["apps/workbench/src/scripts/client/tab-workspace.ts"],
    state: "The open tabs and panes of the work area, the current place, and which item each plugin surface has been asked to show.",
  },
  "settings-directory": {
    files: ["apps/workbench/src/scripts/client/settings-directory.ts"],
    state: "The settings area: which global or project settings page is open, and the embedded settings pages inside it.",
  },
  "plugin-notifications": {
    files: ["apps/workbench/src/scripts/client/plugin-notifications.ts"],
    state: "How many plugin deliveries wait on the person, and opening the market's recovery list on them.",
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
    state: "The application chrome around the work area, including the Goal work mode.",
  },
  "navigation-feed": {
    files: ["apps/workbench/src/scripts/client/navigation-feed.ts"],
    state: "The Feed directory: its groups, the open group and the selected Feed task.",
  },
  "goal-selection": {
    files: ["apps/workbench/src/scripts/client/refresh-decisions.ts", "apps/workbench/src/scripts/client/initialization.ts"],
    state: "The Goal selected in the Goals directory and the page's first selection on load.",
  },
  preferences: {
    files: ["packages/design-system/src/preferences.ts"],
    state: "The person's display preferences on this device: theme, density and terminal theme (localStorage molis-work:theme, molis-work:density, molis-work:terminal-theme).",
  },
  shelf: {
    files: ["plugins/native/shelf/src/client.ts", "plugins/native/shelf/src/terminal-client.ts", "plugins/native/shelf/src/settings-client.ts"],
    state: "The Shelf surface: its list and selection, the notice line and the input to the terminal Agent.",
  },
  coding: {
    files: ["plugins/native/coding/src/client.ts"],
    state: "The Coding surface: its sessions, the open session and its composer.",
  },
  "character-terminal": {
    files: ["apps/workbench/src/character-terminal-client.ts"],
    state: "The terminal that shows a Character run: which process it is attached to.",
  },
  "artifacts-import": {
    files: ["plugins/native/artifacts/src/import-client.ts"],
    state: "The import form of the Artifacts library.",
  },
  "goals-event-document": {
    files: ["plugins/native/goals/src/event-document-client.ts"],
    state: "The Goal event panel inside an open Goal document.",
  },
} as const satisfies Readonly<Record<string, PageStateOwner>>;

export type PageStateOwnerId = keyof typeof PAGE_STATE_OWNERS;

/**
 * - `announcement`: the owner reports a change of its own state, or hands something it decided to the others; the owner
 *   dispatches it and other modules listen.
 * - `request`: another module asks the owner to change its state; the owner listens and others dispatch.
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
 * Every page event, in name order: 46 names at the time of listing, 45 of them created with `new CustomEvent` (89 dispatch
 * sites) and one, `molis:side-toggle`, only listened to so far. Who dispatches and who listens is not written down here:
 * `node scripts/gates/dom-events.mjs --report` computes both from the source, so it cannot go stale.
 */
export const DOM_EVENTS = [
  {
    name: "molis-shelf-notice", kind: "request", owner: "shelf", on: "window",
    detail: "{ message }",
    summary: "Show a one-line notice in the Shelf. Sent by the desktop shell, the native drop wheel and the Shelf's own terminal.",
  },
  {
    name: "molis-shelf-refresh", kind: "request", owner: "shelf", on: "window",
    detail: "{ item_ids? }",
    summary: "Reload the Shelf list and select the last of item_ids. Sent when something landed in the Shelf outside its page (desktop shell, drop wheel, Shelf settings).",
  },
  {
    name: "molis-shelf-send-tui", kind: "request", owner: "shelf", on: "window",
    detail: "{ item_ids, text? }",
    summary: "Send the named Shelf items, or text, to the terminal Agent. Sent by the native drop wheel (Rust).",
  },
  {
    name: "molis-shelf-tui-unsent", kind: "announcement", owner: "shelf", on: "window",
    detail: "{ texts, message }",
    summary: "The Shelf terminal was not connected, so typed text was not sent; the Shelf puts it back into its input.",
  },
  {
    name: "molis-work:artifact-imported", kind: "announcement", owner: "artifacts-import", on: "element", bubbles: true,
    detail: "{ href }",
    summary: "An import into the Artifacts library finished in the form that dispatched it; the dialog that hosts the form closes on it.",
  },
  {
    name: "molis-work:character-coding", kind: "request", owner: "coding", on: "window",
    detail: "{ reference, title, task, workspace_id, skill_ids }",
    summary: "Open a new Coding session prepared from a Character run (the fixed role package and the task). Sent by the Characters page.",
  },
  {
    name: "molis-work:character-terminal", kind: "request", owner: "character-terminal", on: "window",
    detail: "PtySpawnRequest (services/runtime-host), or { panelId, sessionId, attachOnly }",
    summary: "Attach the Character terminal to a process the Characters page spawned or found running.",
  },
  {
    name: "molis-work:character-terminal-reset", kind: "request", owner: "character-terminal", on: "window",
    detail: "none",
    summary: "Detach and hide the Character terminal, because another Character is shown.",
  },
  {
    name: "molis-work:goal-changed", kind: "announcement", owner: "goal-selection", on: "document",
    detail: "{ goalId, goalTitle, status, statusLabel, statusMeaning, statusIconMarkup, parentReadOnly, children }",
    summary: "The selected Goal changed, or the first one was selected on load.",
  },
  {
    name: "molis-work:goal-document-loaded", kind: "announcement", owner: "tab-workspace", on: "document",
    detail: "{ goalId }",
    summary: "A Goal document finished loading into the work area, from the tab workspace or from the Goals navigation client.",
  },
  {
    name: "molis-work:goal-panel-presence", kind: "announcement", owner: "goals-event-document", on: "element", bubbles: true,
    detail: "none",
    summary: "A Goal event panel is present in the document; the shell re-reads whether to offer the panel layout.",
  },
  {
    name: "molis-work:open-settings-path", kind: "request", owner: "settings-directory", on: "document",
    detail: "{ href }",
    summary: "Open the settings page at a settings address, global or of the project.",
  },
  {
    name: "molis-work:open-settings-section", kind: "request", owner: "settings-directory", on: "document",
    detail: "{ section }",
    summary: "Open a global settings section by id (a plugin whose page lives in settings, the memory section).",
  },
  {
    name: "molis-work:place-changed", kind: "announcement", owner: "tab-workspace", on: "document",
    detail: "{ paneId, place, previous }; the constant is PLACE_CHANGED_EVENT (services/contextual)",
    summary: "The focused pane's place changed; whatever was judged to be in hand there is void.",
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
    name: "molis-work:plugin-events-waiting", kind: "announcement", owner: "plugin-notifications", on: "document",
    detail: "{ pending }",
    summary: "The number of plugin deliveries that wait on the person changed; the Assistant's bell repaints.",
  },
  {
    name: "molis-work:plugins-changed", kind: "announcement", owner: "plugin-membership", on: "document",
    detail: "{ came, gone, next, failed }; a listener sets failed to true when it could not bring its page in line",
    summary: "The project's plugins changed in place; plugins whose pages fill when the project has them fill them from next.",
  },
  {
    name: "molis-work:select-item", kind: "announcement", owner: "tab-workspace", on: "element",
    detail: "{ itemId }",
    summary: "The workbench opened an item in a plugin surface; the surface shows it. Dispatched on the surface root, not bubbling.",
  },
  {
    name: "molis-work:settings-embed", kind: "announcement", owner: "settings-directory", on: "document",
    detail: "{ root }",
    summary: "A settings page was placed into the settings area; page scripts bind to root.",
  },
  {
    name: "molis-work:terminal-theme-change", kind: "announcement", owner: "preferences", on: "window",
    detail: "{ theme }",
    summary: "The terminal colour theme changed; open terminals repaint.",
  },
  {
    name: "molis-work:work-mode-changed", kind: "announcement", owner: "immersive-navigation", on: "document",
    detail: "{ goalId, mode }",
    summary: "The Goal work mode changed. Nothing in the tree listens yet.",
  },
  {
    name: "molis:assistant-context-action-choose", kind: "request", owner: "context-actions", on: "document",
    detail: "{ context_id, key }; CONTEXT_ACTION_CHOOSE_EVENT (services/contextual)",
    summary: "A surface's own menu picked a ranked action; the context row handles it as a click on itself.",
  },
  {
    name: "molis:assistant-context-action-chosen", kind: "announcement", owner: "context-actions", on: "window", cancelable: true,
    detail: "ContextActionChosen (services/contextual); CONTEXT_ACTION_CHOSEN_EVENT",
    summary: "The person chose a ranked action. The page that owns the context takes it with preventDefault(); if nobody does, the Assistant gets the words and the material, unsent.",
  },
  {
    name: "molis:assistant-context-actions", kind: "announcement", owner: "context-actions", on: "document",
    detail: "{ context_id, plan }; CONTEXT_ACTIONS_EVENT (services/contextual)",
    summary: "The Host's ranked actions for the current context, for surfaces that show them in their own menu.",
  },
  {
    name: "molis:assistant-effect", kind: "announcement", owner: "assistant", on: "window",
    detail: "{ work_id, capability_id, session_id? }; ASSISTANT_EFFECT_EVENT (services/assistant)",
    summary: "The Assistant changed something through a plugin capability; the plugin's surface reads that object again and keeps unsaved edits.",
  },
  {
    name: "molis:assistant-message", kind: "request", owner: "assistant", on: "window",
    detail: "AssistantPluginMessage (services/assistant); ASSISTANT_MESSAGE_EVENT",
    summary: "A plugin page tells the Assistant something. What happens depends on message.purpose: background, change, suggest, delegate or reply.",
  },
  {
    name: "molis:assistant-open", kind: "request", owner: "assistant", on: "document",
    detail: "{ work_id?, new?, source?, materials?, text? }",
    summary: "Open the Assistant panel on a Work, or a new one, with words and materials put in and nothing sent.",
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
    name: "molis:assistant-surface-changed", kind: "request", owner: "assistant", on: "window",
    detail: "{ plugin_id, object: { kind, id } }; ASSISTANT_SURFACE_CHANGED_EVENT (services/assistant)",
    summary: "A surface changed an object the Assistant may be showing (Coding's session settings); the Assistant reads its Work again.",
  },
  {
    name: "molis:placement-changed", kind: "announcement", owner: "placement", on: "window",
    detail: "{ mode, from, to }",
    summary: "An object was moved, copied, converted or used in a project; plugins re-read their lists and close editors of objects that left.",
  },
  {
    name: "molis:placement-convert", kind: "request", owner: "placement", on: "window",
    detail: "{ source, station | goal, payload?, note? }",
    summary: "Hand content to another plugin (or make it a Goal) through the shared conversion dialog.",
  },
  {
    name: "molis:placement-request", kind: "request", owner: "placement", on: "window",
    detail: "{ action: use-in-project | move | copy, object }",
    summary: "Open the shared dialog that uses, moves or copies an object.",
  },
  {
    name: "molis:placement-result", kind: "request", owner: "placement", on: "window",
    detail: "{ verb, title, object?, note?, file? }",
    summary: "A plugin reports what it made, imported, converted or exported, so the workbench shows what was made and where it is.",
  },
  {
    name: "molis:shelf-admit", kind: "request", owner: "shelf", on: "window",
    detail: "{ filename, mime, bytes_base64, source }",
    summary: "Put a file made elsewhere (a generated image) into the Shelf.",
  },
  {
    name: "molis:side-browser-control", kind: "announcement", owner: "side-panel", on: "document",
    detail: "{ action: takeover | handback, project_id, session_id }",
    summary: "The person took the side panel's browser over from a Work, or handed it back; the Assistant tells the Work.",
  },
  {
    name: "molis:side-close", kind: "request", owner: "side-panel", on: "document",
    detail: "none",
    summary: "Close the side panel.",
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
    name: "molis:side-toggle", kind: "request", owner: "side-panel", on: "document",
    detail: "{ tab? }",
    summary: "Close the panel if it shows that tab (or any tab), otherwise open it. Nothing in the tree dispatches it yet.",
  },
  {
    name: "molis:surface-focus", kind: "announcement", owner: "context-actions", on: "element", bubbles: true,
    detail: "SurfaceFocus | null (services/contextual); SURFACE_FOCUS_EVENT",
    summary: "A surface's focus changed (what the person has in hand), or became nothing. Raised from the surface's own root.",
  },
  {
    name: "workbench-feed-task", kind: "request", owner: "tab-workspace", on: "document",
    detail: "{ taskId }",
    summary: "Make the current tab show a Feed task. Also posted to a framed Feed pane as a message.",
  },
  {
    name: "workbench-open-group", kind: "request", owner: "navigation-feed", on: "document",
    detail: "{ surface, id }",
    summary: "Open a group of the Feed directory.",
  },
] as const satisfies readonly DomEventDeclaration[];

export type DomEventName = (typeof DOM_EVENTS)[number]["name"];
