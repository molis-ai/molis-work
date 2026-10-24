import type { UiClientTranslate as Translate, UiPageView, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkflowInstance, WorkflowLink, WorkflowPayload, WorkflowPayloadField, WorkflowStation } from "../model.js";

export type { Translate, WorkflowPayload, WorkflowStartItem };

/** What the workbench hands the Workflows client: the shared host fields it uses, and the shell's view for an embedded step. */
export interface WorkflowsHost extends Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "translate" | "route" | "pluginRoute" | "pluginId" | "readRefusal"> {
  readonly view: Pick<UiPageView<HTMLElement>, "embed">;
}

/** One request to the Workflows routes; `path` follows `/workflows`. Without a `body` it reads; with one it writes. */
export type WorkflowsRequest = <T>(path: string, body?: Record<string, unknown>) => Promise<T>;

export type ActionRef = { readonly capability_id: string; readonly version: number; readonly provider_id: string };

/** A station as a described chain carries it: `availability` says whether its plugin can still be read and handed to. */
export interface Station extends WorkflowStation {
  readonly availability?: { readonly available: boolean; readonly reason?: string };
}

/** The chain as the editor changes it: both lists are replaced as a whole, never edited in place. */
export interface Chain { stations: Station[]; links: WorkflowLink[] }

export interface Flow extends Chain {
  readonly workflow_id: string;
  title: string;
  revision: number;
}
export interface FlowSummary extends Flow { readonly instance_count: number; readonly active_count: number }

/** A run, with the stations of its starting chain described. */
export type Run = Omit<WorkflowInstance, "chain"> & { readonly chain: { readonly stations: readonly Station[]; readonly links: readonly WorkflowLink[] } };

/** A plugin the chain can use, as the Host lists it. */
export interface StationInfo {
  readonly plugin: string;
  readonly label: string;
  readonly icon: string;
  readonly supported: boolean;
  readonly can_start_blank?: boolean;
  readonly receives?: boolean;
}

export interface JudgmentChoice {
  readonly ref: ActionRef;
  readonly title: string;
  readonly choices: readonly string[];
  readonly available: boolean;
  readonly reason?: string;
}

export interface ActionField { readonly name: string; readonly type: string; readonly required: boolean; readonly title?: string; readonly enum?: readonly (string | number | boolean)[] }
export interface ActionChoice {
  readonly ref: ActionRef;
  readonly title: string;
  readonly description?: string;
  readonly group: string;
  readonly fields: readonly ActionField[];
  readonly available: boolean;
  readonly reason?: string;
}

/** Where one input of an action step comes from while the person is still editing: a fixed value may be empty or unset. */
export type MapSource = { readonly from: PayloadFieldName } | { readonly value: string | number | boolean | undefined };
export type PayloadFieldName = WorkflowPayloadField;
export interface StepDraft { ref: ActionRef | null; title: string; group?: string; mapping: Record<string, MapSource> }

export interface Returning { readonly workflow: string; readonly instance: string; readonly step: number; readonly title: string }
export interface ManualHandoff { readonly index: number; readonly mode: "manual"; readonly input: WorkflowPayload; draft: { title: string; body: string } }
export interface Busy { readonly index: number; readonly kind: "preview" | "handoff" }

/** What the person is looking at: the list, one workflow, one run, and what is open over them. */
export interface Ui {
  workflows: FlowSummary[];
  stations: StationInfo[];
  ai: boolean;
  loaded: boolean;
  judgments: JudgmentChoice[] | null;
  actionSteps: ActionChoice[] | null;
  stepDraft: StepDraft | null;
  stepQuery: string;
  stepIndex: number | null;
  workflow: Flow | null;
  instances: Run[];
  instance: Run | null;
  instanceWorkflowTitle: string;
  step: number;
  handoff: ManualHandoff | null;
  busy: Busy | null;
  openLink: number | null;
  openGap: number | null;
  returnTo: Returning | null;
}

export interface Ready { readonly ready: boolean; readonly reason: string }

/** A change to the open workflow: its chain and/or its title; the rest says how the change reads to the person. */
export interface Patch { chain?: Chain; title?: string; undoable?: boolean; announce?: string }
/** What the open workflow has not saved yet. `pending` counts writes in flight. */
export interface Edit { flow: Flow; patch: { chain?: Chain; title?: string }; pending: number; error: string | null }
export interface PendingEdit { flow: Flow; patch: Patch; timer: ReturnType<typeof setTimeout> }
export interface Undo { id: string; chain: Chain }

export interface ListAnswer { workflows: FlowSummary[]; stations: StationInfo[]; ai_available: boolean }
export interface FlowAnswer { workflow: Flow; instances: Run[]; ai_available: boolean }
export interface RunAnswer { instance: Run; workflow_title: string; ai_available: boolean }
export interface InstanceAnswer { instance: Run }
export interface SaveAnswer { workflow: Flow }
export interface PicksAnswer { items: WorkflowStartItem[]; can_start_blank: boolean }
export interface PreviewAnswer { input: WorkflowPayload }
