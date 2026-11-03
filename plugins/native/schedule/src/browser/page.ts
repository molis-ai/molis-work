import { required } from "./dom.js";
import type { OperationReview, ReminderReview, ScheduleHost, Translate } from "./types.js";

/** Everything the Schedule client shares between its parts: the page's elements and what is open on it. */
export interface SchedulePage {
  readonly host: ScheduleHost;
  readonly L: Translate;
  readonly workbench: HTMLElement;
  readonly list: HTMLElement;
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
  readonly errorEl: HTMLElement;
  readonly recoveryDialog: HTMLDialogElement;
  readonly recoveryForm: HTMLFormElement;
  readonly recoveryError: HTMLElement;
  readonly operationDialog: HTMLDialogElement;
  readonly operationForm: HTMLFormElement;
  /** The task the dialog edits ("" while it makes a new one). */
  editingTaskId: string;
  /** A write of the dialog is on its way: nothing in it can be used or closed. */
  creating: boolean;
  recovery: ReminderReview | null;
  recovering: boolean;
  operationReview: OperationReview | null;
  operationBusy: boolean;
  /** Counts the openings of the dialog, so a readiness answer from an earlier one is not shown in this one. */
  hinting: number;
}

/** The page of a mounted Schedule client, or null when this root has no Schedule workbench. */
export function createPage(host: ScheduleHost): SchedulePage | null {
  const workbench = document.querySelector<HTMLElement>("[data-schedule-workbench]"), list = document.querySelector<HTMLElement>("[data-schedule-list]");
  if (!workbench || !list) return null;
  return {
    host, L: host.translate, workbench, list,
    dialog: required<HTMLDialogElement>(workbench, "[data-schedule-create-dialog]"),
    form: required<HTMLFormElement>(workbench, "[data-schedule-create-form]"),
    errorEl: required(workbench, "[data-schedule-create-error]"),
    recoveryDialog: required<HTMLDialogElement>(workbench, "[data-schedule-recovery-dialog]"),
    recoveryForm: required<HTMLFormElement>(workbench, "[data-schedule-recovery-form]"),
    recoveryError: required(workbench, "[data-schedule-recovery-error]"),
    operationDialog: required<HTMLDialogElement>(workbench, "[data-schedule-operation-dialog]"),
    operationForm: required<HTMLFormElement>(workbench, "[data-schedule-operation-form]"),
    editingTaskId: "", creating: false, recovery: null, recovering: false, operationReview: null, operationBusy: false, hinting: 0,
  };
}
