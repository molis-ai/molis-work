import { randomUUID } from "node:crypto";
import type { WorkspaceFileQuery, WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AutomationGap, AutomationPreferenceInput, AutomationReport } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { scanProjectAutomation, type ScanDirectory, type ScanServiceHints } from "./scan.js";
import { matchProjectAutomation, type AutomationCandidate } from "./match.js";
import { changeAutomationPreference, readAutomationPreferences } from "./preferences.js";
import { reportDocument } from "./report-document.js";

export { AUTOMATION_PREFERENCES_FILE, AUTOMATION_PREFERENCES_PATH, forgetAutomationPreferences, hideAutomationSuggestions, readAutomationPreferences } from "./preferences.js";
export { AUTOMATION_OFFERS_FILE, AUTOMATION_OFFERS_PATH, changeOfferRecord, forgetAutomationOffers, offersQuiet, readOfferRecord, setOffersQuiet, type Adoption, type AdoptedSkill, type OfferRecord, type OfferedItem } from "./offers.js";
export type { AutomationCandidate } from "./match.js";
export type { ScanServiceHints } from "./scan.js";

type Project = { readonly actor: string; readonly project: string; readonly incarnation: string };
type Control = { beforeEffect(): void | Promise<void>; assertCurrent(): void };
export interface AutomationScanPorts {
  readonly directories: readonly ScanDirectory[];
  readonly locale?: string;
  read(query: WorkspaceFileQuery): Promise<WorkspaceFileResult>;
  /** What can be suggested, and the services' declared project hints the scan looks for. */
  candidates(): Promise<{ rows: readonly AutomationCandidate[]; gaps: readonly AutomationGap[]; hints?: readonly ScanServiceHints[]; assertCurrent(): void }>;
  assertCurrent(): void;
}
type SavedReport = {
  readonly subject: Project;
  readonly deadline: number;
  readonly input: { readonly title: string; readonly markdown: string; readonly request_id: string };
  readonly offered: ReadonlyMap<string, string>;
  assertSource(): void;
};

const MAX_REPORTS = 64;
const REPORT_TTL = 15 * 60_000;
const expired = () => new ActionError("actions.conflict", "这份建议已过期，请在原项目重新查看");
const subjectKey = ({ actor, project, incarnation }: Project) => JSON.stringify([actor, project, incarnation]);

export class AutomationRecommender {
  readonly #reports = new Map<string, SavedReport>();
  constructor(private readonly home: string, private readonly now = Date.now) {}

  async scan(subject: Project, ports: AutomationScanPorts, control: Control): Promise<AutomationReport> {
    const assertCurrent = () => { requireSynchronous(control.assertCurrent()); requireSynchronous(ports.assertCurrent()); };
    // The candidates first: the services among them say which files, dependencies and Git hosts point at them.
    const directory = await ports.candidates();
    const files = await scanProjectAutomation(ports.directories, ports.read, control.assertCurrent, directory.hints ?? []);
    const gaps = [...files.gaps, ...directory.gaps];
    let preferences: AutomationReport["preferences"];
    try { preferences = readAutomationPreferences(this.home, subject); }
    catch { preferences = null; gaps.push({ code: "preferences-unavailable" }); }
    const complete = matchProjectAutomation(files.evidence, directory.rows, gaps, files.existing);
    const filtered = new Set(preferences?.choices.map(item => item.id));
    const groups = complete.map(group => ({ ...group, suggestions: group.suggestions.filter(item => !filtered.has(item.id)) }));
    const save_token = randomUUID(), now = this.now();
    const offered = new Map([...complete.flatMap(group => group.suggestions), ...preferences?.choices ?? []].map(item => [item.id, item.title]));
    assertCurrent(); directory.assertCurrent();
    for (const [id, saved] of this.#reports) if (saved.deadline <= now) this.#reports.delete(id);
    if (this.#reports.size >= MAX_REPORTS) this.#reports.delete(this.#reports.keys().next().value!);
    this.#reports.set(save_token, { subject: { ...subject }, deadline: now + REPORT_TTL, offered,
      input: { ...reportDocument(groups, gaps, ports.locale), request_id: "automation-report:" + save_token },
      assertSource: ports.assertCurrent });
    return { groups, evidence: files.evidence, gaps, preferences, save_token };
  }

  async change(subject: Project, input: AutomationPreferenceInput, control: Control): Promise<NonNullable<AutomationReport["preferences"]>> {
    const held = this.#held(subject, input.save_token), title = held.offered.get(input.suggestion_id);
    if (!title) throw new ActionError("actions.input_invalid", "这条建议不属于本次报告");
    return changeAutomationPreference(this.home, subject, input, title, {
      beforeEffect: control.beforeEffect, assertCurrent: () => { this.#held(subject, input.save_token); requireSynchronous(control.assertCurrent()); },
    });
  }

  async save(subject: Project, token: string, control: Control, create: (input: SavedReport["input"], control: Control) => Promise<{ document_id: string }>) {
    const held = this.#held(subject, token);
    const assertCurrent = () => {
      this.#held(subject, token);
      requireSynchronous(control.assertCurrent());
      requireSynchronous(held.assertSource());
    };
    assertCurrent();
    return create(held.input, { beforeEffect: control.beforeEffect, assertCurrent });
  }

  #held(subject: Project, token: string): SavedReport {
    const held = this.#reports.get(token);
    if (!held || held.deadline <= this.now() || subjectKey(held.subject) !== subjectKey(subject)) throw expired();
    return held;
  }
}
