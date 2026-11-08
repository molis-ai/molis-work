import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";

// Changing a page's language in place (specs/font-and-skin-system/a-section-contract.md §5.4): business code does nothing. The server draws the region in
// the old and the new language; where the two differ is what to change, and the person's own content is the same in both. Only `Text.data` and
// `setAttribute` are written: no node is removed or replaced, no `innerHTML`, so listeners, focus, a field's text and selection, scrolling and what is
// open stay as they are. Batch 16 proves it on the real first screen; A-section proves it on the component board.

/** What the browser's `t` and `say` produced, as plain text with the reference it came from; at most `limit`, the oldest leaves first. */
export interface ProducedLog {
  record(output: string, ref: OwnedTextRef): void;
  find(output: string): OwnedTextRef | undefined;
}

export function createProducedLog(limit = 2000): ProducedLog {
  const entries = new Map<string, OwnedTextRef>();
  return {
    record(output, ref) {
      entries.delete(output);
      entries.set(output, ref);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    find: (output) => entries.get(output),
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
const STATE_ATTRIBUTES = new Set(["checked", "selected", "open", "style", "class"]);
/** A button's label is its value; a field's value is the person's. */
const BUTTON_INPUTS = new Set(["button", "submit", "reset"]);

const editable = (element: Element) => element.hasAttribute("contenteditable") && element.getAttribute("contenteditable") !== "false";
/** Never written: what is inside a text area, an editable node and `translate="no"`. An editable node's own placeholder and label still change. */
const keepsChildren = (element: Element) => element.localName === "textarea" || editable(element) || element.getAttribute("translate") === "no";

function wordAttributes(element: Element): string[] {
  if (element.getAttribute("translate") === "no") return [];
  const input = element.localName === "input" && BUTTON_INPUTS.has((element.getAttribute("type") ?? "").toLowerCase());
  return element.getAttributeNames().filter((name) => !STATE_ATTRIBUTES.has(name) && !name.startsWith("on") && (name !== "value" || input)).sort();
}

/** One word of a region: a text, an attribute or a data block, under the nearest ancestor with an `id` or a `data-plugin-contribution`. */
interface Word { readonly group: string; readonly key: string; readonly value: string; set(value: string): void }

const groupOf = (element: Element, group: string) => element.id ? `#${element.id}` : element.hasAttribute("data-plugin-contribution") ? `@${element.getAttribute("data-plugin-contribution")}` : group;
const childrenOf = (node: Node): readonly Node[] => [...(node instanceof HTMLTemplateElement ? node.content : node).childNodes];

/** The words of a region in document order. Blank text is not a word: two words with only space between them are next to each other. */
function wordsOf(node: Node, group: string, into: Word[]): Word[] {
  for (const child of childrenOf(node)) {
    if (child instanceof Text) {
      if (child.data.trim() !== "") into.push({ group, key: `t:${child.data}`, value: child.data, set: (value) => { child.data = value; } });
    } else if (child instanceof Element) {
      const inner = groupOf(child, group);
      for (const name of wordAttributes(child)) {
        const value = child.getAttribute(name)!;
        into.push({ group: inner, key: `a:${name}=${value}`, value, set: (next) => child.setAttribute(name, next) });
      }
      if (child.localName === "script" || child.localName === "style") {
        const text = child.firstChild;
        if (child.getAttribute("type") === "application/json" && text instanceof Text) into.push({ group: inner, key: `s:${text.data}`, value: text.data, set: (value) => { text.data = value; } });
      } else if (!keepsChildren(child)) wordsOf(child, inner, into);
    }
  }
  return into;
}

/** Old words with what each becomes. Two renders of one page have one shape; a part that does not is left alone and said. */
function expectedWords(old: ParentNode, next: ParentNode, problems: string[]): Array<Word & { readonly to: string | null }> {
  const before = wordsOf(old, "", []), after = wordsOf(next, "", []);
  const shape = (words: readonly Word[]) => words.map(({ group, key }) => `${group} ${key.slice(0, key.indexOf(key.startsWith("a:") ? "=" : ":"))}`).join("\n");
  if (shape(before) !== shape(after)) {
    problems.push("两种语言画出来的结构不同：这一块不改");
    return [];
  }
  return before.map((word, index) => ({ ...word, to: after[index]!.value === word.value ? null : after[index]!.value }));
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
function mergeRun(old: Run<Word & { readonly to: string | null }>, live: Run<Word>): number {
  const extra = live.words.length - old.words.length;
  let changed = 0;
  live.words.forEach((word, position) => {
    const from = extra >= 0 ? position - extra : position, to = extra >= 0 ? position : position - extra;
    const source = old.words.find((candidate, index) => candidate.to !== null && index >= from && index <= to);
    if (source !== undefined && word.value !== source.to) { word.set(source.to!); changed += 1; }
  });
  return changed;
}

export interface LocaleMergeInput {
  /** The region on the page. */
  readonly root: ParentNode;
  /** The same region as drawn in the language on show, and in the new one. */
  readonly old: ParentNode;
  readonly next: ParentNode;
  readonly produced: ProducedLog;
  /** A produced sentence in the new language. */
  retext(ref: OwnedTextRef): string;
}

/** Changes the region's words to the new language. The text context must already answer in the new language. */
export function mergeLocaleText(input: LocaleMergeInput): LocaleMerge {
  const problems: string[] = [];
  const expected = expectedWords(input.old, input.next, problems), live = wordsOf(input.root, "", []);
  const unmatched = new Set<Word>(live);
  let changed = 0, redrawn = 0;
  for (const group of new Set([...expected, ...live].map((word) => word.group))) {
    const oldRuns = runsOf(expected.filter((word) => word.group === group)), liveRuns = runsOf(live.filter((word) => word.group === group));
    for (const [i, j] of align(oldRuns, liveRuns)) {
      changed += mergeRun(oldRuns[i]!, liveRuns[j]!);
      for (const word of liveRuns[j]!.words) unmatched.delete(word);
    }
  }
  // What the browser drew is in neither render: a whole word that is a sentence `t` or `say` produced is drawn again from its reference.
  for (const word of unmatched) {
    const ref = input.produced.find(word.value);
    if (ref === undefined) continue;
    const text = input.retext(ref);
    if (text !== word.value) { word.set(text); redrawn += 1; }
  }
  return { changed, redrawn, problems };
}

export interface LocaleSwitchOptions {
  readonly root: ParentNode;
  /** The region as the server draws it in a language; `null` when it cannot be had. */
  render(locale: string): Promise<ParentNode | null>;
  /** Puts the new language into the browser's text context, once everything is in hand. */
  use(locale: string): void;
  readonly produced: ProducedLog;
  retext(ref: OwnedTextRef): string;
}

/**
 * One switch at a time; asked again meanwhile, it does only the last. Answers the merge, or `null` when a render could not be had: then nothing
 * on the page changed, and the language on show is still the old one.
 */
export function createLocaleSwitch(options: LocaleSwitchOptions, shown: string) {
  let current = shown, wanted = shown, running: Promise<LocaleMerge | null> | null = null;
  const run = async (): Promise<LocaleMerge | null> => {
    let merged: LocaleMerge | null = null;
    while (wanted !== current) {
      const target = wanted;
      const [old, next] = await Promise.all([options.render(current), options.render(target)]);
      if (old === null || next === null) { wanted = current; return null; }
      options.use(target);
      merged = mergeLocaleText({ root: options.root, old, next, produced: options.produced, retext: options.retext });
      current = target;
    }
    return merged;
  };
  return {
    current: () => current,
    switchTo(locale: string): Promise<LocaleMerge | null> {
      wanted = locale;
      running ??= run().finally(() => { running = null; });
      return running;
    },
  };
}
