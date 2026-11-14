import { bindActionHandler, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext,
  type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { RISK_READ } from "./actions.js";
import { riskErrors } from "./error.js";
import { RISK_KIND, RISK_PROJECT_PLUGIN_ID } from "./identity.js";
import type { RiskRecord } from "./model.js";
import type { RiskStore } from "./store.js";

const subjectReader = defineSubjectContextAction("risk.subject.read", /* @version action.risk.subject.read */ 1, RISK_KIND, "风险", [...RISK_READ]);

/** Risk's part in the system search and in reading an object by its kind: open and closed risks alike, opened in Risk. */
export const riskSearchActions = {
  entries: defineSearchEntriesAction("risk.search.entries", /* @version action.risk.search.entries */ 1, [{ kind: RISK_KIND, title: "风险", surface: RISK_PROJECT_PLUGIN_ID }], "风险", [...RISK_READ]),
  subject: { ...subjectReader, action: { ...subjectReader.action, execution: { cost: "none" as const } } },
};

/** The words a reader gets: stored values, never translated sentences (the reader's caller words them). */
function riskContent(risk: RiskRecord): string {
  return [risk.statement, `status: ${risk.status}`, `impact: ${risk.impact}`, `likelihood: ${risk.likelihood}`,
    risk.treatment && `treatment: ${risk.treatment}`, risk.owner_name && `owner: ${risk.owner_name}`].filter(Boolean).join("\n");
}

export function createRiskSearchHandlers(read: <T>(run: (store: RiskStore) => T) => T): ActionHandlerBinding[] {
  const open = (risk: RiskRecord) => ({ surface: RISK_PROJECT_PLUGIN_ID, id: risk.risk_id });
  return [
    bindSearchEntriesHandler(riskSearchActions.entries, () => read(store => store.all().map(risk => ({
      subject: { kind: RISK_KIND, id: risk.risk_id }, revision: String(risk.revision), title: risk.title, summary: searchText(risk.statement, 400),
      updated_at: risk.updated_at, content: "context" as const, open: open(risk) })))),
    bindActionHandler(riskSearchActions.subject, (input) => read(store => {
      const risk = store.find(input.subject_id);
      if (!risk) throw riskErrors.not_found("这条风险已不存在", { risk_id: input.subject_id });
      return subjectContext({ subject: { kind: RISK_KIND, id: risk.risk_id }, revision: String(risk.revision), title: risk.title, content: riskContent(risk), open: open(risk) }, input);
    })),
  ];
}
