import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { AUTOMATION_OFFER_LIMIT } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { createAtomicFileDocument, readVersionedFile, type VersionedFile } from "@molis-ai/molis-work-storage";

/**
 * What the Assistant has told the person about a project's automation, and what they turned on from it (specs/automation-recommender
 * §7): the suggestions already said (so each is said once), the latest card's items (the only ones adopting accepts), when the project
 * was last looked at for the Assistant, and the adoptions that can still be undone. A row per person and project incarnation; nothing
 * from the project's files is kept here, only suggestion ids, titles and the refs adopting needs.
 */
const version = /* @version format.automation.offers */ 1;
export const AUTOMATION_OFFERS_PATH = "config/automation-offers.json";
const MAX_TOLD = 500, MAX_ADOPTIONS = 20, MAX_ROWS = 10_000;

interface Subject { readonly actor: string; readonly project: string; readonly incarnation: string }
export type OfferedItem =
  | { readonly id: string; readonly title: string; readonly kind: "skill"; readonly install_id: string; readonly skill_id: string; readonly installation_generation: string }
  | { readonly id: string; readonly title: string; readonly kind: "connection"; readonly service_id: string };
export interface AdoptedSkill { readonly install_id: string; readonly skill_id: string; readonly title: string; readonly revision: number }
export interface Adoption { readonly adoption_id: string; readonly at: string; readonly skills: readonly AdoptedSkill[]; readonly undone: boolean }
export interface OfferRecord {
  readonly told: readonly string[];
  readonly offered: readonly OfferedItem[];
  readonly looked_at: string | null;
  readonly adoptions: readonly Adoption[];
}
type Row = Subject & OfferRecord;
/** `quiet`: the people who turned the Assistant's own project suggestions off, in every project. */
interface State { schema_version: typeof version; rows: readonly Row[]; quiet: readonly string[] }

const unavailable = () => new ActionError("actions.service_unavailable", "项目建议记录暂时读不到，原记录已保留");
const same = (a: Subject, b: Subject) => a.actor === b.actor && a.project === b.project && a.incarnation === b.incarnation;
const ID = /^[a-f0-9]{64}$/, UUID = /^[0-9a-f-]{36}$/, NAME = /^[A-Za-z0-9._:-]{1,200}$/;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
export const EMPTY_OFFER_RECORD: OfferRecord = { told: [], offered: [], looked_at: null, adoptions: [] };

function item(value: unknown): OfferedItem {
  if (!isRecord(value) || !text(value.id, 64) || !ID.test(value.id) || !text(value.title, 200)) throw unavailable();
  if (value.kind === "skill" && text(value.install_id, 200) && NAME.test(value.install_id) && text(value.skill_id, 200) && NAME.test(value.skill_id)
    && text(value.installation_generation, 200)) return { id: value.id, title: value.title, kind: "skill", install_id: value.install_id, skill_id: value.skill_id, installation_generation: value.installation_generation };
  if (value.kind === "connection" && text(value.service_id, 100) && /^[a-z0-9-]+$/.test(value.service_id)) return { id: value.id, title: value.title, kind: "connection", service_id: value.service_id };
  throw unavailable();
}

function adoption(value: unknown): Adoption {
  if (!isRecord(value) || !text(value.adoption_id, 36) || !UUID.test(value.adoption_id) || !text(value.at, 40) || !Array.isArray(value.skills)
    || value.skills.length > AUTOMATION_OFFER_LIMIT || typeof value.undone !== "boolean") throw unavailable();
  const skills = value.skills.map(row => {
    if (!isRecord(row) || !text(row.install_id, 200) || !text(row.skill_id, 200) || !text(row.title, 200) || !Number.isSafeInteger(row.revision)) throw unavailable();
    return { install_id: row.install_id, skill_id: row.skill_id, title: row.title, revision: row.revision as number };
  });
  return { adoption_id: value.adoption_id, at: value.at, skills, undone: value.undone };
}

function parse(value: unknown): State {
  if (!isRecord(value) || value.schema_version !== version || !Array.isArray(value.rows) || value.rows.length > MAX_ROWS
    || !Array.isArray(value.quiet) || value.quiet.length > 100 || value.quiet.some(actor => !text(actor, 200))) throw unavailable();
  const rows: Row[] = [];
  for (const row of value.rows) {
    if (!isRecord(row) || !text(row.actor, 200) || !text(row.project, 200) || !text(row.incarnation, 1000) || !Array.isArray(row.told) || row.told.length > MAX_TOLD
      || row.told.some(id => typeof id !== "string" || !ID.test(id)) || !Array.isArray(row.offered) || row.offered.length > AUTOMATION_OFFER_LIMIT
      || !(row.looked_at === null || text(row.looked_at, 40)) || !Array.isArray(row.adoptions) || row.adoptions.length > MAX_ADOPTIONS) throw unavailable();
    const current: Row = { actor: row.actor, project: row.project, incarnation: row.incarnation, told: [...new Set(row.told as string[])],
      offered: row.offered.map(item), looked_at: row.looked_at as string | null, adoptions: row.adoptions.map(adoption) };
    if (rows.some(previous => same(previous, current))) throw unavailable();
    rows.push(current);
  }
  return { schema_version: version, rows, quiet: [...new Set(value.quiet as string[])] };
}

