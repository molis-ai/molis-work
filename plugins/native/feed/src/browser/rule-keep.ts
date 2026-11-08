import type { JudgmentRuleRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FeedPage } from "./factory.js";

type Field = "name" | "instructions";
type Outcome = "retry" | "handled" | null;
interface Kept { value: string; swapped: boolean }
interface Keep { phase: string; kept: Partial<Record<Field, Kept>>; latest?: JudgmentRuleRecord; loaded?: boolean; busy?: boolean }
export interface KeepDraft { function?: JudgmentRuleRecord; functionKey?: string; functionContent?: string; previewContent?: string }
export interface KeepPorts {
  draft(section: HTMLElement): KeepDraft;
  /** Writes the draft and the form to this tab's storage. */
  save(section: HTMLElement): void;
  get(id: string): Promise<JudgmentRuleRecord>;
  /** A new draft from what is in the form now, under a new key. */
  rebuild(section: HTMLElement): Promise<void>;
}

const FIELDS: ReadonlyArray<readonly [Field, string]> = [["name", "data-feed-out-rule-name"], ["instructions", "data-feed-rule-instructions"]];
const OWES = ["conflict", "offline", "second", "deleted", "published"];
const CODES = ["functions.draft_stale", "functions.not_found", "functions.published_immutable"];
const codeOf = (error: unknown): string => error && typeof error === "object" && "code" in error ? String(error.code) : "";
/** What Feed writes into its draft, in the same shape the composer compares (`functionContent`). */
export const contentOf = (rule: { name: string; instructions: string }): string => JSON.stringify({ name: rule.name.trim(), instructions: rule.instructions.trim() });
const definitionOf = (fn: JudgmentRuleRecord): string => JSON.stringify([fn.name, fn.function_key, fn.instructions, fn.criteria, fn.scene_id, fn.scene_version, fn.scene_provider_id, fn.subject_kinds, fn.scene_map, fn.action_map]);

type Translate = FeedPage["host"]["translate"];
const labelOf = (id: Field, L: Translate) => id === "name" ? L("规则名称") : L("描述");
const withVersion = (rec: JudgmentRuleRecord) => (alert: HTMLElement) => {
  const walk = document.createTreeWalker(alert, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) node.nodeValue = node.nodeValue!.replace("{version}", "v" + (rec.version || 1));
};
/** The preview drawn for the old content no longer counts. */
const unpreview = (section: HTMLElement) => section.querySelectorAll<HTMLElement>("[data-feed-rule-preview], [data-feed-rule-status]").forEach(node => { node.hidden = true; });
/** "See all" only where the words run past three lines; a row on a hidden part is measured when it shows. */
const fitFolds = (section: HTMLElement) => section.querySelectorAll<HTMLElement>("[data-feed-kept]").forEach(node => {
  const more = node.querySelector<HTMLElement>("[data-feed-kept-more]"), text = node.querySelector<HTMLElement>(".mw-kept__text");
  if (!more || !text || !text.getClientRects().length) return;
  more.hidden = !text.classList.contains("is-open") && text.scrollHeight <= text.clientHeight + 1;
});
const fold = (section: HTMLElement, node: HTMLElement, control: HTMLElement, L: Translate) => {
  const open = node.querySelector(".mw-kept__text")!.classList.toggle("is-open");
  control.setAttribute("aria-expanded", String(open));
  control.querySelector("[data-slot=button-label]")!.textContent = open ? L("feed.rule.show-less") : L("看全部");
  fitFolds(section);
  // Folding a text that fits takes this way away, and the focus was on it: it moves to the row's own button.
  if (control.hidden) node.querySelector<HTMLElement>("[data-feed-kept-swap]")?.focus();
};
const fillKept = (node: HTMLElement, id: Field, row: Kept, latest: string, L: Translate) => {
  const text = row.swapped ? latest : row.value, swap = node.querySelector<HTMLElement>("[data-feed-kept-swap]")!, body = node.querySelector<HTMLElement>(".mw-kept__text")!;
  node.classList.toggle("is-swapped", row.swapped);
  node.querySelector(".mw-kept__who")!.textContent = row.swapped ? L("最新版") : L("你写的");
  swap.querySelector("[data-slot=button-label]")!.textContent = row.swapped ? L("换回") : L("放回");
  swap.setAttribute("aria-label", row.swapped ? L("换回最新版：{field}", { field: labelOf(id, L) }) : L("放回你写的：{field}", { field: labelOf(id, L) }));
  body.textContent = text || L("你清空了这一栏"); body.classList.toggle("is-blank", !text);
};
const lines = (L: Translate, kept: Field[], yours: Field[], theirs: Field[]) => {
  const join = (ids: Field[]) => ids.map(id => labelOf(id, L)).join(L("、"));
  return [kept.length ? L("{fields}两边都改了，你写的就在它下面。", { fields: join(kept) }) : "", theirs.length ? L("别处还改了{fields}。", { fields: join(theirs) }) : "",
    yours.length ? L("你改的{fields}留着。", { fields: join(yours) }) : "", L("再预览一次才能启用。")].filter(Boolean).join("\n");
};

