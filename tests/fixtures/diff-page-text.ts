import type { WebLocale } from "@molis-ai/molis-work-app-workbench";
import { pageText } from "./page-text.js";

export const diffPageText = (locale: WebLocale, ...plugins: string[]) => pageText(locale, "diff", ...plugins);
