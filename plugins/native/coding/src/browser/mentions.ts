import type { ComposerMention } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { matches } from "./matching.js";
import type { Translate } from "./types.js";

/** One definition in a file, named by `@path#name`. */
export interface SymbolLine { readonly name: string; readonly kind: string; readonly line: number }

export interface MentionPorts {
  readonly translate: Translate;
  /** The directory the session's rounds run in; "" while none is chosen. */
  readonly workspace: () => string;
  readonly files: (workspaceId: string, signal: AbortSignal) => Promise<{ files: string[] }>;
  readonly symbols: (workspaceId: string, file: string, signal: AbortSignal) => Promise<{ symbols?: SymbolLine[]; unreadable?: boolean }>;
}

const LIMIT = 12;
const baseName = (path: string) => {
  const own = path.replace(/\/$/, "");
  return own.slice(own.lastIndexOf("/") + 1).toLowerCase();
};

/**
 * What `@` names in Coding's composer (unified-input-voice K4, the composer's `mentions`): a workspace file by `@path`, ranked by
 * its base name first, or one definition in it by `@path#name`. The list of files is read once per workspace and each file's
 * definitions once; a read that failed is tried again on the next look. The composer puts `@path` (or `@path#name`) in the text.
 */
export function codingMentions({ translate: L, workspace, files, symbols }: MentionPorts) {
  const fileLists = new Map<string, Promise<string[]>>(), symbolLists = new Map<string, Promise<{ symbols: SymbolLine[]; unreadable: boolean }>>();
  const once = <Value>(cache: Map<string, Promise<Value>>, key: string, read: () => Promise<Value>) => {
    let found = cache.get(key);
    if (!found) {
      cache.set(key, found = read());
      found.catch(() => cache.delete(key));
    }
    return found;
  };
  return async (query: string, signal: AbortSignal): Promise<readonly ComposerMention[]> => {
    const at = workspace();
    if (!at) throw new Error(L("coding.palette.choose-workspace"));
    // Chinese punctuation mode may type `＃` for `#`.
    const hash = query.search(/[#＃]/);
    if (hash > 0) {
      const file = query.slice(0, hash), word = query.slice(hash + 1).toLowerCase();
      const read = await once(symbolLists, at + " " + file, () => symbols(at, file, signal).then(value => ({ symbols: value.symbols || [], unreadable: Boolean(value.unreadable) })));
      if (read.unreadable) throw new Error(L("coding.palette.unreadable"));
      return read.symbols.filter(symbol => matches(word, symbol.name))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(word)) - Number(!b.name.toLowerCase().startsWith(word)) || a.line - b.line).slice(0, LIMIT)
        .map(symbol => ({ title: symbol.name, hint: L("coding.palette.symbol-line", { kind: symbol.kind, line: symbol.line }), insert: "@" + file + "#" + symbol.name }));
    }
    const word = query.toLowerCase(), list = await once(fileLists, at, () => files(at, signal).then(value => value.files));
    return list.filter(path => matches(word, path))
      .sort((a, b) => Number(!baseName(a).startsWith(word)) - Number(!baseName(b).startsWith(word)) || a.length - b.length).slice(0, LIMIT)
      .map(path => {
        const slash = path.lastIndexOf("/");
        return { title: path.slice(slash + 1), ...(slash > 0 ? { hint: path.slice(0, slash) } : {}), insert: "@" + path };
      });
  };
}
