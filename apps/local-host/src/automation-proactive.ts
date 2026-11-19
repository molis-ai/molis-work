import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AssistantCardChoice, AssistantPreparedCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { AUTOMATION_ADOPTION_PROVIDER_ID, AUTOMATION_OFFER_LIMIT, automationAdoptionActions, type AutomationOfferResult, type AutomationReport,
  type AutomationSuggestion } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { changeOfferRecord, readOfferRecord, type OfferedItem } from "@molis-ai/molis-work-service-automation-recommender";
import type { HostCardInput } from "./assistant/assistant-offers.js";

/**
 * The Assistant bringing up a project's automation by itself (specs/automation-recommender §7, user 2026-11-18): whenever a look at the
 * project finds suggestions it has not said before, it places one card in the project's conversation kept for them — the most worth
 * having, at most three and one connection, all picked — and lights the Dock. What it said is remembered per project, so the same item
 * is never what makes it speak again; items not taken are listed again with the next new find. Nothing new, no folder: it stays quiet.
 */
export interface AutomationOfferHooks {
  /** Place the card in the project's work kept for it (the Assistant's `placeForPerson`). */
  place(input: HostCardInput): Promise<{ work_id: string }>;
  /** Light the Dock for that work, once per card. */
  notify(work: { work_id: string; title: string }, count: number, dedupe: string): void;
}

/** A look this soon after the last one is not repeated: opening the project again does not rescan it. */
export const OFFER_LOOK_INTERVAL_MS = 10 * 60_000;
export const AUTOMATION_OFFER_SURFACE = "automation-recommendations";
const ADOPTABLE = new Set(["skills", "connections"]);

type Subject = { actor: string; project: string; incarnation: string };

/** Where a connection's hint was found, as the person reads it: the file and the declared hint (`package.json · @notionhq/client`). */
function connectionWhy(row: AutomationSuggestion): string {
  const found = row.evidence.flatMap(entry => (entry.hints ?? []).map(hint => `${entry.path} · ${hint.hint}`));
  return uiText.text("workbench.automation-adoption.connection-why", { where: found.slice(0, 2).join(uiText.text("common.list.separator")) || row.evidence[0]?.path || "" });
}

function choiceOf(row: AutomationSuggestion): AssistantCardChoice {
  const description = row.next.kind === "skill"
    ? uiText.text("workbench.automation-adoption.skill-detail", { source: row.requirements.slice(0, 2).join(" · "), why: row.reason.slice(0, 160) })
    : connectionWhy(row);
  return { value: row.id, label: row.title.slice(0, 120), description: description.slice(0, 300) };
}

function offered(row: AutomationSuggestion): OfferedItem | null {
  if (row.next.kind === "skill") return { id: row.id, title: row.title.slice(0, 200), kind: "skill", install_id: row.next.ref.install_id, skill_id: row.next.ref.skill_id,
    installation_generation: row.next.ref.installation_generation };
  if (row.next.kind === "connection") return { id: row.id, title: row.title.slice(0, 200), kind: "connection", service_id: row.next.service_id };
  return null;
}

/**
 * The card for what the look found, or why it says nothing. The new ones come first, then those said before and not taken; within each,
 * the better evidenced first. At most one connection: it is finished in the card's own connection card.
 */
export async function offerProjectAutomation(home: string, subject: Subject, report: AutomationReport, hooks: AutomationOfferHooks, now = new Date()): Promise<AutomationOfferResult> {
  if (report.gaps.some(gap => gap.code === "no-workspace")) {
    changeOfferRecord(home, subject, record => ({ result: undefined, next: { ...record, looked_at: now.toISOString() } }));
    return { offered: false, reason: "no-workspace" };
  }
  const record = readOfferRecord(home, subject), told = new Set(record.told);
  const rows = report.groups.filter(group => ADOPTABLE.has(group.category)).flatMap(group => group.suggestions).filter(row => offered(row) !== null);
  const fresh = rows.filter(row => !told.has(row.id));
  if (!fresh.length) {
    changeOfferRecord(home, subject, current => ({ result: undefined, next: { ...current, looked_at: now.toISOString() } }));
    return { offered: false, reason: "nothing-new" };
  }
  const rank = (row: AutomationSuggestion) => (told.has(row.id) ? 2 : 0) + (row.confidence === "high" ? 0 : 1);
  const chosen: AutomationSuggestion[] = [];
  for (const row of [...rows].sort((a, b) => rank(a) - rank(b) || b.evidence.length - a.evidence.length)) {
    if (chosen.length >= AUTOMATION_OFFER_LIMIT) break;
    if (row.next.kind === "connection" && chosen.some(item => item.next.kind === "connection")) continue;
    chosen.push(row);
  }
  const choices = chosen.map(choiceOf);
  const card: AssistantPreparedCard = {
    title: uiText.text("workbench.automation-adoption.turn-on"),
    summary: uiText.text("workbench.automation-adoption.card-summary", { count: chosen.length }),
    reference: { capability_id: automationAdoptionActions.adopt.capability_id, version: automationAdoptionActions.adopt.version, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID },
    input: { adopt: chosen.map(row => row.id), never: [], skill_state: "auto" },
    editable: ["adopt", "never", "skill_state"],
    choices: { adopt: choices, never: choices },
  };
  const title = uiText.text("workbench.automation-adoption.work-title");
  const placed = await hooks.place({ key: `automation:${subject.project}`, work_title: title, scope: { kind: "project", project_id: subject.project },
    source: { surface: AUTOMATION_OFFER_SURFACE, title: uiText.text("workbench.automation-adoption.source") }, card });
  changeOfferRecord(home, subject, current => ({ result: undefined, next: { ...current, told: [...new Set([...current.told, ...chosen.map(row => row.id)])],
    offered: chosen.map(row => offered(row)!), looked_at: now.toISOString() } }));
  hooks.notify({ work_id: placed.work_id, title }, chosen.length, `automation:${subject.project}:${chosen.map(row => row.id).sort().join(",")}`);
  return { offered: true, work_id: placed.work_id, count: chosen.length };
}

/** Whether the last look was recent enough that this one is skipped. */
export function lookedRecently(home: string, subject: Subject, now = Date.now()): boolean {
  const at = readOfferRecord(home, subject).looked_at;
  return at !== null && now - Date.parse(at) < OFFER_LOOK_INTERVAL_MS;
}
