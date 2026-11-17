import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AutomationPreference, AutomationPreferenceInput, AutomationPreferences } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { createAtomicFileDocument, readVersionedFile, type VersionedFile } from "@molis-ai/molis-work-storage";

const version = /* @version format.automation.recommendations */ 1;
export const AUTOMATION_PREFERENCES_PATH = "config/automation-recommendations.json";
const choices = new Set(["ignored", "already-have", "hidden"]);
const empty: AutomationPreferences = { revision: "absent", choices: [] };
interface Subject { readonly actor: string; readonly project: string; readonly incarnation: string }
type Row = Subject & AutomationPreferences;
interface State { schema_version: typeof version; rows: readonly Row[] }
type Control = { beforeEffect(): void | Promise<void>; assertCurrent(): void };
const unavailable = () => new ActionError("actions.service_unavailable", "项目建议偏好暂时读不到，原记录已保留");
const equal = (a: Subject, b: Subject) => a.actor === b.actor && a.project === b.project && a.incarnation === b.incarnation;

function parse(value: unknown): State {
  if (!isRecord(value) || value.schema_version !== version || !Array.isArray(value.rows) || value.rows.length > 10_000) throw unavailable();
  const rows: Row[] = [];
  for (const row of value.rows) {
    if (!isRecord(row) || !Array.isArray(row.choices) || typeof row.actor !== "string" || typeof row.project !== "string"
      || typeof row.incarnation !== "string" || typeof row.revision !== "string" || !/^[0-9a-f-]{36}$/.test(row.revision) || row.choices.length > 200) throw unavailable();
    const preferences: AutomationPreference[] = [];
    for (const choice of row.choices) {
      if (!isRecord(choice) || typeof choice.id !== "string" || !/^[a-f0-9]{64}$/.test(choice.id)
        || typeof choice.title !== "string" || choice.title.length > 200 || typeof choice.choice !== "string" || !choices.has(choice.choice)
        || preferences.some(item => item.id === choice.id)) throw unavailable();
      preferences.push({ id: choice.id, title: choice.title, choice: choice.choice as AutomationPreference["choice"] });
    }
    const current = { actor: row.actor, project: row.project, incarnation: row.incarnation, revision: row.revision, choices: preferences };
    if (rows.some(previous => equal(previous, current))) throw unavailable();
    rows.push(current);
  }
  return { schema_version: version, rows };
}

export const AUTOMATION_PREFERENCES_FILE: VersionedFile<State> = { version, field: "schema_version", upgrades: [], parse };

function read(home: string): State {
  const result = readVersionedFile(AUTOMATION_PREFERENCES_FILE, join(home, AUTOMATION_PREFERENCES_PATH), home);
  if (result.status === "absent") return { schema_version: version, rows: [] };
  if (result.status !== "current") throw unavailable();
  return result.value;
}

export function readAutomationPreferences(home: string, subject: Subject): AutomationPreferences {
  const saved = read(home).rows.find(row => equal(row, subject));
  return saved ? { revision: saved.revision, choices: saved.choices } : empty;
}

function documentOf(home: string) {
  const directory = join(home, "config"), homePath = realpathSync(home);
  return createAtomicFileDocument(join(home, AUTOMATION_PREFERENCES_PATH), () => {
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(directory) !== join(homePath, "config"))) throw unavailable();
  });
}

function mutate(home: string, change: (state: State) => State, assertCurrent: () => void): void {
  const document = documentOf(home);
  // A deletion in another process may update a different project while the person saves a preference here.
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = document.read();
    let current: State;
    try { current = raw === null ? { schema_version: version, rows: [] } : parse(JSON.parse(raw)); }
    catch { throw unavailable(); }
    const next = change(current);
    if (next === current) return;
    if (document.compareAndSetChecked(raw, JSON.stringify(next) + "\n", () => { requireSynchronous(assertCurrent()); })) return;
  }
  throw new ActionError("actions.conflict", "建议偏好正在更新，请重新查看");
}

export async function changeAutomationPreference(home: string, subject: Subject, input: AutomationPreferenceInput, title: string, control: Control): Promise<AutomationPreferences> {
  await control.beforeEffect();
  let next = empty;
  mutate(home, state => {
    const current = state.rows.find(candidate => equal(candidate, subject)) ?? empty;
    if (current.revision !== input.expected_revision) throw new ActionError("actions.conflict", "建议偏好已变化，请重新查看", { details: { revision: current.revision } });
    const choices = current.choices.filter(choice => choice.id !== input.suggestion_id);
    if (input.choice !== "show") choices.push({ id: input.suggestion_id, title: title.slice(0, 200), choice: input.choice });
    next = { revision: randomUUID(), choices };
    return parse({ schema_version: version, rows: [...state.rows.filter(candidate => !equal(candidate, subject)), { ...subject, ...next }] });
  }, control.assertCurrent);
  return next;
}

export function forgetAutomationPreferences(home: string, project: string): void {
  mutate(home, state => {
    const rows = state.rows.filter(row => row.project !== project);
    return rows.length === state.rows.length ? state : { ...state, rows };
  }, () => undefined);
}
