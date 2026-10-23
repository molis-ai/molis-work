import type { TerminalPaneElements, TerminalStatus, TerminalTranslate } from "./client-dom.js";
import type { TerminalGuard } from "./client-guard.js";
import type { TerminalRequest } from "./types.js";

export interface TerminalMenuOptions {
  els: TerminalPaneElements;
  text: TerminalTranslate;
  route(path: string): string;
  request: TerminalRequest;
  guard: TerminalGuard;
  setStatus: TerminalStatus;
  openPanel(body: Record<string, unknown>): Promise<void>;
}

/** The "add terminal" menu: Runtime choice, availability marks, and the custom command. */
export function createTerminalMenu(options: TerminalMenuOptions) {
  const { els, text: L, guard, setStatus } = options;
  const { menu, addBtn, emptyAddBtn } = els;
  const genericFields = menu.querySelector("[data-tui-generic-fields]") as HTMLElement | null;
  const genericOpen = menu.querySelector("[data-tui-generic-open]") as HTMLButtonElement | null;
  const firstEnabledKind = () => (menu.querySelector("[data-tui-kind]:not(:disabled)") as HTMLButtonElement | null)?.dataset.tuiKind;
  let selectedKind = firstEnabledKind() || "generic";
  let returnTarget = addBtn;

  const resumeId = () => String(new FormData(menu).get("resume_session_id") || "").trim() || undefined;

  const setKind = (kind: string) => {
    selectedKind = kind;
    if (genericFields) genericFields.hidden = kind !== "generic";
    if (genericOpen) genericOpen.hidden = kind !== "generic";
    menu.querySelectorAll("[data-tui-kind]").forEach((button) => {
      button.classList.toggle("is-selected", (button as HTMLElement).dataset.tuiKind === kind);
    });
  };

  const setMenuOpen = (open: boolean) => {
    if (open && guard.readOnly()) {
      setStatus(L("请进入一个具体的子 Goal"), "error");
      return;
    }
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    addBtn.setAttribute("aria-expanded", String(open));
    emptyAddBtn?.setAttribute("aria-expanded", String(open));
    if (open) {
      menu.removeAttribute("inert");
      setKind(selectedKind);
      requestAnimationFrame(() => {
        if (menu.classList.contains("is-open")) (menu.querySelector(`[data-tui-kind="${selectedKind}"]`) as HTMLButtonElement | null)?.focus();
      });
      return;
    }
    menu.setAttribute("inert", "");
  };

  const refreshRuntimeAvailability = async () => {
    const availability = await options.request<Record<string, boolean>>(options.route("/api/runtime-availability"));
    menu.querySelectorAll<HTMLButtonElement>("[data-tui-kind]:not([data-tui-kind=generic])").forEach((button) => {
      const kind = button.dataset.tuiKind ?? "";
      const available = availability[kind] !== false;
      button.disabled = !available;
      if (available) {
        button.removeAttribute("title");
        button.querySelector("small")?.remove();
        return;
      }
      button.title = L("需要先安装 CLI");
      if (!button.querySelector("small")) {
        const hint = document.createElement("small");
        hint.textContent = L("未安装");
        button.append(hint);
      }
    });
    if ((menu.querySelector(`[data-tui-kind="${selectedKind}"]`) as HTMLButtonElement | null)?.disabled) {
      setKind(firstEnabledKind() ?? "generic");
    }
  };

  const closeAndReturn = () => {
    setMenuOpen(false);
    returnTarget.focus();
  };

  const listen = () => {
    emptyAddBtn?.addEventListener("click", () => {
      returnTarget = emptyAddBtn;
      setMenuOpen(true);
    });
    addBtn.addEventListener("click", () => {
      returnTarget = addBtn;
      if (guard.readOnly()) {
        setStatus(guard.parentReadOnlyMessage(), "error");
        return;
      }
      setMenuOpen(!menu.classList.contains("is-open"));
    });
    menu.querySelector("[data-tui-menu-cancel]")?.addEventListener("click", closeAndReturn);
    document.addEventListener("pointerdown", (event) => {
      if (!menu.classList.contains("is-open")) return;
      const target = event.target as Node;
      if (menu.contains(target) || addBtn.contains(target) || emptyAddBtn?.contains(target)) return;
      setMenuOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !menu.classList.contains("is-open")) return;
      event.preventDefault();
      closeAndReturn();
    });
    menu.querySelectorAll("[data-tui-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = (button as HTMLElement).dataset.tuiKind || "generic";
        setKind(kind);
        if (kind === "generic") {
          menu.querySelector<HTMLInputElement>("input[name=command]")?.focus();
          return;
        }
        void options.openPanel({ runtime_kind: kind, resume_session_id: resumeId() });
      });
    });
    menu.addEventListener("submit", (event) => {
      event.preventDefault();
      const command = String(new FormData(menu).get("command") || "").trim();
      void options.openPanel({
        runtime_kind: selectedKind,
        command: selectedKind === "generic" ? command : undefined,
        resume_session_id: resumeId(),
      });
    });
  };

  return { setMenuOpen, refreshRuntimeAvailability, listen };
}
