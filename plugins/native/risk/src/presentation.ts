import { bindActionHandler, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { RISK_READ } from "./actions.js";
import { RISK_KIND } from "./identity.js";
import { riskSeverity, type RiskRecord } from "./model.js";
import type { RiskStore } from "./store.js";

const values = definePresentationValuesAction("risk.presentation.values", /* @version action.risk.presentation.values */ 1, [RISK_KIND], "风险显示字段", [...RISK_READ]);
const overview = definePresentationOverviewAction("risk.presentation.overview", /* @version action.risk.presentation.overview */ 1, "风险首页概况", [...RISK_READ]);
export const riskPresentationActions = [values, overview];

/** How a risk shows in rows, cards and the home page (batch 15 presentation): its status on the state ring, its seriousness in words. */
export const riskPresentation = {
  objects: [{
    kind: RISK_KIND,
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "severity", role: "summary" }, { key: "statement", role: "excerpt" },
      { key: "updated_at", role: "updated_at" }],
    status: { field: "status", map: { open: { ring: "answer" }, mitigating: { ring: "running" }, accepted: { ring: "paused" }, closed: { ring: "done" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status", "severity", "updated_at"] },
      card: { fields: ["title", "status", "severity", "statement", "updated_at"] }, peek: { fields: ["title", "status", "severity", "statement", "updated_at"] } },
    text: { lines: ["title", "status", "severity", "statement", "updated_at"] },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version },
} as const satisfies PresentationDeclaration;

/** Which open risks to look at first: the most serious, then the most recently changed. */
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const firstToSee = (a: RiskRecord, b: RiskRecord) => SEVERITY_ORDER[riskSeverity(a)] - SEVERITY_ORDER[riskSeverity(b)]
  || b.updated_at.localeCompare(a.updated_at) || a.risk_id.localeCompare(b.risk_id);

export function createRiskPresentationHandlers(read: <T>(run: (store: RiskStore) => T) => T) {
  return [
    bindPresentationValuesHandler(values, (input) => read(store => ({ items: input.subjects.map((subject: ActionSubject): PresentationValueItem => {
      const risk = subject.kind === RISK_KIND ? store.find(subject.id) : null;
      if (!risk) return { subject, revision: "0", state: "deleted" };
      return { subject, revision: String(risk.revision), state: "ok", values: { title: risk.title, status: risk.status,
        severity: { key: `risk.presentation.severity-${riskSeverity(risk)}` }, statement: risk.statement, updated_at: risk.updated_at } };
    }) }))),
    bindActionHandler(overview, () => read(store => {
      const open = store.all().filter(risk => risk.status !== "closed").sort(firstToSee);
      return { summary: open.length ? { key: "risk.presentation.summary", args: [{ name: "count", kind: "number" as const, number: open.length }] } : { key: "risk.presentation.empty" },
        subjects: open.slice(0, PRESENTATION_LIMITS.overview_subjects).map(risk => ({ kind: RISK_KIND, id: risk.risk_id })), start: [] };
    })),
  ];
}
