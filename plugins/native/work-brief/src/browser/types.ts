import type { UiClientScope, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

/** The common request lifetime plus the mounted page's event and timer ownership. */
export interface Scope extends UiClientScope {
  listen(target: EventTarget, name: string, callback: (event: Event) => void, capture?: boolean): () => void;
}

/** What the workbench hands the brief page's client. */
export type WorkBriefHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "root" | "mount" | "invokeAction" | "openItem" | "openPlugin" | "surfaceFor" | "view" | "confirm" | "readRefusal" | "projectTitle"> & {
  mountPluginClient(root: HTMLElement): Scope | null;
};
