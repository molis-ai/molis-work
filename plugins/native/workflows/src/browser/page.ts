import { required } from "./dom.js";
import { workflowsRequest } from "./request.js";
import type { Edit, PendingEdit, Translate, Ui, Undo, WorkflowsHost, WorkflowsRequest } from "./types.js";

export interface ToastAction { readonly label: string; readonly run: () => void }
export type Dragging = { readonly plugin: string } | { readonly from: number };

/**
 * One Workflows page: its host, the nodes the server drew and what it remembers between events. Every part of the client
 * (src/browser/*) takes this one object; nothing else holds page state.
 */
export interface WorkflowsPage {
  readonly host: WorkflowsHost;
  readonly L: Translate;
  readonly api: WorkflowsRequest;
  readonly root: HTMLElement;
  readonly listEl: HTMLElement;
  readonly space: HTMLElement;
  readonly view: HTMLElement;
  readonly pop: HTMLElement;
  readonly dlg: HTMLDialogElement;
  readonly formEl: HTMLFormElement;
  readonly toastEl: HTMLElement;
  readonly ui: Ui;
  /** What each open workflow has not saved yet, and the changes waiting out their delay. */
  readonly edits: Map<string, Edit>;
  readonly pendingEdits: Map<string, PendingEdit>;
  readonly undos: Undo[];
  toastId: ReturnType<typeof setTimeout> | undefined;
  toastAct: ToastAction | null;
  /** Counts navigations: an answer that arrives for an older one is dropped. */
  navId: number;
  /** The station to focus once the chain is drawn again. */
  focusNext: string | null;
  /** Saves run one after the other. */
  queue: Promise<void>;
  saveId: ReturnType<typeof setTimeout> | undefined;
  /** Where the open popover hangs; null while it is closed. */
  popAt: (() => Element | null) | null;
  submitForm: (() => Promise<void>) | null;
  lastRun: { id: string | null; steps: string[] | null; links: string[] | null };
  started: boolean;
  listReady: Promise<void> | null;
  /** The workflow the shell asked for (null for none), and whether it asked quietly. */
  pickedItem: string | null | undefined;
  pickedQuiet: boolean;
  dragging: Dragging | null;
  dropGap: number | null;
  dragFrom: HTMLElement | null;
}

export function createPage(host: WorkflowsHost, root: HTMLElement): WorkflowsPage {
  const L = host.translate;
  return {
    host, L, api: workflowsRequest(host, L), root,
    listEl: required(root, "[data-wf-list]"),
    space: required(root, "[data-wf-workspace]"),
    view: required(root, "[data-wf-view]"),
    pop: required(root, "[data-wf-pop]"),
    dlg: required<HTMLDialogElement>(root, "[data-wf-dialog]"),
    formEl: required<HTMLFormElement>(root, "[data-wf-dialog-form]"),
    toastEl: required(root, "[data-wf-toast]"),
    ui: {
      workflows: [], stations: [], ai: false, loaded: false, judgments: null, actionSteps: null, stepDraft: null, stepQuery: "", stepIndex: null,
      workflow: null, instances: [], instance: null, instanceWorkflowTitle: "", step: 0, handoff: null, busy: null, openLink: null, openGap: null, returnTo: null,
    },
    edits: new Map(), pendingEdits: new Map(), undos: [],
    toastId: undefined, toastAct: null, navId: 0, focusNext: null, queue: Promise.resolve(), saveId: undefined, popAt: null, submitForm: null,
    lastRun: { id: null, steps: null, links: null }, started: false, listReady: null, pickedItem: undefined, pickedQuiet: false,
    dragging: null, dropGap: null, dragFrom: null,
  };
}
