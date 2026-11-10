import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";

// Changing a page's language in place (specs/font-and-skin-system/a-section-contract.md §5.4): business code does nothing. The server draws the region in
// the old and the new language; where the two differ is what to change, and the person's own content is the same in both. Only `Text.data` and
// `setAttribute` are written: no node is removed or replaced, no `innerHTML`, so listeners, focus, a field's text and selection, scrolling and what is
// open stay as they are. Batch 16 proves it on the real first screen; A-section proves it on the component board.

/** What the browser's `t` and `say` produced, as plain text with the reference it came from; at most `limit`, the oldest leaves first. */
export interface ProducedLog {
  record(output: string, ref: OwnedTextRef): void;
  find(output: string, node: Text | Attr): OwnedTextRef | undefined;
  remember(node: Text | Attr, output: string, ref?: OwnedTextRef): void;
}

export function createProducedLog(limit = 2000): ProducedLog {
  const entries = new Map<string, OwnedTextRef>();
  const retitled = new WeakMap<Text | Attr, { output: string; ref: OwnedTextRef }>();
  return {
    record(output, ref) {
      entries.delete(output);
      entries.set(output, ref);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    find(output, node) {
      const known = retitled.get(node);
      return known?.output === output ? known.ref : entries.get(output);
    },
    remember(node, output, ref) {
      if (ref) retitled.set(node, { output, ref });
      else retitled.delete(node);
    },
  };
}

export interface LocaleMerge {
  /** Words and attributes the two renders told apart and that were changed. */
  readonly changed: number;
  /** Words the browser drew, drawn again in the new language from what produced them. */
  readonly redrawn: number;
  /** What could not be merged, said for whoever looks: a part whose two renders differ in shape stays as it was. */
  readonly problems: readonly string[];
}

/** These change with what a person does, not with the language. */
const TEXT_ATTRIBUTES = new Set(["title", "placeholder", "aria-label", "aria-description", "aria-valuetext", "alt", "label", "data-placeholder", "data-work-surface-label", "data-work-surface-description", "data-home-starts", "data-connector-search", "data-steps", "data-caption", "data-words"]);
/**
 * A button-type input's label is its value. Every other `value` is data: a field's is the person's, and an `<option>`'s or a `<button>`'s goes with
 * the form when it is sent (a `<button>`'s label is the text inside it), so it is never merged.
 */
const BUTTON_INPUTS = new Set(["button", "submit", "reset"]);

const editable = (element: Element) => element.hasAttribute("contenteditable") && element.getAttribute("contenteditable") !== "false";
/** Never written: what is inside a text area, an editable node and `translate="no"`. An editable node's own placeholder and label still change. */
const keepsChildren = (element: Element) => element.localName === "textarea" || editable(element) || element.getAttribute("translate") === "no";

function wordAttributes(element: Element): string[] {
  if (element.getAttribute("translate") === "no") return [];
  const input = element.localName === "input" && BUTTON_INPUTS.has((element.getAttribute("type") ?? "").toLowerCase());
  return element.getAttributeNames().filter(name => TEXT_ATTRIBUTES.has(name) || input && name === "value").sort();
}

/** One word of a region: a text, an attribute or a data block, under the nearest ancestor with an `id` or a `data-plugin-contribution`. */
interface Word { readonly node: Text | Attr; readonly group: string; readonly key: string; readonly value: string; read(): string | null; set(value: string): void }

function textWord(node: Text, group: string, prefix: string): Word {
  return { node, group, key: `${prefix}:${node.data}`, value: node.data, read: () => node.data, set: value => { node.data = value; } };
}

const groupOf = (element: Element, group: string) => element.id ? `#${element.id}` : element.hasAttribute("data-plugin-contribution") ? `@${element.getAttribute("data-plugin-contribution")}` : group;
const childrenOf = (node: Node): readonly Node[] => [...(node instanceof HTMLTemplateElement ? node.content : node).childNodes];

/** The words of a region in document order. Blank text is not a word: two words with only space between them are next to each other. */
function wordsOf(node: Node, group: string, into: Word[], skip?: ReadonlySet<ParentNode>): Word[] {
  for (const child of childrenOf(node)) {
    if (child instanceof Text) {
      if (child.data.trim() !== "") into.push(textWord(child, group, "t"));
    } else if (child instanceof Element && !skip?.has(child)) {
      const inner = groupOf(child, group);
      for (const name of wordAttributes(child)) {
        const node = child.getAttributeNode(name)!, value = node.value;
        into.push({ node, group: inner, key: `a:${name}=${value}`, value, read: () => node.ownerElement === child ? node.value : null, set: next => { node.value = next; } });
      }
      if (child.localName === "script" || child.localName === "style") {
        const text = child.firstChild;
        if (child.hasAttribute("data-ui-language-model") && child.getAttribute("type") === "application/json" && text instanceof Text) into.push(textWord(text, inner, "s"));
      } else if (!keepsChildren(child)) wordsOf(child, inner, into, skip);
    }
  }
  return into;
}

/** Old words with what each becomes. Two renders of one page have one shape; a part that does not is left alone and said. */
function expectedWords(old: ParentNode, next: ParentNode, problems: string[]): Array<Word & { readonly to: string | null }> {
  const before = wordsOf(old, "", []), after = wordsOf(next, "", []);
  const shape = (words: readonly Word[]) => words.map(({ key }) => key.slice(0, key.indexOf(key.startsWith("a:") ? "=" : ":"))).join("\n");
  const groups = (words: readonly Word[]) => {
    const result = new Map<string, Word[]>();
    for (const word of words) { const same = result.get(word.group) ?? []; same.push(word); result.set(word.group, same); }
    return result;
  };
  const later = groups(after);
  return [...groups(before)].flatMap(([group, previous]) => {
    const nextWords = later.get(group) ?? [];
    if (shape(previous) !== shape(nextWords)) {
      problems.push(group);
      return [];
    }
    return previous.map((word, index) => ({ ...word, to: nextWords[index]!.value === word.value ? null : nextWords[index]!.value }));
  });
}

interface Run<T> { readonly key: string; readonly words: T[] }
function runsOf<T extends Word>(words: readonly T[]): Run<T>[] {
  const runs: Run<T>[] = [];
  for (const word of words) {
    const last = runs.at(-1);
    if (last?.key === word.key) last.words.push(word);
    else runs.push({ key: word.key, words: [word] });
  }
  return runs;
}

/** The longest common subsequence of two lists of runs by key, as index pairs. On a tie it keeps the later live run. */
function align(old: readonly Run<Word>[], live: readonly Run<Word>[]): Array<[number, number]> {
  const length = Array.from({ length: old.length + 1 }, () => new Array<number>(live.length + 1).fill(0));
  for (let i = 1; i <= old.length; i += 1) for (let j = 1; j <= live.length; j += 1) {
    length[i]![j] = old[i - 1]!.key === live[j - 1]!.key ? length[i - 1]![j - 1]! + 1 : Math.max(length[i - 1]![j]!, length[i]![j - 1]!);
  }
  const pairs: Array<[number, number]> = [];
  for (let i = old.length, j = live.length; i > 0 && j > 0;) {
    if (old[i - 1]!.key === live[j - 1]!.key) { pairs.push([i - 1, j - 1]); i -= 1; j -= 1; }
    else if (length[i]![j - 1]! >= length[i - 1]![j]!) j -= 1;
    else i -= 1;
  }
  return pairs.reverse();
}

/**
 * Same words next to each other cannot be told apart: a word the browser added among them could be anywhere. Each old word can only be at the
 * positions the difference in count leaves it, so a position changes when a word that changes could be there. A real interface word is never
 * left in the old language; a word the person or the browser put right beside it may show translated until it is drawn again (§5.4).
 */
interface WordChange { readonly word: Word; readonly to: string; readonly ref?: OwnedTextRef }
function mergeRun(old: Run<Word & { readonly to: string | null }>, live: Run<Word>, changes: WordChange[]): number {
  const extra = live.words.length - old.words.length;
  let changed = 0;
  live.words.forEach((word, position) => {
    const from = extra >= 0 ? position - extra : position, to = extra >= 0 ? position : position - extra;
    const source = old.words.find((candidate, index) => candidate.to !== null && index >= from && index <= to);
    if (source !== undefined && word.value !== source.to) { changes.push({ word, to: source.to! }); changed += 1; }
  });
  return changed;
}

interface LocaleRegion {
  /** The region on the page. */
  readonly root: ParentNode;
  /** The same region as drawn in the language on show, and in the new one. */
  readonly old: ParentNode;
  readonly next: ParentNode;
}

export interface LocaleMergeInput extends LocaleRegion {
  readonly regions?: readonly LocaleRegion[];
  readonly produced: ProducedLog;
  /** A produced sentence in the new language. */
  retext(ref: OwnedTextRef): string;
}

function collectRegion(input: LocaleMergeInput, region: LocaleRegion, changes: WordChange[], skip?: ReadonlySet<ParentNode>) {
  const problems: string[] = [];
  const expected = expectedWords(region.old, region.next, problems), live = wordsOf(region.root, "", [], skip);
  const unmatched = new Set<Word>(live);
  let changed = 0, redrawn = 0;
  for (const group of new Set([...expected, ...live].map((word) => word.group))) {
    const oldRuns = runsOf(expected.filter((word) => word.group === group)), liveRuns = runsOf(live.filter((word) => word.group === group));
    for (const [i, j] of align(oldRuns, liveRuns)) {
      changed += mergeRun(oldRuns[i]!, liveRuns[j]!, changes);
      for (const word of liveRuns[j]!.words) unmatched.delete(word);
    }
  }
  // What the browser drew is in neither render: a whole word that is a sentence `t` or `say` produced is drawn again from its reference.
  for (const word of unmatched) {
    const ref = input.produced.find(word.value, word.node);
    if (ref === undefined) continue;
    const text = input.retext(ref);
    if (text !== word.value) { changes.push({ word, to: text, ref }); redrawn += 1; }
  }
  return { changed, redrawn, problems };
}

/** Prepare all rendered regions before mutating the page or its context. */
export function planLocaleText(input: LocaleMergeInput) {
  const changes: WordChange[] = [], regions = input.regions ?? [];
  const plans = [collectRegion(input, input, changes, new Set(regions.map(region => region.root))),
    ...regions.map(region => collectRegion(input, region, changes))];
  const { changed, redrawn, problems } = plans.reduce((all, region) => ({
    changed: all.changed + region.changed, redrawn: all.redrawn + region.redrawn, problems: [...all.problems, ...region.problems],
  }));
  return { result: { changed, redrawn, problems }, apply(use: () => void, restore: () => void) {
    const wrote: WordChange[] = [];
    try {
      for (const change of changes) {
        const { word, to } = change;
        // A concurrent ordinary update owns any word it has since redrawn. It will be invalidated after the switch.
        if (word.read() !== word.value) continue;
        wrote.push(change);
        word.set(to);
      }
      use();
    } catch (error) {
      for (const { word } of wrote.reverse()) word.set(word.value);
      restore();
      throw error;
    }
    // The prepared reader did not produce these live words. Remember their individual references after commit,
    // since distinct references can have the same spelling in the selected language.
    for (const { word, to, ref } of wrote) if (word.read() === to) input.produced.remember(word.node, to, ref);
  } };
}

/** Changes the region's words to the new language. `retext` reads the prepared language, independently of the displayed context. */
export function mergeLocaleText(input: LocaleMergeInput): LocaleMerge {
  const merge = planLocaleText(input);
  merge.apply(() => {}, () => {});
  return merge.result;
}

export interface LocaleSwitchOptions<Prepared = undefined> {
  readonly root: ParentNode;
  /** The region as the server draws it in a language; `null` when it cannot be had. */
  render(locale: string, signal: AbortSignal): Promise<ParentNode | null>;
  /** Load resources without changing the current language. */
  prepare?(locale: string, signal: AbortSignal, document: ParentNode | null, previous: ParentNode | null): Promise<Prepared>;
  /** Extra rendered settings regions owned by this document. */
  regions?(prepared: Prepared | undefined): readonly LocaleRegion[];
  /** Save the prepared preference, or read back its actual result if the reply is lost. Never cancelled once sent. */
  persist?(locale: string, prepared: Prepared): Promise<void>;
  /** The browser commits its prepared context synchronously, or restores the previous one if any update failed. */
  use(locale: string, prepared?: Prepared): void;
  readonly produced: ProducedLog;
  retext(ref: OwnedTextRef, locale: string, prepared?: Prepared): string;
}

function waitForLocalePreparation<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

/**
 * The latest request owns preparation. Preference writes are serialized: a write already sent may have succeeded, but
 * its words cannot update the page after a newer choice. A later choice can even restore the language still on display.
 */
export function createLocaleSwitch<Prepared>(options: LocaleSwitchOptions<Prepared>, shown: string) {
  let current = shown, persisted = shown, running: Promise<LocaleMerge | null> | null = null;
  let wanted: { locale: string; save: boolean; force: boolean } | undefined;
  let preparing: AbortController | undefined;
  const run = async (): Promise<LocaleMerge | null> => {
    let merged: LocaleMerge | null = null;
    while (wanted) {
      const request = wanted, target = request.locale, prior = current;
      const abort = preparing = new AbortController(), signal = abort.signal;
      try {
        const [old, next] = await waitForLocalePreparation(signal, Promise.all([
          target === prior ? null : options.render(prior, signal),
          target === prior ? null : options.render(target, signal),
        ]));
        if (request !== wanted) continue;
        if (target !== prior && (old === null || next === null)) { wanted = undefined; return null; }
        const prepared = options.prepare ? await waitForLocalePreparation(signal, options.prepare(target, signal, next, old)) : undefined;
        if (preparing === abort) preparing = undefined;
        if (request !== wanted) continue;
        const plan = old && next && planLocaleText({ root: options.root, old, next, produced: options.produced, regions: options.regions?.(prepared),
          retext: ref => options.retext(ref, target, prepared) });
        if (request.save && options.persist && (request.force || target !== persisted)) {
          await options.persist(target, prepared as Prepared);
          persisted = target;
        } else if (!request.save) persisted = target;
        if (request !== wanted) continue;
        if (plan) {
          plan.apply(() => options.use(target, prepared), () => options.use(prior));
          merged = plan.result;
        }
        current = target; if (wanted === request) wanted = undefined;
      } catch (error) {
        if (request !== wanted) continue;
        wanted = undefined;
        throw error;
      } finally {
        if (preparing === abort) preparing = undefined;
        abort.abort();
      }
    }
    return merged;
  };
  return {
    current: () => current,
    switchTo(locale: string, save = true, force = false): Promise<LocaleMerge | null> {
      if (wanted?.locale !== locale || wanted.save !== save || force) {
        wanted = { locale, save, force }; preparing?.abort();
      }
      running ??= Promise.resolve().then(run).finally(() => { running = null; });
      return running;
    },
  };
}
