import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveConfiguredHome } from "./product-home.js";

/**
 * What the project chooser remembers about each project on this machine: when it was last opened (its order, and which
 * one is preselected) and the sentence that introduced it. Presentation memory only: it never gates anything and holds
 * no project fact. A project that cannot be found here simply has never been opened from this Home.
 */
export const PROJECT_ARRIVAL_RELATIVE_PATH = path.join("config", "project-arrival.json");

export interface ProjectArrivalRecord {
  last_opened_at: string | null;
  /** The sentence the person accepted when the project was made from their materials (the first paragraph of the summary they kept). */
  description: string | null;
}

export interface ProjectArrivalState {
  schema_version: 1;
  last_project_id: string | null;
  projects: Record<string, ProjectArrivalRecord>;
}

const EMPTY: ProjectArrivalState = Object.freeze({ schema_version: 1, last_project_id: null, projects: {} });
/** A reload of the project page is not a new visit: opens closer together than this keep the first stamp. */
const REOPEN_WINDOW_MS = 5_000;
const MAX_DESCRIPTION = 240;
const MAX_PROJECTS = 2_000;

function statePath(homeDirectory?: string): string {
  return path.join(path.resolve(homeDirectory ?? resolveConfiguredHome()), PROJECT_ARRIVAL_RELATIVE_PATH);
}

function instant(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function normalize(value: unknown): ProjectArrivalState {
  if (!value || typeof value !== "object") return { ...EMPTY, projects: {} };
  const record = value as Record<string, unknown>;
  const projects: Record<string, ProjectArrivalRecord> = {};
  if (record.projects && typeof record.projects === "object") {
    for (const [id, entry] of Object.entries(record.projects as Record<string, unknown>).slice(0, MAX_PROJECTS)) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const description = typeof item.description === "string" && item.description.trim() ? item.description.trim().slice(0, MAX_DESCRIPTION) : null;
      projects[id] = { last_opened_at: instant(item.last_opened_at), description };
    }
  }
  return { schema_version: 1, last_project_id: typeof record.last_project_id === "string" && record.last_project_id ? record.last_project_id : null, projects };
}

export function readProjectArrival(homeDirectory?: string): ProjectArrivalState {
  try {
    return normalize(JSON.parse(readFileSync(statePath(homeDirectory), "utf8")));
  } catch {
    return { ...EMPTY, projects: {} };
  }
}

function write(homeDirectory: string | undefined, state: ProjectArrivalState): void {
  const target = statePath(homeDirectory);
  mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.${process.pid}.tmp`;
  writeFileSync(staging, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(staging, target);
}

/** A project was opened. Best effort: a failure to remember never gets in the way of opening. */
export function markProjectOpened(homeDirectory: string | undefined, projectId: string, now: Date = new Date()): void {
  try {
    const state = readProjectArrival(homeDirectory);
    const previous = state.projects[projectId];
    const last = previous?.last_opened_at ? Date.parse(previous.last_opened_at) : 0;
    if (state.last_project_id === projectId && now.getTime() - last < REOPEN_WINDOW_MS) return;
    state.projects[projectId] = { description: previous?.description ?? null, last_opened_at: now.toISOString() };
    state.last_project_id = projectId;
    write(homeDirectory, state);
  } catch {
    // Presentation memory only.
  }
}

/** The first paragraph of a summary that says something (a heading is a title, not a description), flattened to one sentence a chooser row can carry. */
export function descriptionFromSummary(summary: string): string | null {
  const paragraph = summary.split(/\n\s*\n/u)
    .map(part => part.split("\n").filter(line => !/^\s*#{1,6}\s/u.test(line)).join(" ").replace(/\*\*([^*]+)\*\*/gu, "$1").replace(/\s+/gu, " ").trim())
    .find(part => part.length > 0);
  if (!paragraph) return null;
  return paragraph.length > MAX_DESCRIPTION ? `${paragraph.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : paragraph;
}

/** The sentence that introduces a project, kept when its summary is accepted. Best effort, like the rest. */
export function setProjectDescription(homeDirectory: string | undefined, projectId: string, description: string | null): void {
  try {
    const state = readProjectArrival(homeDirectory);
    const previous = state.projects[projectId];
    state.projects[projectId] = { last_opened_at: previous?.last_opened_at ?? null, description: description?.trim() ? description.trim().slice(0, MAX_DESCRIPTION) : null };
    write(homeDirectory, state);
  } catch {
    // Presentation memory only.
  }
}

/** A project that no longer exists leaves no memory behind. */
export function forgetProjectArrival(homeDirectory: string | undefined, projectId: string): void {
  try {
    const state = readProjectArrival(homeDirectory);
    if (!(projectId in state.projects) && state.last_project_id !== projectId) return;
    delete state.projects[projectId];
    if (state.last_project_id === projectId) state.last_project_id = null;
    write(homeDirectory, state);
  } catch {
    // Presentation memory only.
  }
}
