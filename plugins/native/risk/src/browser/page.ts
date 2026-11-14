import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderToast } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { RiskHost, RiskPage, RiskPageState } from "./types.js";

const uiText = globalThis.t;

/** The style sheet, minified: the package's build script defines it (`--define:RISK_CSS`, from src/styles.ts). */
declare const RISK_CSS: string;

/** The risk actions the page calls, by the versions the Manifest declares. */
const VERSIONS: Readonly<Record<string, number>> = {
  "risk.list": /* @version action.risk.list */ 1,
  "risk.get": /* @version action.risk.get */ 1,
  "risk.create": /* @version action.risk.create */ 1,
  "risk.update": /* @version action.risk.update */ 1,
  "risk.status.set": /* @version action.risk.status.set */ 1,
  "risk.links.add": /* @version action.risk.links.add */ 1,
  "risk.links.remove": /* @version action.risk.links.remove */ 1,
  "risk.notes.add": /* @version action.risk.notes.add */ 1,
  "risk.review.get": /* @version action.risk.review.get */ 1,
  "risk.review.schedule": /* @version action.risk.review.schedule */ 1,
  "risk.review.enabled": /* @version action.risk.review.enabled */ 1,
  "risk.review.cancel": /* @version action.risk.review.cancel */ 1,
  "search.references": /* @version action.search.references */ 1,
};

export const failureOf = (error: unknown) => error as Partial<UiRequestFailure> & { details?: Record<string, unknown> };
export const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";
/** Refused for who may do it: an action's forbidden kind (packages/contracts/src/platform/action-errors.ts) answers 403 with an
 * `actions.` code. A 403 of the Host's own (its control token, the page's origin) or a session that is not signed in or not this
 * Home's is not about this person and this risk, so it does not turn the record read-only. */
const SESSION_REFUSALS = new Set(["actions.unauthenticated", "actions.home_mismatch"]);
export const isPermission = (error: unknown) => {
  const { status, code } = failureOf(error);
  return status === 403 && typeof code === "string" && code.startsWith("actions.") && !SESSION_REFUSALS.has(code);
};

function initialState(): RiskPageState {
  return { view: "overview", filter: { status: "open", impact: "", owner_name: "", linked: "" }, rows: [], anyClosed: false, owners: [], next: null, overviewError: "",
    loading: true, record: null, recordError: "", review: null, reviewError: "", readOnly: false, recordId: "", editing: false, conflict: null, pop: "", busy: false };
}

/** The page the parts share, on the root the server drew; null when this view is not on the page. */
export function riskPage(host: RiskHost, render: (page: RiskPage) => void): RiskPage | null {
  const root = host.root || document.querySelector<HTMLElement>('[data-risk="workbench"]');
  const body = root?.querySelector<HTMLElement>("[data-risk-body]");
  if (!root || !body) return null;
  const scope = host.mountPluginClient(root);
  if (!scope) return null;
  const style = document.createElement("style");
  style.textContent = RISK_CSS;
  root.appendChild(style);
  const toasts = document.createElement("div");
  toasts.className = "rk-toasts";
  toasts.setAttribute("aria-live", "polite");
  root.appendChild(toasts);
  scope.own(() => { style.remove(); toasts.remove(); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const page: RiskPage = {
    host, scope, root, body, side: root.hasAttribute("data-risk-side"), state: initialState(),
    render: () => render(page),
    async call<O>(capability: string, input: unknown): Promise<O> {
      const version = VERSIONS[capability];
      if (version === undefined) throw new Error(`unknown action ${capability}`);
      try { return await host.invokeAction<O>({ capability_id: capability, version }, input); }
      catch (error) {
        const failure = failureOf(error);
        const body = failure.body as { details?: Record<string, unknown> } | undefined;
        if (body?.details) Object.assign(failure, { details: body.details });
        // A refusal for who-may-read reasons is said as the platform says it; a missing answer is said plainly.
        const refusal = host.readRefusal(failure.status ?? 0, failure.code);
        if (refusal) failure.message = refusal;
        else if (failure.status === 0) failure.message = uiText.text("risk.error.no-answer");
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
        page.state.busy = false;
        page.toast(error instanceof Error && error.message ? error.message : uiText.text("risk.error.failed"), true);
        page.render();
      });
    },
  };
  scope.own(() => clearTimeout(timer));
  return page;
}
