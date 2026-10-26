import type { WebLocale } from "@molis-ai/molis-work-app-workbench";
import { DIFF_MESSAGES, DIFF_TEMPLATES } from "@molis-ai/molis-work-plugin-diff";
import { diffViewText } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { pageText } from "./page-text.js";

/**
 * Diff's `text` primitive the way the Host drew it: the page's translator while Diff's surface (and any other Plugin named in
 * `plugins`) is drawn, a sentence of Diff's with values in it matched to its message first.
 */
export const diffPageText = (locale: WebLocale, ...plugins: string[]) => diffViewText(DIFF_MESSAGES, locale, DIFF_TEMPLATES, pageText(locale, "diff", ...plugins));
