import type { ScrollFollower } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { createCodingTimeline } from "../../timeline.js";
import { createCodingTurnChanges } from "../../turn-changes-client.js";
import { createCodingCodePaint } from "../../code-paint-client.js";
import type { ActionRef } from "../actions.js";
import type { actionsClient } from "../actions.js";
import type { CharacterRef } from "../characters.js";
import type { ChangesetClient } from "../changeset.js";
import type { CommandsClient } from "../commands.js";
import type { ComposerModels } from "../composer-model.js";
import type { CooperationClient } from "../cooperation.js";
import type { CodingDraft } from "../draft.js";
import type { InputReceipts } from "../input-receipts.js";
import type { PlanProgress } from "../plan-progress.js";
import type { PlansClient } from "../plans.js";
import type { PlanEntry } from "../shapes.js";
import type { StepReports } from "../steps.js";
import type { SubagentCards } from "../subagent-cards.js";
import type { SubagentGroup, SubagentGroups } from "../subagents.js";
import type { Taskboard } from "../taskboard.js";
import type { Lifetime, PagePorts, Query, Translate } from "../types.js";
import type { UsageMeter } from "../usage-meter.js";
import type { WriterDirectories } from "../writers.js";
import type { WriterIntegration } from "../writer-integration.js";
import type { CodingHost } from "./host.js";
import type {
  ArtifactRow, GoalChoice, GoalSummary, McpSourceRef, McpToolRef, MethodRef, ProgressView, ReportOutput, RunView, SessionConfiguration, SessionData, StateRead,
} from "./shapes.js";

/** Everything the page remembers between one event and the next. */
export interface State {
  ROLE_NAMES: Record<string, string>;
  SECTION_SHORT: Record<string, string>;
  SESSION_STATE: Record<string, string>;
  actionSelections: Map<string, readonly ActionRef[]>;
  adoptedConfigurations: Map<string, string>;
  allRuns: RunView[];
  answeredQuestions: Set<string>;
  artifactRows: ArtifactRow[];
  artifactTicket: number;
  /** The whole session's board, read when the board is open: the window of rounds alone is not all of it. */
  boardAll: { id: string; key: string; value: { runs: RunView[]; taskboard_plans: PlanEntry[]; subagents: SubagentGroup[] } | null };
  changeItem: string;
  characterSelections: Map<string, CharacterRef | null>;
  characterSkills: Map<string, readonly string[]>;
  characterTitles: Map<string, string>;
  checkpointBusy: boolean;
  checkpointKey: string;
  checkpointLoading: boolean;
  /** The composer and what sets the next round (each a button by the box opening a dialog of that name). */
  choosers: readonly string[];
  configurations: Map<string, Partial<SessionConfiguration> | undefined>;
  creating: boolean;
  creatingCharacterSession: boolean;
  current: string;
  dialogueOffset: number;
  directoryClaimed: boolean;
  directoryGroups: Map<string, HTMLElement>;
  directoryRows: Map<string, HTMLAnchorElement>;
  earlierFingerprint: string;
  earlierRuns: RunView[];
  earlierWatch: IntersectionObserver;
  follow: ScrollFollower;
  generation: number;
  goalChoice: GoalChoice | null;
  goalCursor: string | null;
  goalReading: number;
  goalRows: GoalSummary[];
  goalSaving: boolean;
  goalTicket: number;
  indexSignature: string;
  indexTimer: number;
  indexed: HTMLElement[];
  itemTicket: number;
  lastData: SessionData | null;
  lastRun: RunView | null;
  liveRun: string;
  liveTicket: number;
  loading: boolean;
  materialSelections: Map<string, readonly unknown[]>;
  materialTicket: number;
  mcpChoices: McpToolRef[];
  mcpSelections: Map<string, readonly McpToolRef[]>;
  mcpSourceChoices: McpSourceRef[];
  mcpSourceSelections: Map<string, readonly McpSourceRef[]>;
  methodChoices: MethodRef[];
  methodDocumentTicket: number;
  methodSelections: Map<string, readonly MethodRef[]>;
  offeredApprovals: Set<string>;
  offsets: Map<string, number>;
  olderPlanEntries: PlanEntry[];
  olderSubagents: SubagentGroup[];
  olderViews: Map<string, RunView>;
  pageLoading: boolean;
  paintFrame: number;
  phases: Record<string, string>;
  planEntries: PlanEntry[];
  pollingTicks: number;
  ports: PagePorts;
  progressSaving: boolean;
  progressTicket: number;
  progressView: ProgressView | null;
  questionDrafts: Map<string, Record<string, unknown>>;
  queuedInputs: readonly unknown[] | undefined;
  queuedKey: string;
  recovery: boolean;
  recoveryBusy: boolean;
  recoveryKey: string;
  recoveryLoading: boolean;
  renderedText: WeakMap<HTMLElement, string>;
  reportItem: string;
  reportOutput: ReportOutput | null;
  reportRun: string;
  reportSaving: boolean;
  reportTicket: number;
  reportTrigger: HTMLElement | undefined;
  runtimeSessionId: string | null;
  selectionTask: Promise<void> | undefined;
  sending: boolean;
  sessionOnShow: boolean;
  state: StateRead;
  stateLoaded: boolean;
  stateNext: Promise<void> | null;
  stateRead: Promise<void> | null;
  statusKey: string;
  subagentGroups: SubagentGroup[];
  viewSignal: AbortSignal | undefined;
  windowRuns: RunView[];
  workspaceId: string;
}

/** The pieces the page is made of, each built once when the page mounts. */
export interface Refs {
  attachMenu: HTMLElement;
  attachToggle: HTMLElement;
  changeReview: ChangesetClient;
  codeSource: ReturnType<typeof createCodingCodePaint>["source"];
  commandsUi: CommandsClient;
  composerModels: ComposerModels;
  cooperationUi: CooperationClient;
  draft: CodingDraft;
  growCode: ReturnType<typeof createCodingCodePaint>["growCode"];
  inputReceipts: InputReceipts;
  integrations: WriterIntegration;
  paintBlock: ReturnType<typeof createCodingCodePaint>["paintBlock"];
  paintInto: ReturnType<typeof createCodingCodePaint>["paintInto"];
  paintRows: ReturnType<typeof createCodingCodePaint>["paintRows"];
  pieceNode: ReturnType<typeof createCodingCodePaint>["pieceNode"];
  planProgress: PlanProgress;
  plans: PlansClient;
  renderCards: ReturnType<typeof actionsClient>["renderCards"];
  stepReports: StepReports;
  subagentCards: SubagentCards;
  subagents: SubagentGroups;
  taskboard: Taskboard;
  timeline: ReturnType<typeof createCodingTimeline>;
  turnChanges: ReturnType<typeof createCodingTurnChanges>;
  usageMeter: UsageMeter;
  writerDirectories: WriterDirectories;
}

/** What every function of the page is given: the Host's side, the page's markup, its memory and its pieces. */
export interface Page {
  readonly host: CodingHost;
  readonly L: Translate;
  readonly root: HTMLElement;
  readonly directory: HTMLElement;
  readonly lifetime: Lifetime;
  readonly q: Query;
  readonly turns: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly s: State;
  /** Filled in as the page mounts; nothing reads a piece before the stage that makes it. */
  readonly refs: Refs;
}
