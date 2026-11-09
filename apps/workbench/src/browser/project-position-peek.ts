import { escapeHtml as e, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "../surface-home-display.js";
import { homeButton, isPlacementControl, presentationWord, renderHomePeek, type HomeControl } from "./project-home-render.js";
import type { PositionHost, ReadPosition } from "./project-position.js";

type Choice = { key: string; label: string; consequence: string[] };
type Prepared = { prepared: string; choices: Choice[] };
type Result = { kind: "peek"; row: SurfaceHomeRowDisplay; offers?: Prepared } | { kind: "placement"; title: string; description: string; offers?: Prepared };
type Selection = { key: string; original: HTMLElement; source: Record<string, unknown> };

function choicesHtml(offers: Prepared | undefined, choice: Choice | undefined, say: PositionHost["translate"]) {
  if (!offers) return "";
  if (choice) return '<div class="home-offers-controls"><strong>' + e(say(choice.label)) + "</strong>"
    + choice.consequence.map(word => "<small>" + e(presentationWord(word)) + "</small>").join("")
    + renderButton({ label: say("取消"), variant: "secondary", attrs: { "data-position-offer": "cancel" } })
    + renderButton({ label: say("确认"), variant: "primary", attrs: { "data-position-offer": "confirm" } }) + "</div>";
  return '<div class="home-offers-controls">' + offers.choices.map(item => renderButton({ label: say(item.label), variant: "secondary",
    attrs: { "data-position-offer": item.key } }) + item.consequence.map(word => "<small>" + e(presentationWord(word)) + "</small>").join("")).join("") + "</div>";
}

/** An open peek is only the current position's selected row, read again after each list generation. */
export function createPositionPeek(root: HTMLElement, read: ReadPosition, host: PositionHost, ports: {
  source(): Record<string, unknown>; expanded(): boolean; visible(): boolean;
  displayed(): SurfaceHomeDisplay | undefined;
  lookup(key: string): HomeControl | undefined;
  navigate(click: HomeControl, trigger: HTMLElement): Promise<void>;
}) {
  const doc = root.ownerDocument, say = host.translate;
  let dialog: HTMLDialogElement | undefined, content: HTMLElement | undefined, footer: HTMLElement | undefined;
  let selection: Selection | undefined, pending: AbortController | undefined, prepared: Prepared | undefined, confirming: Choice | undefined;
  const peekControls = new Map<string, HomeControl>(), unsettled = new Map<string, string>();
  let refocusOpen = false, executing = false;
  const button = () => dialog?.querySelector<HTMLElement>('[data-home-control="close"]');
  const cancel = (source: Selection["source"], prepared: string) => {
    void read({ ...source, offer: { intent: "cancel", prepared } }, new AbortController().signal).catch(() => { /* Closing the source also releases its preparation. */ });
  };
  const release = () => {
    if (prepared && selection) cancel(selection.source, prepared.prepared);
    prepared = confirming = undefined;
  };
  const scrub = () => {
    if (dialog?.open) {
      refocusOpen ||= peekControls.has(doc.activeElement?.getAttribute("data-presentation-action") ?? "");
      button()?.focus({ preventScroll: true });
    }
    pending?.abort(); pending = undefined; executing = false;
    release(); peekControls.clear(); content?.replaceChildren(); footer?.replaceChildren();
  };
  function close(restore = true) {
    const before = selection, opened = dialog?.open;
    scrub(); selection = undefined; refocusOpen = false;
    if (!opened) return;
    dialog!.close();
    if (!restore) return;
    if (before?.original.isConnected && before.original.checkVisibility()) before.original.focus({ preventScroll: true });
    else if (root.isConnected && ports.visible()) root.querySelector<HTMLElement>("button,summary,[tabindex='0']")?.focus({ preventScroll: true });
  }
  function setup() {
    if (dialog) return;
    dialog = doc.createElement("dialog");
    dialog.className = "mw-dialog home-peek";
    dialog.dataset.positionDialog = "";
    dialog.setAttribute("aria-label", presentationWord("peek"));
    dialog.innerHTML = '<div class="mw-dialog__shell">' + homeButton("close", say("关闭")) + '<div data-position-peek></div><div data-position-offers></div></div>';
    content = dialog.querySelector<HTMLElement>("[data-position-peek]")!;
    footer = dialog.querySelector<HTMLElement>("[data-position-offers]")!;
    // The notice popover owns this dialog too. Its outside-press handler must not dismiss the source on a dialog press.
    (root.parentElement ?? doc.body).append(dialog);
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("close", () => { if (!dialog?.open) close(); });
    dialog.addEventListener("click", event => {
      const hit = (event.target as Element)?.closest<HTMLElement>("button");
      if (!hit || !event.isTrusted) return;
      if (hit.dataset.homeControl === "close") { close(); return; }
      const target = peekControls.get(hit.dataset.presentationAction ?? "");
      if (target) { void ports.navigate(target, hit); return; }
      const id = hit.dataset.positionOffer;
      if (!id || pending || !prepared || !selection) return;
      if (id === "confirm" && confirming) { void execute(selection, prepared, confirming); return; }
      if (id === "cancel") { release(); drawChoices(); button()?.focus(); void refresh(); return; }
      confirming = prepared.choices.find(choice => choice.key === id);
      drawChoices(); footer?.querySelector<HTMLElement>('[data-position-offer="cancel"]')?.focus();
    });
  }
  function drawChoices() {
    if (!footer) return;
    footer.innerHTML = executing || selection && unsettled.has(selection.key) ? '<p role="status">' + e(say(executing ? "正在执行…" : "到原处核对执行结果")) + "</p>"
      : choicesHtml(prepared, confirming, say);
  }
  async function execute(open: Selection, offer: Prepared, choice: Choice) {
    const task = pending = new AbortController();
    executing = true;
    unsettled.set(open.key, offer.prepared);
    drawChoices();
    button()?.focus();
    try {
      const result = await read<{ title: string }>({ ...open.source, offer: { intent: "confirm", prepared: offer.prepared, choice: choice.key } }, task.signal);
      if (pending !== task || task.signal.aborted) return;
      unsettled.delete(open.key); prepared = confirming = undefined;
      close();
      const control = ports.lookup(open.key);
      host.receipt(control && isPlacementControl(control.target.kind) ? result.title : say("已完成") + " · " + say(result.title));
      host.changed();
    } catch (error) {
      if (pending !== task || task.signal.aborted) return;
      executing = false;
      prepared = confirming = undefined;
      const code = (error as { code?: string } | null)?.code;
      if (code && code !== "actions.outcome_unknown" && code !== "actions.cancelled") {
        unsettled.delete(open.key);
        host.receipt(say("这个对象已变化，请重新读取"));
        host.changed();
      }
      drawChoices();
    } finally { if (pending === task) pending = undefined; }
  }
  async function refresh() {
    if (!selection) return;
    const open = selection, click = ports.lookup(open.key), data = ports.displayed();
    if (!click || !data || !ports.visible()) { close(); return; }
    if (isPlacementControl(click.target.kind) && dialog?.open) { close(); return; }
    const task = pending = new AbortController();
    try {
      const result = await read<Result>({ ...open.source, click, ...(ports.expanded() ? { expanded: true } : {}) }, task.signal);
      if (pending !== task || task.signal.aborted || !ports.visible()) {
        if (result.offers) cancel(open.source, result.offers.prepared);
        return;
      }
      setup();
      if (unsettled.has(open.key) && result.offers) cancel(open.source, result.offers.prepared);
      else prepared = result.offers;
      dialog!.setAttribute("aria-label", result.kind === "placement" ? result.title : presentationWord("peek"));
      content!.innerHTML = result.kind === "peek" ? renderHomePeek(data, result.row, peekControls)
        : '<h2>' + e(result.title) + '</h2><p>' + e(result.description) + '</p>'
          + (!result.offers ? '<p role="status">' + e(say("暂无可用操作")) + '</p>' : '');
      drawChoices();
      if (!dialog!.open) dialog!.showModal();
      (refocusOpen ? content!.querySelector<HTMLElement>("[data-presentation-action]") : button())?.focus({ preventScroll: true });
      refocusOpen = false;
    } catch { if (pending === task && !task.signal.aborted) close(); }
    finally { if (pending === task) pending = undefined; }
  }
  return { scrub, refresh, close,
    open(key: string, original: HTMLElement) { close(); selection = { key, original, source: ports.source() }; void refresh(); },
    destroy() { close(); dialog?.remove(); unsettled.clear(); },
  };
}
