import type { UiDefinitionRef, UiDevicePreferences, UiEnvironmentSnapshot } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkbenchAppearance } from "../appearance-document.js";
import { withDevicePreferences } from "@molis-ai/molis-work-plugin-sdk/ui";

export type AppearanceProjection = Pick<WorkbenchAppearance, "snapshot" | "stylesheet">;
export type AppearanceDimension = "skin" | "font" | "mono";
export const appearanceRef = ({ id, revision }: UiDefinitionRef): string => `${id}@${revision}`;

export function readDocumentAppearance(): WorkbenchAppearance | null {
  const node = document.getElementById("ui-environment");
  if (!node?.dataset.selection) return null;
  return { snapshot: JSON.parse(node.textContent ?? ""), stylesheet: node.dataset.stylesheet || null,
    selection: JSON.parse(node.dataset.selection), selection_revision: node.dataset.selectionRevision ? Number(node.dataset.selectionRevision) : null };
}

export function setAppearanceScope(root: HTMLElement, snapshot: UiEnvironmentSnapshot): void {
  Object.assign(root.dataset, { uiSkin: appearanceRef(snapshot.skin), uiFont: appearanceRef(snapshot.font.scheme), uiMono: appearanceRef(snapshot.font.mono) });
}

export function documentDevice(): UiDevicePreferences {
  const { theme, resolvedTheme, density, terminalTheme, resolvedTerminalTheme } = document.documentElement.dataset;
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    resolved_theme: resolvedTheme === "dark" ? "dark" : "light",
    density: density === "compact" ? density : "standard",
    terminal_theme: terminalTheme === "light" || terminalTheme === "dark" ? terminalTheme : "auto",
    resolved_terminal_theme: resolvedTerminalTheme === "dark" ? "dark" : "light",
    reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

export const withDocumentDevice = (snapshot: UiEnvironmentSnapshot): UiEnvironmentSnapshot =>
  withDevicePreferences(snapshot, documentDevice());

type DocumentAppearanceProblem = "partial" | "loading-failed";

/** Keep the visible projection and its device preferences in the document's existing snapshot element. */
export function mountDocumentAppearance(initial: WorkbenchAppearance, report: (problem: DocumentAppearanceProblem | null) => void) {
  const data = document.getElementById("ui-environment")!;
  let rendered = withDocumentDevice(initial.snapshot), generation = 0;
  let problem: DocumentAppearanceProblem | null = null;
  const status = (next: DocumentAppearanceProblem | null) => {
    problem = next;
    report(next);
  };
  const deviceChanged = () => {
    rendered = withDocumentDevice(rendered);
    data.textContent = JSON.stringify(rendered);
  };
  data.textContent = JSON.stringify(rendered);
  new MutationObserver(deviceChanged).observe(document.documentElement, { attributes: true,
    attributeFilter: ["data-theme", "data-resolved-theme", "data-density", "data-terminal-theme", "data-resolved-terminal-theme"] });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", deviceChanged);

  const failed = (turn: number) => {
    if (turn === generation) status("loading-failed");
  };
  if (initial.stylesheet) {
    const turn = generation;
    void prepareAppearance(initial).catch(() => failed(turn));
  }
  if (initial.snapshot.problems.length) status("partial");

  return {
    present(next: WorkbenchAppearance) {
      const turn = ++generation;
      const commit = () => {
        if (turn !== generation) return;
        const snapshot = withDocumentDevice(next.snapshot);
        setAppearanceScope(document.documentElement, snapshot);
        data.textContent = JSON.stringify(snapshot);
        data.dataset.stylesheet = next.stylesheet ?? "";
        data.dataset.selection = JSON.stringify(next.selection);
        data.dataset.selectionRevision = String(next.selection_revision ?? "");
        const previous = rendered;
        rendered = snapshot;
        announceAppearance(snapshot, previous);
        status(next.snapshot.problems.length ? "partial" : null);
      };
      if (rendered.revision === next.snapshot.revision && !problem) { commit(); return; }
      void prepareAppearance(next).then(() => {
        if (turn === generation) globalThis.molisWorkLookFade(commit);
      }, () => failed(turn));
    },
    dismissProblem() { status(null); },
  };
}

export function announceAppearance(snapshot: UiEnvironmentSnapshot, previous: UiEnvironmentSnapshot): void {
  const changed: AppearanceDimension[] = [];
  if (appearanceRef(snapshot.skin) !== appearanceRef(previous.skin)) changed.push("skin");
  if (appearanceRef(snapshot.font.scheme) !== appearanceRef(previous.font.scheme) || snapshot.font.policy !== previous.font.policy) changed.push("font");
  if (appearanceRef(snapshot.font.mono) !== appearanceRef(previous.font.mono)) changed.push("mono");
  if (changed.length) window.dispatchEvent(new CustomEvent("molis-work:ui-environment-changed", { detail: { revision: snapshot.revision, changed } }));
}

let pendingSheet: { href: string; ready: Promise<void> } | undefined;
let refreshFaces = false;

/** One exact Host sheet per document. A failed face can be retried with new CSSFontFace objects. */
export function ensureAppearanceSheet(href: string | null): Promise<void> {
  if (!href) return Promise.resolve();
  if (pendingSheet?.href === href) return pendingSheet.ready;
  const prior = document.querySelector<HTMLLinkElement>("link[data-ui-appearance-sheet]");
  if (prior?.getAttribute("href") === href && prior.sheet && !refreshFaces) return Promise.resolve();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const ready = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      pendingSheet = undefined;
      if (!loaded) { link.remove(); reject(new Error("appearance stylesheet")); return; }
      prior?.remove();
      link.dataset.uiAppearanceSheet = "";
      refreshFaces = false;
      resolve();
    };
    const timeout = setTimeout(() => finish(false), 12_000);
    link.addEventListener("load", () => finish(true), { once: true });
    link.addEventListener("error", () => finish(false), { once: true });
    document.head.append(link);
  });
  pendingSheet = { href, ready };
  return ready;
}

function checkFonts(scope: HTMLElement, sample: string): Promise<void> {
  const style = getComputedStyle(scope), families = style.getPropertyValue("--mw-shipped-families").trim();
  if (!families || families === "none") return Promise.resolve();
  const weights = new Set(["body", "control", "title"].map(role => style.getPropertyValue(`--weight-${role}`).trim() || "400"));
  return new Promise((resolve, reject) => {
    const failed = () => { refreshFaces = true; reject(new Error("appearance font")); };
    const timer = setTimeout(failed, 12_000);
    void Promise.all([...weights].map(weight => document.fonts.load(`${weight} 1em ${families}`, sample))).then(
      () => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); failed(); },
    );
  });
}

/** A document prepares new faces in a probe before touching its live root. The specimen can prepare in its own scope. */
export async function prepareAppearance({ snapshot, stylesheet }: AppearanceProjection, canvas?: HTMLElement): Promise<void> {
  if (canvas) setAppearanceScope(canvas, snapshot);
  await ensureAppearanceSheet(stylesheet);
  if (!stylesheet) return;
  const scope = canvas ?? document.createElement("span");
  if (!canvas) {
    setAppearanceScope(scope, snapshot);
    scope.hidden = true;
    document.body.append(scope);
  }
  try { await checkFonts(scope, snapshot.locale.tag === "zh" ? "本周工作 Aa 123" : "Work Aa 123"); }
  finally { if (!canvas) scope.remove(); }
}
