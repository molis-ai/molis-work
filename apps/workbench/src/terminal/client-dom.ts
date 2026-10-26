import type { StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

export type TerminalTranslate = (zh: string, vars?: Record<string, string | number>) => string;
export type TerminalStatusTone = "idle" | "busy" | "live" | "error";
export type TerminalStatus = (text: string, tone?: TerminalStatusTone, state?: StateRingState) => void;

/** The Goal terminal pane's parts, as the Goals page renders them (`renderTerminalPane`). */
export interface TerminalPaneElements {
  readonly pane: HTMLElement;
  readonly tabsEl: HTMLElement;
  readonly terminalHost: HTMLElement;
  readonly emptyEl: HTMLElement | null;
  readonly statusEl: HTMLElement | null;
  readonly ownerTitleEl: HTMLElement | null;
  readonly ownerStatusEl: HTMLElement | null;
  readonly parentGuardEl: HTMLElement | null;
  readonly childChoicesEl: HTMLElement | null;
  readonly menu: HTMLFormElement;
  readonly advanceBtn: HTMLButtonElement;
  readonly copyBtn: HTMLButtonElement | null;
  readonly fillBtn: HTMLButtonElement;
  readonly reopenBtn: HTMLButtonElement;
  readonly addBtn: HTMLButtonElement;
  readonly emptyAddBtn: HTMLButtonElement | null;
}

export function queryTerminalPane(pane: HTMLElement): TerminalPaneElements {
  return {
    pane,
    tabsEl: pane.querySelector("[data-tui-tabs]") as HTMLElement,
    terminalHost: pane.querySelector("[data-tui-terminal]") as HTMLElement,
    emptyEl: pane.querySelector<HTMLElement>("[data-tui-empty]"),
    statusEl: pane.querySelector<HTMLElement>("[data-tui-status]"),
    ownerTitleEl: pane.querySelector<HTMLElement>("[data-tui-owner-title]"),
    ownerStatusEl: pane.querySelector<HTMLElement>("[data-tui-owner-status]"),
    parentGuardEl: pane.querySelector<HTMLElement>("[data-tui-parent-guard]"),
    childChoicesEl: pane.querySelector<HTMLElement>("[data-tui-child-choices]"),
    menu: pane.querySelector("[data-tui-menu]") as HTMLFormElement,
    advanceBtn: pane.querySelector("[data-tui-advance]") as HTMLButtonElement,
    copyBtn: pane.querySelector<HTMLButtonElement>("[data-tui-copy]"),
    fillBtn: pane.querySelector("[data-tui-fill]") as HTMLButtonElement,
    reopenBtn: pane.querySelector("[data-tui-reopen]") as HTMLButtonElement,
    addBtn: pane.querySelector("[data-tui-add]") as HTMLButtonElement,
    emptyAddBtn: pane.querySelector<HTMLButtonElement>("[data-tui-empty-add]"),
  };
}

export function paintTerminalStatus(node: HTMLElement | null, text: string, tone: TerminalStatusTone, state?: StateRingState) {
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = text ? tone : "";
  if (text) node.dataset.mwState = state ?? (tone === "live" ? "done" : tone === "busy" ? "running" : tone === "error" ? "failed" : "idle");
  else delete node.dataset.mwState;
}

/** The page toast, or the pane status when the page has none. */
export function createPageToast(setStatus: TerminalStatus) {
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  return (message: string, error = false) => {
    const toast = document.querySelector("[data-toast]") as HTMLElement | null;
    if (!toast) {
      setStatus(message, error ? "error" : "idle");
      return;
    }
    toast.textContent = message; toast.dataset.mwState = error ? "failed" : "done";
    toast.classList.toggle("is-error", error);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  };
}

export const errorText = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
