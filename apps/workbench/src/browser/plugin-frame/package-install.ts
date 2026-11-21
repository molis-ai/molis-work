import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiPackageInstallOutcome, UiPackageInstallTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import { PACKAGE_INSTALL_HEIGHTS, packageInstallChoices, packageInstallHeight, packageInstallHtml, packageInstallKeys, packageInstallSummary, type PackageInstallSheet, type PackageInstallView } from "../../package-install-card.js";
import type { FramedArea, PageFramedAreas } from "./framed-area.js";
import { childPlaces } from "./over-frame.js";
import type { FrameScope, PackageInstallDown, PackageInstallUp, Translate } from "./types.js";

/**
 * 原处的安装单 (specs/plugin-builder-upgrade/spec.md §7.0, S-package-install-sheet): a page keeps an empty element and hands the shell a
 * signed package; the shell draws the install sheet outside the page's frame on that place (the framed-area registry of 18 P3) and asks
 * the Host what the package is. What the sheet shows comes from the Host's verified answer, never from the page; the person's switches
 * and the keys they type stay here; and installing is the person's own deliberate press in the sheet, made as the person through the
 * Host's page route. The page hears which plugin and version is installed now, that the person put it off, or a refusal's code.
 */

/** The one thing the page hears when a sheet cannot be drawn, whatever the reason. */
export const PACKAGE_INSTALL_UNAVAILABLE = "Unavailable";

type Confirmed = { plugin_id: string; version: string; open_surface?: string; permission_changes_failed?: string[] };
interface Entry extends PackageInstallView { id: number; readonly bundle: object; readonly area: FramedArea; width: number; code: string; surface?: string }

const closed = () => new DOMException("Sheet closed", "AbortError");
const KEY = "[data-install-key]", TYPED = "[data-install-key],[data-install-header]";
/** A target exactly as `UiPackageInstallTarget` has it: the signed bundle and nothing more. */
const bundleOf = (value: unknown): object | null => {
  const target = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>, bundle = target.bundle;
  return Object.keys(target).join() === "bundle" && bundle && typeof bundle === "object" && !Array.isArray(bundle) ? bundle : null;
};
/** Where a refused install stopped, by what the refusal is about: the package itself, starting it, or putting it in. */
const stoppedAt = (code: string) => /package|signature|publisher|manifest|preview|digest|compatib/u.test(code) ? 0 : /start|activat|sandbox|recover|runtime/u.test(code) ? 2 : 1;

/**
 * The trusted half. `owner` is the page's plugin as the shell lists it; `open` takes the person to the installed plugin and `settings`
 * to 设置 › 插件. The project and the person are the page's authority (the Host route reads them from the outer header), never anything here.
 */
