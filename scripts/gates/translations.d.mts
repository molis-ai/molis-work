/** Types for the parts of `translations.mjs` the tests read; the gate itself runs as plain script before anything is built. */
export interface TranslationSnapshot { readonly files: readonly string[]; read(file: string): string | null }
/** A `t` / `say` call whose key the scanner resolved. */
export interface TranslationCall { readonly file: string; readonly line: number; readonly key: string; readonly callee: string; readonly embedded: boolean }
/** A call whose key is chosen at run time; `prefix` is what the scanner could still read of it. */
export interface DynamicTranslationCall { readonly file: string; readonly line: number; readonly callee: string; readonly prefix?: string; readonly embedded: boolean }
export interface TranslationFileScan {
  readonly file: string;
  readonly calls: TranslationCall[];
  readonly dynamic: DynamicTranslationCall[];
  readonly retired: { file: string; line: number; callee: string }[];
  readonly mentions: Set<string>;
  readonly scripts: number;
  readonly scriptWrappers: Map<string, Set<number>>;
  readonly imports: string[];
}
export interface TranslationScan {
  readonly files: TranslationFileScan[];
  readonly calls: TranslationCall[];
  readonly dynamicCalls: DynamicTranslationCall[];
  readonly problems: string[];
  readonly keys: number;
  readonly packs: number;
  readonly dead: string[];
}
export interface TranslationSummary { readonly keys: number; readonly packs: number; readonly calls: number; readonly dynamicCalls: number; readonly errors: string[]; readonly deadKeys: number }
export declare function scanFile(file: string, text: string, shared?: unknown, readModule?: unknown): TranslationFileScan;
export declare function scanTree(snapshot: TranslationSnapshot, isSource?: (file: string) => boolean): TranslationScan;
export declare const summarise: (scan: TranslationScan) => TranslationSummary;
export declare const missingErrors: (result: TranslationSummary) => string[];
export declare const isProductSource: (file: string) => boolean;
export declare function workingTreeSnapshot(root: string): TranslationSnapshot;
