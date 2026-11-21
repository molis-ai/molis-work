import type {
  AutosaveController,
  AutosaveOptions,
  AutosaveState,
  MolisBusyOptions,
  MolisToastOptions,
  OptimisticToggleOptions,
} from "@molis-ai/molis-work-plugin-sdk/page-globals";

/**
 * Shared platform feedback & interaction runtime primitives (Decision 60 / UXP-01..05):
 * - `window.molisBusy(button, work, options)` — button-only lock with 250ms silent spinner threshold (never freezes whole page).
 * - `window.molisToast(message, options)` — 3 duration tiers (2600 / 4200 / 7000ms), hover/focus pause, undo/action, --helm-h clearance.
 * - `window.molisAutosave(target, save, options)` — 5-state autosave (idle -> dirty -> saving -> saved | error) with 250ms threshold.
 * - `window.molisOptimisticToggle(control, work, options)` — instant flip with error rollback + toast.
 * - `window.molisEnhanceDateInputs(root)` — progressive enhancement for `[data-mw-date]` / `[data-mw-time]` inputs.
 */

const TOAST_MS = {
  short: 2600,
  normal: 4200,
  long: 7000,
} as const;

const busyButtons = new WeakSet<HTMLElement>();

function readLocaleText(key: string, fallback: string): string {
  const reader = (globalThis as { t?: { text?: (k: string) => string } }).t?.text;
  if (typeof reader !== "function") {
    return fallback;
  }
  try {
    const value = reader(key);
    if (value && value !== key) {
      return value;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

async function molisBusy<T>(
  button: HTMLButtonElement | HTMLElement,
  work: () => Promise<T>,
  options: MolisBusyOptions = {},
): Promise<T> {
  if (busyButtons.has(button)) {
    return Promise.reject(new Error("Action already in progress"));
  }
  busyButtons.add(button);
  const delayMs = options.delayMs ?? 250;
  const wasDisabled = "disabled" in button ? Boolean((button as HTMLButtonElement).disabled) : false;
  if ("disabled" in button) {
    (button as HTMLButtonElement).disabled = true;
  }
  button.setAttribute("aria-busy", "true");
  const holder: { spinner: HTMLSpanElement | null; shown: boolean } = {
    spinner: null,
    shown: false,
  };
  const timer = window.setTimeout(() => {
    if (!button.isConnected) {
      return;
    }
    holder.shown = true;
    button.setAttribute("data-loading", "");
    if (!button.querySelector(":scope > .mw-spinner")) {
      const node = document.createElement("span");
      node.className = "mw-spinner";
      node.setAttribute("aria-hidden", "true");
      node.dataset.slot = "button-loading-indicator";
      button.prepend(node);
      holder.spinner = node;
    }
  }, delayMs);
  try {
    return await work();
  } finally {
    window.clearTimeout(timer);
    busyButtons.delete(button);
    button.removeAttribute("aria-busy");
    if (holder.shown) {
      button.removeAttribute("data-loading");
    }
    if (holder.spinner && holder.spinner.isConnected) {
      holder.spinner.remove();
    }
    if ("disabled" in button) {
      (button as HTMLButtonElement).disabled = wasDisabled;
    }
  }
}

let hostToastNode: HTMLDivElement | null = null;
let hostToastTimer = 0;
let hostToastRemaining = 0;
let hostToastStartedAt = 0;
let hostToastPaused = false;

function ensureHostToast(): HTMLDivElement {
  if (hostToastNode && hostToastNode.isConnected) {
    return hostToastNode;
  }
  const existing = document.querySelector<HTMLDivElement>("[data-molis-host-toast]");
  if (existing) {
    hostToastNode = existing;
    return existing;
  }
  const node = document.createElement("div");
  node.className = "mw-toast mw-toast--host";
  node.dataset.molisHostToast = "";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.hidden = true;
  node.addEventListener("pointerenter", pauseHostToast);
  node.addEventListener("focusin", pauseHostToast);
  node.addEventListener("pointerleave", resumeHostToast);
  node.addEventListener("focusout", resumeHostToast);
  document.body.append(node);
  hostToastNode = node;
  return node;
}

function hideHostToast(): void {
  window.clearTimeout(hostToastTimer);
  hostToastTimer = 0;
  hostToastRemaining = 0;
  hostToastPaused = false;
  if (!hostToastNode) {
    return;
  }
  hostToastNode.hidden = true;
  hostToastNode.classList.remove("is-visible", "is-error");
}

function pauseHostToast(): void {
  if (!hostToastTimer || hostToastPaused) {
    return;
  }
  hostToastPaused = true;
  window.clearTimeout(hostToastTimer);
  hostToastTimer = 0;
  const elapsed = Date.now() - hostToastStartedAt;
  hostToastRemaining = Math.max(800, hostToastRemaining - elapsed);
}

function resumeHostToast(): void {
  if (!hostToastPaused || !hostToastNode || hostToastNode.hidden) {
    return;
  }
  hostToastPaused = false;
  hostToastStartedAt = Date.now();
  hostToastTimer = window.setTimeout(hideHostToast, hostToastRemaining);
}

function resolveToastDuration(opts: MolisToastOptions): number {
  if (typeof opts.duration === "number" && Number.isFinite(opts.duration)) {
    return Math.max(1200, opts.duration);
  }
  if (typeof opts.duration === "string" && opts.duration in TOAST_MS) {
    return TOAST_MS[opts.duration];
  }
  if (opts.tone === "error" || opts.action || opts.undo) {
    return TOAST_MS.long;
  }
  if (opts.tone === "warning") {
    return TOAST_MS.normal;
  }
  return TOAST_MS.short;
}

function molisToast(message: string, options: boolean | MolisToastOptions = {}): void {
  const opts: MolisToastOptions = typeof options === "boolean"
    ? { tone: options ? "error" : "default" }
    : options;
  const node = ensureHostToast();
  window.clearTimeout(hostToastTimer);
  hostToastTimer = 0;
  hostToastPaused = false;
  node.replaceChildren();
  const label = document.createElement("span");
  label.textContent = message;
  node.append(label);
  const isError = opts.tone === "error";
  node.classList.toggle("is-error", isError);
  if (opts.tone === "success") {
    node.dataset.mwState = "done";
  } else if (opts.tone === "error") {
    node.dataset.mwState = "failed";
  } else if (opts.tone === "warning") {
    node.dataset.mwState = "waiting";
  } else {
    delete node.dataset.mwState;
  }
  const actionSpec = opts.action ?? (opts.undo
    ? {
        label: opts.undoLabel ?? readLocaleText("common.control.undo", "Undo"),
        onClick: opts.undo,
      }
    : undefined);
  if (actionSpec) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mw-toast__action";
    btn.dataset.toastAction = "";
    btn.textContent = actionSpec.label;
    btn.addEventListener("click", () => {
      hideHostToast();
      actionSpec.onClick();
    }, { once: true });
    node.append(btn);
  }
  node.hidden = false;
  node.classList.add("is-visible");
  hostToastRemaining = resolveToastDuration(opts);
  hostToastStartedAt = Date.now();
  hostToastTimer = window.setTimeout(hideHostToast, hostToastRemaining);
}

function molisAutosave(
  target: HTMLElement,
  save: () => Promise<unknown>,
  options: AutosaveOptions = {},
): AutosaveController {
  const debounceMs = options.debounceMs ?? 600;
  const delayMs = options.delayMs ?? 250;
  const savedHoldMs = options.savedHoldMs ?? 2200;
  let state: AutosaveState = "idle";
  let debounceTimer = 0;
  let savingTimer = 0;
  let savedTimer = 0;
  let disposed = false;
  let sequence = 0;

  const setState = (next: AutosaveState, error?: unknown) => {
    state = next;
    target.dataset.autosaveState = next;
    if (options.statusEl) {
      const text = options.labels?.[next] ?? "";
      options.statusEl.textContent = text;
      options.statusEl.dataset.autosaveState = next;
    }
    options.onStateChange?.(next, error);
  };

  const clearTimers = () => {
    window.clearTimeout(debounceTimer);
    window.clearTimeout(savingTimer);
    window.clearTimeout(savedTimer);
    debounceTimer = 0;
    savingTimer = 0;
    savedTimer = 0;
  };

  const runSave = async (): Promise<boolean> => {
    if (disposed) {
      return false;
    }
    clearTimers();
    sequence += 1;
    const current = sequence;
    savingTimer = window.setTimeout(() => {
      if (disposed || current !== sequence) {
        return;
      }
      setState("saving");
    }, delayMs);
    try {
      await save();
      window.clearTimeout(savingTimer);
      savingTimer = 0;
      if (disposed || current !== sequence) {
        return false;
      }
      setState("saved");
      savedTimer = window.setTimeout(() => {
        if (!disposed && current === sequence && state === "saved") {
          setState("idle");
        }
      }, savedHoldMs);
      return true;
    } catch (error) {
      window.clearTimeout(savingTimer);
      savingTimer = 0;
      if (disposed || current !== sequence) {
        return false;
      }
      setState("error", error);
      return false;
    }
  };

  setState("idle");

  return {
    get state() {
      return state;
    },
    markDirty() {
      if (disposed) {
        return;
      }
      window.clearTimeout(debounceTimer);
      window.clearTimeout(savedTimer);
      setState("dirty");
      debounceTimer = window.setTimeout(() => {
        void runSave();
      }, debounceMs);
    },
    flush() {
      return runSave();
    },
    retry() {
      return runSave();
    },
    dispose() {
      disposed = true;
      clearTimers();
    },
  };
}

async function molisOptimisticToggle(
  control: HTMLInputElement | HTMLButtonElement,
  work: (next: boolean) => Promise<unknown>,
  options: OptimisticToggleOptions = {},
): Promise<boolean> {
  const isCheckbox = control instanceof HTMLInputElement;
  const previous = isCheckbox
    ? control.checked
    : control.getAttribute("aria-pressed") === "true";
  const next = !previous;
  const apply = (value: boolean) => {
    if (isCheckbox) {
      control.checked = value;
    } else {
      control.setAttribute("aria-pressed", String(value));
    }
  };
  apply(next);
  control.setAttribute("aria-busy", "true");
  try {
    await work(next);
    return next;
  } catch (error) {
    apply(previous);
    options.onRollback?.(error);
    const msg = options.errorMessage
      ?? (error instanceof Error && error.message ? error.message : readLocaleText("common.confirm-box.action-failed", "Action failed"));
    molisToast(msg, { tone: "error" });
    return previous;
  } finally {
    control.removeAttribute("aria-busy");
  }
}

function molisEnhanceDateInputs(root: ParentNode = document): void {
  const selector = 'input[type="date"][data-mw-date], input[type="time"][data-mw-time], input[type="datetime-local"][data-mw-date]';
  const inputs = root.querySelectorAll<HTMLInputElement>(selector);
  for (const input of inputs) {
    if (input.dataset.mwDateBound === "true") {
      continue;
    }
    input.dataset.mwDateBound = "true";
    input.classList.add("mw-input", "mw-date-input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.blur();
      }
    });
  }
}

window.molisBusy ??= molisBusy;
window.molisToast ??= molisToast;
window.molisAutosave ??= molisAutosave;
window.molisOptimisticToggle ??= molisOptimisticToggle;
window.molisEnhanceDateInputs ??= molisEnhanceDateInputs;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => molisEnhanceDateInputs(document), { once: true });
} else {
  molisEnhanceDateInputs(document);
}
