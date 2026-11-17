import { mountSessionsSurface } from "./client.js";
import { createSessionsScopeSheet, type ScopeTabId } from "./scope-sheet.js";

interface SessionsHost {
  readonly root: HTMLElement;
  readonly showToast?: (message: string, isError?: boolean) => void;
}

declare global {
  var molisOpenSessionsScope: ((tab?: ScopeTabId, options?: { overlay?: boolean }) => Promise<void>) | undefined;
}

const scopeSheet = createSessionsScopeSheet();

globalThis.molisWorkbenchPluginFactories ||= {};
globalThis.molisWorkbenchPluginFactories.sessions = (host: SessionsHost) => {
  mountSessionsSurface(host.root, scopeSheet, host.showToast);
};
globalThis.molisOpenSessionsScope = (tab = "tools", options = {}) => scopeSheet.open(tab, options);
