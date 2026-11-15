import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderToast } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { BriefPage, BriefPageState, WorkBriefHost } from "./types.js";

const uiText = globalThis.t;

/** The style sheet, minified: the package's build script defines it (`--define:WORK_BRIEF_CSS`, from src/styles.ts). */
declare const WORK_BRIEF_CSS: string;

/** Work Brief's own actions the page calls, by the versions the Manifest declares. */
const VERSIONS: Readonly<Record<string, number>> = {
  "work-brief.briefs.get": /* @version action.work-brief.briefs.get */ 1,
  "work-brief.briefs.refresh": /* @version action.work-brief.briefs.refresh */ 1,
  "work-brief.briefs.edit": /* @version action.work-brief.briefs.edit */ 1,
  "work-brief.proposals.resolve": /* @version action.work-brief.proposals.resolve */ 1,
  "work-brief.versions.fix": /* @version action.work-brief.versions.fix */ 1,
  "work-brief.next.run": /* @version action.work-brief.next.run */ 1,
  "work-brief.next.set": /* @version action.work-brief.next.set */ 1,
  "work-brief.personal.get": /* @version action.work-brief.personal.get */ 1,
  "work-brief.personal.refresh": /* @version action.work-brief.personal.refresh */ 1,
};

export const failureOf = (error: unknown) => error as Partial<UiRequestFailure> & { details?: Record<string, unknown> };
export const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";

function initialState(): BriefPageState {
  return { mode: "project", loading: true, error: "", head: null, old: null, thenNow: "then", pop: "", editing: "", picks: {}, delta: null, busy: "", personal: null, personalError: "" };
}

/** The page the parts share, on the root the server drew; null when this view is not on the page. */
export function briefPage(host: WorkBriefHost, render: (page: BriefPage) => void): BriefPage | null {
  const root = host.root || document.querySelector<HTMLElement>('[data-work-brief="workbench"]');
  const body = root?.querySelector<HTMLElement>("[data-work-brief-body]");
  if (!root || !body) return null;
  const scope = host.mountPluginClient(root);
  if (!scope) return null;
  const style = document.createElement("style");
  style.textContent = WORK_BRIEF_CSS;
  root.appendChild(style);
  const toasts = document.createElement("div");
  toasts.className = "wb-toasts";
  toasts.setAttribute("aria-live", "polite");
  root.appendChild(toasts);
  scope.own(() => { style.remove(); toasts.remove(); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const page: BriefPage = {
    host, scope, root, body, state: initialState(),
    render: () => render(page),
    async call<O>(capability: string, input: unknown): Promise<O> {
      const version = VERSIONS[capability];
      if (version === undefined) throw new Error(`unknown action ${capability}`);
      try { return await host.invokeAction<O>({ capability_id: capability, version }, input); }
      catch (error) {
        const failure = failureOf(error);
        const answer = failure.body as { details?: Record<string, unknown> } | undefined;
        if (answer?.details) Object.assign(failure, { details: answer.details });
        // A refusal for who-may-read reasons is said as the platform says it; a missing answer is said plainly.
        const refusal = host.readRefusal(failure.status ?? 0, failure.code);
        if (refusal) failure.message = refusal;
        else if (failure.status === 0) failure.message = uiText.text("work-brief.error.no-answer");
        throw error;
      }
    },
    toast(message: string, failed = false) {
      toasts.innerHTML = renderToast({ message, tone: failed ? "danger" : "success" });
      clearTimeout(timer);
      timer = setTimeout(() => { toasts.innerHTML = ""; }, failed ? 6000 : 2600);
    },
    run(work: () => Promise<unknown>) {
      void Promise.resolve().then(work).catch((error: unknown) => {
        if (isAbort(error)) return;
        page.state.busy = "";
        page.toast(error instanceof Error && error.message ? error.message : uiText.text("work-brief.error.failed"), true);
        page.render();
      });
    },
  };
  scope.own(() => clearTimeout(timer));
  return page;
}