/**
 * The rule composer when its draft changed elsewhere (docs/design/rule-stale-reload, plan A; specs/action-input-contracts §2.7). A
 * refused write reads the latest draft and lands in one state: changed back (the press goes on), nothing unsaved (the latest comes
 * into the form and the press waits for a new preview), or something unsaved (an alert with one way on; the form stays). Loading
 * the latest keeps what only you changed and puts yours under each field both sides changed, to put back.
 */
export function feedRuleKeep(page: FeedPage, ports: KeepPorts) {
  const { q, host } = page, L = host.translate, keeps = new WeakMap<HTMLElement, Keep>();
  const keepOf = (section: HTMLElement): Keep => { let keep = keeps.get(section); if (!keep) keeps.set(section, keep = { phase: "", kept: {} }); return keep; };
  const field = (section: HTMLElement, id: Field) => q<HTMLInputElement | HTMLTextAreaElement>("[" + FIELDS.find(([name]) => name === id)![1] + "]", section);
  const mine = (section: HTMLElement) => {
    const instructions = field(section, "instructions")?.value.trim() || "";
    return { name: field(section, "name")?.value.trim() || instructions.slice(0, 40), instructions };
  };
  const slot = (section: HTMLElement) => q("[data-feed-rule-band]", section);
  const alertOf = (section: HTMLElement) => slot(section)?.querySelector<HTMLElement>(".mw-alert") ?? null;
  const cloneOf = (section: HTMLElement, name: string) => q<HTMLTemplateElement>('template[data-feed-keep="' + name + '"]', section)?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
  const owes = (section: HTMLElement) => OWES.includes(keepOf(section).phase);
  const band = (section: HTMLElement, phase: string, fill?: (alert: HTMLElement) => void) => {
    const keep = keepOf(section), alert = phase ? cloneOf(section, phase) : undefined;
    keep.phase = phase; keep.busy = false;
    slot(section)?.replaceChildren(...(alert ? [alert] : []));
    if (alert) fill?.(alert);
  };
  const land = (section: HTMLElement, id: Field) => { const box = field(section, id)?.closest("label"); if (box) (globalThis as { molisCraft?: { land?: (node: Element, variant?: string) => void } }).molisCraft?.land?.(box, "field"); };
  const toBand = (section: HTMLElement) => (alertOf(section)?.querySelector<HTMLElement>(".mw-btn--primary:not([disabled])") ?? alertOf(section))?.focus({ preventScroll: true });
  const forgetDraft = (section: HTMLElement, key: boolean) => {
    const draft = ports.draft(section);
    delete draft.function; delete draft.functionContent; delete draft.previewContent; if (key) delete draft.functionKey;
    ports.save(section);
  };

  /** Gone: with nothing unsaved the next preview simply builds a new draft; with something unsaved the alert says so first. */
  const gone = (section: HTMLElement, unsaved: boolean): Outcome => { forgetDraft(section, false); if (!unsaved) return "retry"; band(section, "deleted"); return "handled"; };
  const published = (section: HTMLElement, latest: JudgmentRuleRecord): Outcome => {
    const draft = ports.draft(section);
    // Published elsewhere exactly as written here: that is the rule to use.
    if (contentOf(latest) === contentOf(mine(section))) { draft.function = latest; draft.functionContent = contentOf(latest); ports.save(section); return "retry"; }
    // Published under this draft's key: a new draft needs a key of its own.
    forgetDraft(section, true); keepOf(section).latest = latest; band(section, "published", withVersion(latest));
    return "handled";
  };
  /** A refused write, read again (specs/action-input-contracts §2.7): "retry" when the press may simply go on, "handled" otherwise. */
  const recover = async (section: HTMLElement, error: unknown): Promise<Outcome> => {
    const code = codeOf(error), draft = ports.draft(section), fn = draft.function;
    if (!fn || !CODES.includes(code)) return null;
    const unsaved = contentOf(mine(section)) !== contentOf(fn);
    if (code === "functions.not_found") return gone(section, unsaved);
    let latest: JudgmentRuleRecord;
    try { latest = await ports.get(fn.id); }
    catch (failure) { if (codeOf(failure) === "functions.not_found") return gone(section, unsaved); band(section, "offline"); return "handled"; }
    if (latest.status === "published") return published(section, latest);
    if (definitionOf(latest) === definitionOf(fn)) { draft.function = latest; ports.save(section); return "retry"; }
    if (!unsaved) {
      for (const [id] of FIELDS) { const input = field(section, id); if (input && input.value.trim() !== latest[id].trim()) { input.value = latest[id]; land(section, id); } }
      draft.function = latest; draft.functionContent = contentOf(latest); delete draft.previewContent; ports.save(section); unpreview(section);
      band(section, "clean");
      return "handled";
    }
    keepOf(section).latest = latest; band(section, keepOf(section).loaded ? "second" : "conflict");
    return "handled";
  };
  /** Before the pressed button is disabled or replaced, the focus moves to its alert, so it never falls to the page. */
  const busy = (section: HTMLElement, button: HTMLElement) => {
    alertOf(section)?.focus({ preventScroll: true });
    keepOf(section).busy = true;
    const spin = cloneOf(section, "busy");
    if (!spin) return;
    spin.querySelector("[data-slot=button-label]")!.textContent = button.textContent!.trim();
    button.replaceWith(spin);
  };
  const reload = async (section: HTMLElement, button: HTMLElement) => {
    const draft = ports.draft(section), fn = draft.function, keep = keepOf(section), check = page.guard();
    if (!fn || keep.busy) return;
    const before = mine(section);
    busy(section, button);
    let latest: JudgmentRuleRecord;
    try { latest = await ports.get(fn.id); check(); }
    catch (error) {
      check();
      if (codeOf(error) === "functions.not_found") gone(section, true); else band(section, "offline");
      alertOf(section)?.focus({ preventScroll: true });
      return;
    }
    if (latest.status === "published") { if (published(section, latest) === "retry") band(section, ""); else toBand(section); return; }
    const kept: Partial<Record<Field, Kept>> = {}, yours: Field[] = [], theirs: Field[] = [];
    for (const [id] of FIELDS) {
      const now = latest[id].trim(), was = fn[id].trim(), yourValue = before[id];
      if (yourValue === now) continue;
      if (yourValue !== was && now !== was) kept[id] = { value: yourValue, swapped: false };
      else if (yourValue !== was) { yours.push(id); continue; }
      else theirs.push(id);
      const input = field(section, id); if (input) input.value = latest[id];
      land(section, id);
    }
    draft.function = latest; draft.functionContent = contentOf(latest); delete draft.previewContent; ports.save(section); unpreview(section);
    Object.assign(keep, { kept, latest, loaded: true });
    band(section, "loaded", alert => { const body = alert.querySelector("p"); if (body) body.textContent = lines(L, Object.keys(keep.kept) as Field[], yours, theirs); });
    section.querySelectorAll("[data-feed-kept]").forEach(node => node.remove());
    (Object.entries(kept) as Array<[Field, Kept]>).forEach(([id, row], index) => {
      const node = cloneOf(section, "kept"), box = field(section, id)?.closest("label");
      if (!node || !box) return;
      node.dataset.feedKept = id; node.style.setProperty("--i", String(index));
      fillKept(node, id, row, latest[id], L); box.after(node);
    });
    fitFolds(section);
    const swap = section.querySelector<HTMLElement>("[data-feed-kept-swap]");
    if (swap) swap.focus(); else alertOf(section)?.focus({ preventScroll: true });
  };
  /** Starts a new draft from what is written here; the one published elsewhere keeps its key. */
  const fresh = async (section: HTMLElement, button: HTMLElement) => {
    const phase = keepOf(section).phase, latest = keepOf(section).latest, check = page.guard();
    forgetDraft(section, true); busy(section, button);
    try { await ports.rebuild(section); check(); keepOf(section).kept = {}; section.querySelectorAll("[data-feed-kept]").forEach(node => node.remove()); band(section, "saved-new"); toBand(section); }
    catch (error) { check(); band(section, phase, latest ? withVersion(latest) : undefined); throw error; }
  };

  return {
    recover,
    /** A press the alert has to answer first: it hops once and the focus goes to its way on (not while it is loading). */
    blocked(section: HTMLElement): boolean {
      if (!owes(section)) return false;
      const alert = alertOf(section);
      if (alert) { alert.classList.remove("is-nudged"); void alert.offsetWidth; alert.classList.add("is-nudged"); alert.querySelector<HTMLElement>(".mw-btn--primary:not([disabled])")?.focus({ preventScroll: true }); }
      return true;
    },
    /** A press that went on: a settled note (latest loaded, started fresh, replaced) has said what it had to. */
    settle(section: HTMLElement): void { if (!owes(section)) band(section, ""); },
    focus: toBand,
    async click(target: Element): Promise<boolean> {
      const section = target.closest<HTMLElement>("[data-feed-out-rules]"); if (!section) return false;
      const act = target.closest<HTMLElement>("[data-feed-keep-act]");
      if (act) {
        if (act.hasAttribute("disabled")) return true;
        const name = act.dataset.feedKeepAct;
        if (name === "reload") await reload(section, act);
        else if (name === "fresh") await fresh(section, act);
        else if (name === "preview") { band(section, ""); q<HTMLElement>("[data-feed-rule-preview-run]", section)?.click(); }
        else if (name === "dismiss") { band(section, ""); (section.querySelector<HTMLElement>("[data-feed-kept-swap]") ?? field(section, "instructions"))?.focus({ preventScroll: true }); }
        return true;
      }
      const control = target.closest<HTMLElement>("[data-feed-kept-swap],[data-feed-kept-more]"), node = control?.closest<HTMLElement>("[data-feed-kept]");
      const id = node?.dataset.feedKept as Field | undefined, keep = keepOf(section), row = id && keep.kept[id];
      if (!control || !node || !id || !row || !keep.latest) return false;
      if (control.hasAttribute("data-feed-kept-more")) { fold(section, node, control, L); return true; }
      row.swapped = !row.swapped;
      const input = field(section, id); if (input) input.value = row.swapped ? row.value : keep.latest[id];
      fillKept(node, id, row, keep.latest[id], L); fitFolds(section); land(section, id); unpreview(section); ports.save(section);
      return true;
    },
  };
}
