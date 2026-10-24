import { CODING_SESSION_MARKS } from "../../session-marks.js";
import { createCodingTimeline } from "../../timeline.js";
import { codingTimelineWords } from "../../timeline-words.js";
import { createCodingTurnChanges } from "../../turn-changes-client.js";
import type { CodingHost } from "./host.js";
import type { Page, Refs, State } from "./page.js";
import { readCurrent } from "./read.js";
import { api, status } from "./request.js";
import { mountResultsIndex } from "./results-index.js";

/** The words of a round's state, as the header, the directory and the facts name it. */
function phaseWords(L: Page["L"]): Record<string, string> {
  return {
    starting: L("coding.phase.starting"), running: L("coding.state.running"), compacting: L("coding.phase.compacting"), pausing: L("coding.phase.pausing"),
    paused: L("coding.state.paused"), "awaiting-input": L("coding.phase.awaiting-input"), "awaiting-review": L("coding.phase.awaiting-review"),
    completed: L("coding.state.done"), failed: L("coding.phase.failed"), stopped: L("coding.phase.stopped"), cancelled: L("coding.state.cancelled"),
    "reconcile-required": L("coding.phase.reconcile-required"),
  };
}

/** What each role is called where the page names a round's or a subtask's role. */
function roleNames(L: Page["L"]): Record<string, string> {
  return {
    planner: L("规划者"), reader: L("阅读者"), reviewer: L("评审者"), coordinator: L("协作"), writers: L("并行写入"), builder: L("构建者"), writer: L("改写者"),
    "coding-reader": L("代码调查"), "coding-reviewer": L("独立评审"), "coding-builder": L("独立实现"),
  };
}

/** Everything the page remembers, empty: no session is chosen and nothing is read. `ports`, `follow` and `earlierWatch` are made by the caller. */
function emptyState(L: Page["L"]): Omit<State, "ports" | "follow" | "earlierWatch"> {
  return {
    ROLE_NAMES: roleNames(L), SECTION_SHORT: {}, SESSION_STATE: Object.fromEntries(Object.entries(CODING_SESSION_MARKS).map(([state, mark]) => [state, L(mark.label)])),
    actionSelections: new Map(), adoptedConfigurations: new Map(), allRuns: [], answeredQuestions: new Set(), artifactRows: [], artifactTicket: 0,
    boardAll: { key: "", id: "", value: null }, changeItem: "", characterSelections: new Map(), characterSkills: new Map(), characterTitles: new Map(),
    checkpointBusy: false, checkpointKey: "", checkpointLoading: false,
    choosers: ["workspace", "goal", "writer-directories", "material", "method", "mcp", "actions", "character", "delegate"],
    configurations: new Map(), creating: false, creatingCharacterSession: false, current: "", dialogueOffset: 0,
    directoryClaimed: false, directoryGroups: new Map(), directoryRows: new Map(), earlierFingerprint: "", earlierRuns: [],
    generation: 0, goalChoice: null, goalCursor: null, goalReading: 0, goalRows: [], goalSaving: false, goalTicket: 0,
    indexSignature: "", indexTimer: 0, indexed: [], itemTicket: 0, lastData: null, lastRun: null, liveRun: "", liveTicket: 0, loading: false,
    materialSelections: new Map(), materialTicket: 0, mcpChoices: [], mcpSelections: new Map(), mcpSourceChoices: [], mcpSourceSelections: new Map(),
    methodChoices: [], methodDocumentTicket: 0, methodSelections: new Map(), offeredApprovals: new Set(), offsets: new Map(),
    olderPlanEntries: [], olderSubagents: [], olderViews: new Map(), pageLoading: false, paintFrame: 0, phases: phaseWords(L), planEntries: [], pollingTicks: 0,
    progressSaving: false, progressTicket: 0, progressView: null, questionDrafts: new Map(), queuedInputs: undefined, queuedKey: "",
    recovery: false, recoveryBusy: false, recoveryKey: "", recoveryLoading: false, renderedText: new WeakMap(),
    reportItem: "", reportOutput: null, reportRun: "", reportSaving: false, reportTicket: 0, reportTrigger: undefined,
    runtimeSessionId: null, selectionTask: undefined, sending: false, sessionOnShow: false,
    state: { sessions: [], models: [], runtimes: [], workspaces: [] }, stateLoaded: false, stateNext: null, stateRead: null, statusKey: "",
    subagentGroups: [], viewSignal: undefined, windowRuns: [], workspaceId: "",
  };
}

/** The conversation's scroll has the page's one owner (design system molisFollow, VUX-26): only the reader stops the follow. */
function followConversation(page: Page) {
  const { lifetime, q, s, turns } = page;
  if (!window.molisFollow) throw new Error("The page has no scroll follower");
  s.follow = window.molisFollow(turns, { onChange: now => { q("[data-coding-latest]").hidden = Boolean(s.reportRun) || now === "following"; } });
  lifetime.own(() => s.follow.dispose());
}

/** Makes the page of a Coding view: its markup found, its memory empty. Null when the view is gone or already mounted. */
export function createPage(host: CodingHost): Page | null {
  const root = document.querySelector<HTMLElement>("[data-coding-workbench]"), directory = root?.querySelector<HTMLElement>("[data-coding-directory]");
  if (!root || !directory) return null;
  const lifetime = host.mountPluginClient(root);
  if (!lifetime) return null;
  const L = host.translate, q: Page["q"] = <Found extends Element = HTMLElement>(selector: string) => {
    const found = root.querySelector<Found>(selector);
    if (!found) throw new Error("missing part: " + selector);
    return found;
  };
  const s = emptyState(L) as State, refs = {} as Refs;
  const page: Page = { host, L, root, directory, lifetime, q, turns: q("[data-coding-turns]"), input: q<HTMLTextAreaElement>("[data-coding-task]"), s, refs };
  s.ports = { lifetime, translate: L, q, api: (path, method, body, signal) => api(page, path, method, body, signal), current: () => s.current, status: (message, isError) => status(page, message, isError), refresh: () => readCurrent(page) };
  return page;
}

/** The first things the page sets up: the results index, the timeline pieces, the follow and the earlier-rounds watch. */
export function mountFoundations(page: Page) {
  const { L, lifetime, s, turns } = page;
  s.viewSignal = undefined;
  mountResultsIndex(page);
  page.refs.timeline = createCodingTimeline(codingTimelineWords(L));
  page.refs.turnChanges = createCodingTurnChanges(L);
  lifetime.poll(() => page.refs.timeline.tick(turns), 1000);
  followConversation(page);
}