export function pagePackageInstall(port: MessagePort, scope: FrameScope, areas: PageFramedAreas, pageId: string, route: (path: string) => string, translate: Translate,
  owner: () => string, open: (surface: string) => void, settings: () => void) {
  const t: (text: string, values?: Record<string, string | number>) => string = translate;
  let current: Entry | null = null;
  const send = (kind: string, id: number, more: object = {}) => { if (scope.alive) port.postMessage({ type: "package-install-" + kind, id, ...more } as PackageInstallDown); };
  const ask = <T>(body: Record<string, unknown>) => molisWorkRequest<T>(route("/api/host/plugin-page-install"), { body, headers: { "x-molis-context-page": pageId }, scope });
  const live = (entry: Entry) => scope.alive && current === entry;
  const close = () => { const entry = current; if (!entry) return; current = null; entry.area.close(); };
  scope.own(close);
  const draw = (entry: Entry, focus = false) => {
    if (!live(entry)) return;
    const surface = entry.area.surface, held = focus && surface.contains(document.activeElement);
    // What the person has typed stays through a redraw of the same step.
    const typed = new Map([...surface.querySelectorAll<HTMLInputElement>(TYPED)].map(input => [(input.dataset.installKey ?? "") + "|" + (input.dataset.installHeader ?? ""), input.value]));
    surface.dataset.stage = entry.stage;
    entry.area.redraw(packageInstallHtml(translate, owner(), entry));
    for (const input of surface.querySelectorAll<HTMLInputElement>(TYPED)) { const value = typed.get((input.dataset.installKey ?? "") + "|" + (input.dataset.installHeader ?? "")); if (value !== undefined) input.value = value; }
    if (held) surface.querySelector<HTMLElement>("[data-install-focus],[role=status]")?.focus({ preventScroll: true });
  };
  const answer = (entry: Entry, outcome: UiPackageInstallOutcome) => { if (!entry.answered) { entry.answered = true; send("done", entry.id, { outcome }); } };
  /** Folds the sheet into its one line, after the page has its answer. */
  const fold = (entry: Entry, line: string, outcome: UiPackageInstallOutcome) => { answer(entry, outcome); entry.stage = "line"; entry.line = line; entry.busy = false; entry.note = ""; draw(entry, true); };
  const failed = (entry: Entry, error: unknown) => {
    const failure = error as { code?: string; message?: string };
    entry.code = typeof failure.code === "string" ? failure.code : "unknown"; entry.failure = failure.message || t("common.package-install.could-not-install-try-again");
    entry.step = entry.sheet ? stoppedAt(entry.code) : 0; entry.stage = "failed";
  };
  /** Asks the Host what the package is, and shows the sheet, or why there is none. */
  const read = async (entry: Entry) => {
    entry.stage = "loading"; entry.sheet = null; entry.note = ""; entry.busy = true; draw(entry, true);
    try {
      const sheet = await ask<PackageInstallSheet>({ operation: "preview", bundle: entry.bundle });
      if (!live(entry)) return;
      entry.sheet = sheet; entry.on = new Set(packageInstallChoices(sheet).filter(row => row.on).map(row => row.permission));
      entry.stage = sheet.publisher.trusted ? "review" : "untrusted";
      if (!sheet.publisher.trusted) entry.code = "host.package_install.publisher_untrusted";
    } catch (error) { if (!live(entry) || (error as { name?: string }).name === "AbortError") return; failed(entry, error); }
    entry.busy = false; draw(entry, true);
  };
  /** The person's confirmation: the switches as they stand, the keys just typed, one request. */
  const install = async (entry: Entry, secrets: Array<{ name: string; header: string; value: string }>) => {
    const sheet = entry.sheet!;
    entry.stage = "working"; entry.step = 1; entry.busy = true; entry.note = ""; draw(entry, true);
    try {
      const done = await ask<Confirmed>({ operation: "confirm", preview_id: sheet.preview_id, ...(packageInstallChoices(sheet).length ? { optional: [...entry.on] } : {}), ...(secrets.length ? { secrets } : {}) });
      if (!live(entry)) return;
      entry.stage = "done"; entry.surface = done.open_surface; entry.openable = typeof done.open_surface === "string"; entry.unmoved = done.permission_changes_failed?.length ?? 0;
      answer(entry, { status: "installed", plugin_id: String(done.plugin_id), version: String(done.version) });
    } catch (error) { if (!live(entry) || (error as { name?: string }).name === "AbortError") return; failed(entry, error); }
    entry.busy = false; draw(entry);
    // The button that was pressed is gone: the focus it left lands on what came of it.
    if (document.activeElement === document.body || entry.area.surface.contains(document.activeElement)) entry.area.surface.querySelector<HTMLElement>("[data-install-focus]")?.focus({ preventScroll: true });
  };
  const steps: Record<string, (entry: Entry) => void> = {
    later: entry => fold(entry, t("common.package-install.kept-for-later"), { status: "cancelled" }),
    dismiss: entry => fold(entry, t("common.package-install.not-installed"), { status: "failed", code: entry.code }),
    confirm: entry => { if (entry.stage !== "review") return; if (packageInstallKeys(entry).length) { entry.stage = "keys"; entry.note = ""; draw(entry); entry.area.surface.querySelector<HTMLElement>(KEY)?.focus({ preventScroll: true }); } else void install(entry, []); },
    back: entry => { if (entry.stage === "keys") { entry.stage = "review"; entry.note = ""; draw(entry, true); } },
    save: entry => {
      if (entry.stage !== "keys") return;
      const surface = entry.area.surface, keys = [...surface.querySelectorAll<HTMLInputElement>(KEY)], empty = keys.find(input => !input.value.trim());
      if (empty) { entry.note = t("common.package-install.type-the-key-first"); draw(entry); surface.querySelector<HTMLInputElement>(`[data-install-key="${CSS.escape(empty.dataset.installKey!)}"]`)?.focus({ preventScroll: true }); return; }
      void install(entry, keys.map(input => ({ name: input.dataset.installKey!, value: input.value,
        header: surface.querySelector<HTMLInputElement>(`[data-install-header="${CSS.escape(input.dataset.installKey!)}"]`)?.value.trim() || "Authorization" })));
    },
    retry: entry => { if (entry.stage === "failed") void read(entry); },
    settings: () => settings(), manage: () => settings(),
    open: entry => { if (entry.stage === "done" && entry.surface) open(entry.surface); },
  };
  /** One optional permission, on or off: the tile and the foot's line follow in place, so the switch keeps its own motion. */
  const toggle = (entry: Entry, permission: string, pressed: HTMLElement) => {
    if (entry.stage !== "review" || !entry.sheet || !packageInstallChoices(entry.sheet).some(row => row.permission === permission)) return;
    const on = !entry.on.has(permission), chosen = new Set(entry.on);
    if (on) chosen.add(permission); else chosen.delete(permission);
    entry.on = chosen;
    const surface = entry.area.surface, tile = surface.querySelector<HTMLElement>(`[data-framed-control="${CSS.escape("tile:" + permission)}"]`), input = tile?.querySelector("input");
    if (entry.note || !tile || !input) { entry.note = ""; draw(entry); return; }
    tile.dataset.on = String(on);
    // A press on the switch itself is the browser's own toggle; a press elsewhere on the tile moves it here.
    if (pressed !== input) input.checked = on;
    const sum = surface.querySelector("[data-install-sum]"); if (sum) sum.textContent = packageInstallSummary(translate, entry);
  };
  /** A press on one of the sheet's controls: the checks of §3.3 (18 P3), then at most one step. */
  const press = (entry: Entry, event: MouseEvent) => {
    const control = (event.target as Element).closest<HTMLElement>("[data-framed-control]");
    if (!control || !entry.area.surface.contains(control)) return;
    const name = control.dataset.framedControl!, own = name.startsWith("switch:"), refusal = entry.area.gate(event, control);
    // The switch's own toggle stands only when the press acts; anything else leaves it as it was.
    if (!own || refusal || entry.busy || !live(entry)) event.preventDefault();
    if (refusal?.reason === "silent" || entry.busy || !live(entry)) return;
    if (refusal) {
      entry.note = refusal.reason === "moved" ? t("common.package-install.just-moved-press-again") : t("common.package-install.show-whole-area-first");
      if (refusal.reason === "partial") { if (refusal.reveal) send("reveal", entry.id); else control.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      draw(entry); return;
    }
    if (own || name.startsWith("tile:")) toggle(entry, name.slice(name.indexOf(":") + 1), control);
    else if (Object.hasOwn(steps, name)) steps[name]!(entry);
  };

  const start = (message: Extract<PackageInstallUp, { type: "package-install-open" }>) => {
    const bundle = Object.keys(message).length === 3 ? bundleOf(message.target) : null;
    const fail = () => send("done", message.id, { error: PACKAGE_INSTALL_UNAVAILABLE });
    if (!bundle || current?.id === message.id || !scope.visible) { fail(); return; }
    // One sheet a page: asked again, the sheet already there closes, and its request ends as closed.
    if (current) { if (!current.answered) send("done", current.id, { error: "AbortError" }); close(); }
    const held: { entry: Entry | null } = { entry: null };
    // The height follows the width and what the package asks, never what a page says (`packageInstallHeight`).
    const heights = { get narrow() { return held.entry ? packageInstallHeight(held.entry, 320) : PACKAGE_INSTALL_HEIGHTS.loading; },
      get wide() { return held.entry ? packageInstallHeight(held.entry, Math.max(480, held.entry.width)) : PACKAGE_INSTALL_HEIGHTS.loading; } };
    const area = areas.open({ heights, onHeight: height => send("size", message.id, { height }) });
    if (!area) { fail(); return; }
    area.surface.className = "mw-platform-area install-sheet";
    area.surface.dataset.installSheet = "";
    area.surface.setAttribute("aria-label", t("common.package-install.install-confirmation-owner", { owner: owner() }));
    const entry: Entry = held.entry = current = { id: message.id, bundle, area, stage: "loading", sheet: null, on: new Set(), step: 0, note: "", busy: true, answered: false, code: "unknown", width: 0 };
    area.surface.addEventListener("click", event => press(entry, event));
    send("shown", entry.id);
    void read(entry);
  };
  return (message: PackageInstallUp) => {
    if (!message || !Number.isSafeInteger(message.id) || message.id < 1) return;
    if (message.type === "package-install-open") { start(message); return; }
    const entry = current; if (!entry || entry.id !== message.id) return;
    if (message.type === "package-install-close") close();
    else if (message.type === "package-install-layout") { if (message.box && Number.isFinite(message.box.width)) entry.width = message.box.width; entry.area.layout(message.box); }
  };
}

type ChildPackageInstall = (place: Element, target: UiPackageInstallTarget, options?: { signal?: AbortSignal }) => Promise<UiPackageInstallOutcome>;
const childInstalls = new WeakMap<MessagePort, ChildPackageInstall>();
/** The page's half: an empty element, where it is, kept at the height the shell gives it; the answer when the person is done. */
export function childPackageInstall(port: MessagePort, scope: FrameScope): ChildPackageInstall {
  const made = childInstalls.get(port);
  if (made) return made;
  let sequence = 0;
  type Waiting = { element: HTMLElement; settle?: { resolve(outcome: UiPackageInstallOutcome): void; reject(error: Error): void }; stop?: () => void };
  const entries = new Map<number, Waiting>(), up = (message: PackageInstallUp) => port.postMessage(message);
  const close = (id: number, error: Error = closed()) => {
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); places.untrack(id); entry.stop?.(); entry.settle?.reject(error);
    entry.element.style.removeProperty("height"); up({ type: "package-install-close", id });
  };
  const places = childPlaces(scope, (id, box) => up({ type: "package-install-layout", id, box }), id => close(id));
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  port.addEventListener("message", (event: MessageEvent<PackageInstallDown>) => {
    const message = event.data, entry = entries.get(message.id), kind = typeof message.type === "string" && message.type.startsWith("package-install-") ? message.type.slice(16) : "";
    if (!entry || !kind) return;
    const element = entry.element, said = message as { height?: number; error?: string; outcome?: UiPackageInstallOutcome };
    if (kind === "size") element.style.height = Math.max(0, Number(said.height) || 0) + "px";
    else if (kind === "reveal") element.scrollIntoView({ block: "nearest" });
    // Shown: the place is reported again, since a report made before the shell had the sheet had nothing to go to.
    else if (kind === "shown") { places.resend(message.id); element.setAttribute("role", "note"); element.setAttribute("aria-label", uiText.text("common.package-install.install-confirmation-is-on-the-page")); }
    else if (kind !== "done") return;
    else if (said.error) close(message.id, said.error === "AbortError" ? closed() : new Error(PACKAGE_INSTALL_UNAVAILABLE));
    else if (said.outcome) {
      const settle = entry.settle, outcome = said.outcome; entry.settle = undefined; entry.stop?.();
      settle?.resolve(outcome.status === "installed" ? { status: "installed", plugin_id: String(outcome.plugin_id), version: String(outcome.version) }
        : outcome.status === "failed" ? { status: "failed", code: String(outcome.code) } : { status: "cancelled" });
    }
  });
  const ask: ChildPackageInstall = (place, target, options = {}) => {
    if (!scope.alive || !(place instanceof HTMLElement)) return Promise.reject(new Error(PACKAGE_INSTALL_UNAVAILABLE));
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(closed());
    // One sheet a page: asking again closes the one before it.
    for (const id of [...entries.keys()]) close(id);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const entry: Waiting = { element: place, settle: { resolve, reject } };
      entries.set(id, entry);
      if (signal) { const abort = () => close(id); signal.addEventListener("abort", abort, { once: true }); entry.stop = () => signal.removeEventListener("abort", abort); }
      up({ type: "package-install-open", id, target: { bundle: target?.bundle } });
      places.track(id, place);
    });
  };
  childInstalls.set(port, ask);
  return ask;
}
