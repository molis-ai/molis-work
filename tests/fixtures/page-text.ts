import { createWorkbenchLocale, type WebLocale } from "@molis-ai/molis-work-app-workbench";

/** The translator a page gets in one language: what a renderer's `text` primitive is when the Host draws it. */
export const pageText = (locale: WebLocale) => createWorkbenchLocale(() => locale).L;

/** The same translator for a page under test: a script that defines `globalThis.L` the way the Host's pages get it. */
export const pageTextScript = (locale: WebLocale) => createWorkbenchLocale(() => locale).clientI18nScript();