export const AUTOMATION_OFFERS_FILE: VersionedFile<State> = { version, field: "schema_version", upgrades: [], parse };

export function readOfferRecord(home: string, subject: Subject): OfferRecord {
  const result = readVersionedFile(AUTOMATION_OFFERS_FILE, join(home, AUTOMATION_OFFERS_PATH), home);
  if (result.status === "absent") return EMPTY_OFFER_RECORD;
  if (result.status !== "current") throw unavailable();
  const row = result.value.rows.find(candidate => same(candidate, subject));
  return row ? { told: row.told, offered: row.offered, looked_at: row.looked_at, adoptions: row.adoptions } : EMPTY_OFFER_RECORD;
}

function documentOf(home: string) {
  const directory = join(home, "config"), homePath = realpathSync(home);
  return createAtomicFileDocument(join(home, AUTOMATION_OFFERS_PATH), () => {
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(directory) !== join(homePath, "config"))) throw unavailable();
  });
}

/**
 * Change one project's record, compare-and-set against what was read: `change` sees the record as it is now and returns the next one
 * (the same object for no change). Throws a conflict after a few lost races.
 */
export function changeOfferRecord<T>(home: string, subject: Subject, change: (record: OfferRecord) => { next: OfferRecord; result: T }, assertCurrent: () => void = () => undefined): T {
  const document = documentOf(home);
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = document.read();
    let state: State;
    try { state = raw === null ? { schema_version: version, rows: [], quiet: [] } : parse(JSON.parse(raw)); }
    catch { throw unavailable(); }
    const current = state.rows.find(row => same(row, subject));
    const record = current ? { told: current.told, offered: current.offered, looked_at: current.looked_at, adoptions: current.adoptions } : EMPTY_OFFER_RECORD;
    const { next, result } = change(record);
    if (next === record) return result;
    const row: Row = { ...subject, told: next.told.slice(-MAX_TOLD), offered: next.offered, looked_at: next.looked_at, adoptions: next.adoptions.slice(-MAX_ADOPTIONS) };
    const written = parse({ ...state, rows: [...state.rows.filter(candidate => !same(candidate, subject)), row] });
    if (document.compareAndSetChecked(raw, JSON.stringify(written) + "\n", () => { requireSynchronous(assertCurrent()); })) return result;
  }
  throw new ActionError("actions.conflict", "建议记录正在更新，请稍后再试");
}

/** Whether this person turned the Assistant's own project suggestions off. */
export function offersQuiet(home: string, actor: string): boolean {
  const result = readVersionedFile(AUTOMATION_OFFERS_FILE, join(home, AUTOMATION_OFFERS_PATH), home);
  if (result.status === "absent") return false;
  if (result.status !== "current") throw unavailable();
  return result.value.quiet.includes(actor);
}

export function setOffersQuiet(home: string, actor: string, quiet: boolean, assertCurrent: () => void = () => undefined): void {
  const document = documentOf(home);
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = document.read();
    let state: State;
    try { state = raw === null ? { schema_version: version, rows: [], quiet: [] } : parse(JSON.parse(raw)); }
    catch { throw unavailable(); }
    if (state.quiet.includes(actor) === quiet) return;
    const next = parse({ ...state, quiet: quiet ? [...state.quiet, actor] : state.quiet.filter(row => row !== actor) });
    if (document.compareAndSetChecked(raw, JSON.stringify(next) + "\n", () => { requireSynchronous(assertCurrent()); })) return;
  }
  throw new ActionError("actions.conflict", "建议设置正在更新，请稍后再试");
}

/** A project deleted: its records go with it. */
export function forgetAutomationOffers(home: string, project: string): void {
  const document = documentOf(home);
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = document.read();
    if (raw === null) return;
    let state: State;
    try { state = parse(JSON.parse(raw)); } catch { throw unavailable(); }
    const rows = state.rows.filter(row => row.project !== project);
    if (rows.length === state.rows.length) return;
    if (document.compareAndSetChecked(raw, JSON.stringify({ ...state, rows }) + "\n", () => undefined)) return;
  }
  throw new ActionError("actions.conflict", "建议记录正在更新，请稍后再试");
}
