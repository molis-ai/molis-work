import type { WorkBriefHost } from "./types.js";

declare const WORK_BRIEF_CSS: string;

export function mountWorkBrief(host: WorkBriefHost): void {
  const root = host.root || document.querySelector<HTMLElement>('[data-work-brief="workbench"]');
  const scope = root && host.mountPluginClient(root);
  if (!root || !scope) return;
  const style = document.createElement("style");
  style.textContent = WORK_BRIEF_CSS;
  root.appendChild(style);
  scope.own(() => style.remove());
}
