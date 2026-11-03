import type { Page } from "./page.js";

/** What a click rule does with the control that was pressed. */
export type ClickRun = (page: Page, target: HTMLButtonElement, event: MouseEvent) => unknown;

/** A control the page's markup marks by an attribute, and what pressing it does. */
export type ClickRule = readonly [selector: string, run: ClickRun];
